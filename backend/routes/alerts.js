const { Router } = require('express');
const pool       = require('../db/pool');
const { requireAuth }          = require('../middleware/auth');
const { requireRole, WRITER_ROLES } = require('../middleware/rbac');
const sgMail     = require('@sendgrid/mail');

const router = Router();

// ---------------------------------------------------------------------------
// Trigger definitions
// ---------------------------------------------------------------------------

const EVENT_TRIGGERS = new Set([
  'hire_request_submitted',
  'hire_request_approved',
  'hire_request_final_approved',
  'hire_request_rejected',
  'position_filled',
  'person_added',
  'person_updated',
  'cycle_stage_changed',
  'change_request_submitted',
  'change_request_approved',
  'change_request_rejected',
]);

// ---------------------------------------------------------------------------
// Template token substitution
// ---------------------------------------------------------------------------

function renderTemplate(template, context) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    if (val === null || val === undefined) return '';
    return String(val);
  });
}

// ---------------------------------------------------------------------------
// Resolve recipients from all modes
// ---------------------------------------------------------------------------

async function resolveRecipients(alert, eventContext = {}) {
  const byId    = [];
  const byRole  = [];
  const byCtx   = [];

  if (alert.recipient_ids?.length) {
    const { rows } = await pool.query(
      `SELECT id, name, email FROM people
       WHERE id = ANY($1) AND email IS NOT NULL AND email <> '' AND is_active = TRUE`,
      [alert.recipient_ids]
    );
    byId.push(...rows);
  }

  if (alert.recipient_role_groups?.length) {
    const { rows } = await pool.query(
      `SELECT id, name, email FROM users
       WHERE (role = ANY($1) OR system_profile = ANY($1))
         AND email IS NOT NULL AND email <> '' AND is_active = TRUE`,
      [alert.recipient_role_groups]
    );
    byRole.push(...rows);
  }

  if (alert.recipient_context?.length) {
    for (const ctx of alert.recipient_context) {
      if (ctx === 'submitter' && eventContext.submitter_email) {
        byCtx.push({ id: null, name: eventContext.submitter_name || 'Submitter', email: eventContext.submitter_email });
      }
      if (ctx === 'manager' && eventContext.manager_email) {
        byCtx.push({ id: null, name: eventContext.manager_name || 'Manager', email: eventContext.manager_email });
      }
      // Resolve hiring manager by name lookup in people table
      if (ctx === 'hiring_manager' && eventContext.hiring_manager_name) {
        const { rows: hm } = await pool.query(
          `SELECT id, name, email FROM people
           WHERE name = $1 AND email IS NOT NULL AND email <> '' AND is_active = TRUE LIMIT 1`,
          [eventContext.hiring_manager_name]
        );
        if (hm[0]) byCtx.push(hm[0]);
      }
      // Resolve dept head / dept lead by name lookup in people table
      if (ctx === 'dept_lead' && eventContext.dept_head_name) {
        const { rows: dl } = await pool.query(
          `SELECT id, name, email FROM people
           WHERE name = $1 AND email IS NOT NULL AND email <> '' AND is_active = TRUE LIMIT 1`,
          [eventContext.dept_head_name]
        );
        if (dl[0]) byCtx.push(dl[0]);
      }
      // Notify the person who approved (for approved/rejected events)
      if (ctx === 'approver' && eventContext.approver_email) {
        byCtx.push({ id: null, name: eventContext.approver_name || 'Approver', email: eventContext.approver_email });
      }
    }
  }

  // Deduplicate by email
  const seen = new Set();
  return [...byId, ...byRole, ...byCtx].filter(r => {
    if (!r.email || seen.has(r.email.toLowerCase())) return false;
    seen.add(r.email.toLowerCase());
    return true;
  });
}

// ---------------------------------------------------------------------------
// Email delivery
// ---------------------------------------------------------------------------

async function sendAlertEmails(alert, recipients, triggerResult, eventContext = {}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from   = process.env.SENDGRID_FROM || 'noreply@equinix.com';
  if (!apiKey || !recipients.length) return false;

  sgMail.setApiKey(apiKey);

  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const recordLines = (triggerResult.records || []).slice(0, 10).map(r => {
    if (alert.trigger_type === 'overdue_role')
      return `- ${r.tbh_id}: ${r.days_overdue} days overdue (${r.region_name || 'N/A'})`;
    if (alert.trigger_type === 'upcoming_starter')
      return `- ${r.candidate_name || r.tbh_id}: starts ${r.confirmed_start_date} (${r.region_name || 'N/A'})`;
    if (alert.trigger_type === 'utilisation_above' || alert.trigger_type === 'utilisation_below')
      return `- ${r.name}: ${r.util_pct}% utilisation`;
    if (alert.trigger_type === 'unallocated_people')
      return `- ${r.name} (${r.contracted_fte} FTE contracted, unallocated)`;
    if (alert.trigger_type === 'cycle_days_remaining')
      return `- ${r.name}: ${r.days_remaining} days remaining`;
    return '';
  }).filter(Boolean).join('\n');

  const templateContext = {
    alert_name:  alert.name,
    triggered_at: now,
    count:       triggerResult.count,
    record_list: recordLines,
    ...eventContext,
  };

  const renderedMessage = renderTemplate(alert.message_template, templateContext)
    || `[GDC Alert] ${alert.name} has been triggered.`;

  const subjectTpl = alert.trigger_config?.subject_template || '';
  const renderedSubject = subjectTpl
    ? renderTemplate(subjectTpl, templateContext)
    : `[GDC Alert] ${alert.name}`;

  const lines = [
    renderedMessage,
    '',
    triggerResult.count > 1 ? `Total records matched: ${triggerResult.count}` : '',
    recordLines,
    '',
    '---',
    'GDC Workforce Planner - Automated Alert',
  ].filter(l => l !== undefined).join('\n');

  try {
    await Promise.all(recipients.map(r =>
      sgMail.send({ to: r.email, from, subject: renderedSubject, text: lines })
    ));
    return true;
  } catch (err) {
    console.error('SendGrid send error:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Evaluate threshold triggers
// ---------------------------------------------------------------------------

async function evaluateTrigger(alert) {
  const { trigger_type, trigger_value, trigger_config = {} } = alert;
  const N = Number(trigger_config.value ?? trigger_value ?? 0);

  // ── Event-based: not evaluated by polling ────────────────────────────────
  if (EVENT_TRIGGERS.has(trigger_type)) {
    return { triggered: false, count: 0, records: [], note: 'Event-based trigger fires automatically when the event occurs.' };
  }

  // ── Threshold triggers ────────────────────────────────────────────────────
  if (trigger_type === 'overdue_role') {
    const { rows } = await pool.query(`
      SELECT t.tbh_id, t.req_status, t.estimated_hire_date::text,
             (CURRENT_DATE - t.estimated_hire_date)::int AS days_overdue,
             r.name AS region_name
      FROM   tbh_codes t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE  t.estimated_hire_date IS NOT NULL
        AND  t.estimated_hire_date < CURRENT_DATE - ($1 * INTERVAL '1 day')
        AND  (t.req_status IS NULL OR t.req_status NOT IN ('Filled', 'Cancelled'))
      ORDER  BY t.estimated_hire_date ASC LIMIT 50
    `, [N]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  if (trigger_type === 'open_roles_above') {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS count FROM tbh_codes
      WHERE req_status IS NULL OR req_status NOT IN ('Filled', 'Cancelled')
    `);
    const count = rows[0].count;
    return { triggered: count > N, count, records: [] };
  }

  if (trigger_type === 'upcoming_starter') {
    const { rows } = await pool.query(`
      SELECT t.tbh_id, t.confirmed_start_date::text, t.req_status,
             r.name AS region_name, t.candidate_name
      FROM   tbh_codes t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE  t.confirmed_start_date IS NOT NULL
        AND  t.confirmed_start_date BETWEEN CURRENT_DATE
         AND CURRENT_DATE + ($1 * INTERVAL '1 day')
      ORDER  BY t.confirmed_start_date ASC LIMIT 50
    `, [N]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  if (trigger_type === 'utilisation_above') {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.contracted_fte,
             COALESCE(SUM(a.fte_value), 0) AS allocated_fte,
             ROUND((COALESCE(SUM(a.fte_value), 0) / NULLIF(p.contracted_fte, 0) * 100)::numeric, 1) AS util_pct
      FROM   people p
      LEFT JOIN allocations a ON a.person_id = p.id
        AND a.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      WHERE  p.is_active = TRUE
      GROUP  BY p.id, p.name, p.contracted_fte
      HAVING (COALESCE(SUM(a.fte_value), 0) / NULLIF(p.contracted_fte, 0) * 100) > $1
      ORDER  BY util_pct DESC LIMIT 50
    `, [N]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  if (trigger_type === 'utilisation_below') {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.contracted_fte,
             COALESCE(SUM(a.fte_value), 0) AS allocated_fte,
             ROUND((COALESCE(SUM(a.fte_value), 0) / NULLIF(p.contracted_fte, 0) * 100)::numeric, 1) AS util_pct
      FROM   people p
      LEFT JOIN allocations a ON a.person_id = p.id
        AND a.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      WHERE  p.is_active = TRUE
      GROUP  BY p.id, p.name, p.contracted_fte
      HAVING (COALESCE(SUM(a.fte_value), 0) / NULLIF(p.contracted_fte, 0) * 100) < $1
      ORDER  BY util_pct ASC LIMIT 50
    `, [N]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  if (trigger_type === 'unallocated_people') {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.contracted_fte
      FROM   people p
      WHERE  p.is_active = TRUE
        AND  NOT EXISTS (
          SELECT 1 FROM allocations a
          WHERE  a.person_id = p.id
            AND  a.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            AND  a.fte_value > 0
        )
      LIMIT 50
    `);
    return { triggered: rows.length > N, count: rows.length, records: rows };
  }

  if (trigger_type === 'cycle_days_remaining') {
    const { rows } = await pool.query(`
      SELECT id, name, end_date::text,
             (end_date - CURRENT_DATE)::int AS days_remaining
      FROM   planning_cycles
      WHERE  is_active = TRUE
        AND  end_date IS NOT NULL
        AND  (end_date - CURRENT_DATE)::int BETWEEN 0 AND $1
      ORDER  BY end_date ASC
    `, [N]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  return { triggered: false, count: 0, records: [] };
}

// ---------------------------------------------------------------------------
// Fire event-based alerts — called from other routes
// ---------------------------------------------------------------------------

async function fireEventAlerts(eventType, eventContext = {}) {
  let alerts;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM alerts WHERE trigger_type = $1 AND active = TRUE',
      [eventType]
    );
    alerts = rows;
  } catch (err) {
    console.error(`fireEventAlerts: query failed for ${eventType}:`, err.message);
    return;
  }

  for (const alert of alerts) {
    try {
      const recipients = await resolveRecipients(alert, eventContext);
      if (!recipients.length) continue;

      const triggerResult = { triggered: true, count: 1, records: [eventContext] };
      const emailSent = await sendAlertEmails(alert, recipients, triggerResult, eventContext);

      await pool.query(
        `INSERT INTO alert_logs (alert_id, trigger_data, recipients_notified, email_sent)
         VALUES ($1, $2, $3, $4)`,
        [
          alert.id,
          JSON.stringify({ count: 1, records: [eventContext] }),
          JSON.stringify(recipients.map(r => ({ id: r.id, name: r.name, email: r.email }))),
          emailSent,
        ]
      );
      await pool.query('UPDATE alerts SET last_triggered = NOW() WHERE id = $1', [alert.id]);
    } catch (err) {
      console.error(`fireEventAlerts: failed for alert ${alert.id} (${eventType}):`, err.message);
    }
  }
}

module.exports.fireEventAlerts = fireEventAlerts;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get('/logs', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT al.id, al.alert_id, al.triggered_at, al.trigger_data,
           al.recipients_notified, al.email_sent, al.error_message,
           a.name AS alert_name, a.trigger_type
    FROM   alert_logs al
    JOIN   alerts a ON al.alert_id = a.id
    ORDER  BY al.triggered_at DESC
    LIMIT  100
  `);
  res.json({ data: rows });
});

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.*,
      (
        SELECT COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email)), '[]'::json)
        FROM   people p
        WHERE  p.id = ANY(a.recipient_ids)
      ) AS recipients
    FROM alerts a
    ORDER BY a.created_at DESC
  `);
  res.json({ data: rows });
});

router.post('/', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const {
    name, trigger_type, trigger_value = 0, trigger_config = {},
    message_template = '', recipient_ids = [],
    recipient_role_groups = [], recipient_context = [], active = true,
  } = req.body;
  if (!name?.trim() || !trigger_type) return res.status(400).json({ error: 'name and trigger_type are required' });

  const { rows } = await pool.query(`
    INSERT INTO alerts
      (name, trigger_type, trigger_value, trigger_config, message_template,
       recipient_ids, recipient_role_groups, recipient_context, active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    name.trim(), trigger_type, trigger_value, trigger_config,
    message_template, recipient_ids, recipient_role_groups, recipient_context, active,
  ]);
  res.status(201).json({ data: rows[0] });
});

router.put('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const {
    name, trigger_type, trigger_value, trigger_config,
    message_template, recipient_ids, recipient_role_groups, recipient_context, active,
  } = req.body;
  const sets = []; const params = []; let i = 1;

  if (name                !== undefined) { sets.push(`name = $${i++}`);                 params.push(name); }
  if (trigger_type        !== undefined) { sets.push(`trigger_type = $${i++}`);         params.push(trigger_type); }
  if (trigger_value       !== undefined) { sets.push(`trigger_value = $${i++}`);        params.push(trigger_value); }
  if (trigger_config      !== undefined) { sets.push(`trigger_config = $${i++}`);       params.push(trigger_config); }
  if (message_template    !== undefined) { sets.push(`message_template = $${i++}`);     params.push(message_template); }
  if (recipient_ids       !== undefined) { sets.push(`recipient_ids = $${i++}`);        params.push(recipient_ids); }
  if (recipient_role_groups !== undefined) { sets.push(`recipient_role_groups = $${i++}`); params.push(recipient_role_groups); }
  if (recipient_context   !== undefined) { sets.push(`recipient_context = $${i++}`);   params.push(recipient_context); }
  if (active              !== undefined) { sets.push(`active = $${i++}`);               params.push(active); }
  sets.push('updated_at = NOW()');

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE alerts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
  res.json({ data: rows[0] });
});

router.delete('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM alerts WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
  res.json({ data: { deleted: true } });
});

router.post('/:id/evaluate', requireAuth, async (req, res) => {
  const { rows: aRows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [req.params.id]);
  if (!aRows.length) return res.status(404).json({ error: 'Alert not found' });
  const alert = aRows[0];

  const triggerResult = await evaluateTrigger(alert);

  let emailSent = false;
  let recipients = [];

  if (triggerResult.triggered && alert.active) {
    recipients = await resolveRecipients(alert, {});
    emailSent = await sendAlertEmails(alert, recipients, triggerResult, {});

    await pool.query(
      `INSERT INTO alert_logs (alert_id, trigger_data, recipients_notified, email_sent)
       VALUES ($1, $2, $3, $4)`,
      [
        alert.id,
        JSON.stringify({ count: triggerResult.count, records: triggerResult.records }),
        JSON.stringify(recipients.map(r => ({ id: r.id, name: r.name, email: r.email }))),
        emailSent,
      ]
    );
    await pool.query('UPDATE alerts SET last_triggered = NOW() WHERE id = $1', [alert.id]);
  }

  res.json({
    data: {
      triggered:        triggerResult.triggered,
      count:            triggerResult.count,
      records:          triggerResult.records,
      note:             triggerResult.note,
      email_sent:       emailSent,
      recipients_found: recipients.length,
    },
  });
});

module.exports = router;
module.exports.fireEventAlerts = fireEventAlerts;
