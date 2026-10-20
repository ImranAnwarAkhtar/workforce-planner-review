const { Router } = require('express');
const pool       = require('../db/pool');
const { requireAuth }          = require('../middleware/auth');
const { requireRole, WRITER_ROLES } = require('../middleware/rbac');
const sgMail     = require('@sendgrid/mail');

const router = Router();

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

async function evaluateTrigger(alert) {
  const { trigger_type, trigger_value } = alert;

  if (trigger_type === 'overdue_role') {
    const { rows } = await pool.query(`
      SELECT t.tbh_id, t.req_status, t.estimated_hire_date::text,
             (CURRENT_DATE - t.estimated_hire_date)::int AS days_overdue,
             r.name AS region_name
      FROM   tbh_codes t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE  t.estimated_hire_date IS NOT NULL
        AND  t.estimated_hire_date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
        AND  (t.req_status IS NULL OR t.req_status NOT IN ('Filled', 'Cancelled'))
      ORDER  BY t.estimated_hire_date ASC
      LIMIT  50
    `, [trigger_value]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  if (trigger_type === 'open_roles_above') {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM   tbh_codes
      WHERE  req_status IS NULL OR req_status NOT IN ('Filled', 'Cancelled')
    `);
    const count = rows[0].count;
    return { triggered: count > trigger_value, count, records: [] };
  }

  if (trigger_type === 'upcoming_starter') {
    const { rows } = await pool.query(`
      SELECT t.tbh_id, t.confirmed_start_date::text, t.req_status,
             r.name AS region_name, t.candidate_name
      FROM   tbh_codes t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE  t.confirmed_start_date IS NOT NULL
        AND  t.confirmed_start_date BETWEEN CURRENT_DATE
         AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
      ORDER  BY t.confirmed_start_date ASC
      LIMIT  50
    `, [trigger_value]);
    return { triggered: rows.length > 0, count: rows.length, records: rows };
  }

  return { triggered: false, count: 0, records: [] };
}

// ---------------------------------------------------------------------------
// Email delivery via SendGrid
// ---------------------------------------------------------------------------

async function sendAlertEmails(alert, recipients, triggerResult) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from   = process.env.SENDGRID_FROM || 'noreply@equinix.com';
  if (!apiKey || !recipients.length) return false;

  sgMail.setApiKey(apiKey);

  const recordLines = triggerResult.records.slice(0, 10).map(r => {
    if (alert.trigger_type === 'overdue_role')
      return `• ${r.tbh_id} — ${r.days_overdue} days overdue (${r.region_name || 'N/A'})`;
    if (alert.trigger_type === 'upcoming_starter')
      return `• ${r.candidate_name || r.tbh_id} — starts ${r.confirmed_start_date} (${r.region_name || 'N/A'})`;
    return '';
  }).filter(Boolean).join('\n');

  const body = [
    alert.message_template || 'An alert has been triggered.',
    '',
    `Records matched: ${triggerResult.count}`,
    recordLines,
    '',
    '---',
    'GDC Workforce Planner',
  ].join('\n');

  try {
    await Promise.all(recipients.map(r =>
      sgMail.send({ to: r.email, from, subject: `[GDC Alert] ${alert.name}`, text: body })
    ));
    return true;
  } catch (err) {
    console.error('SendGrid send error:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Routes — /logs must come before /:id to avoid route conflict
// ---------------------------------------------------------------------------

// GET /api/alerts/logs
router.get('/logs', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT al.id, al.alert_id, al.triggered_at, al.trigger_data,
           al.recipients_notified, al.email_sent, al.error_message,
           a.name AS alert_name, a.trigger_type
    FROM   alert_logs al
    JOIN   alerts a ON al.alert_id = a.id
    ORDER  BY al.triggered_at DESC
    LIMIT  50
  `);
  res.json({ data: rows });
});

// GET /api/alerts
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

// POST /api/alerts
router.post('/', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, trigger_type, trigger_value = 0, message_template = '', recipient_ids = [], active = true } = req.body;
  if (!name?.trim() || !trigger_type) return res.status(400).json({ error: 'name and trigger_type are required' });

  const { rows } = await pool.query(`
    INSERT INTO alerts (name, trigger_type, trigger_value, message_template, recipient_ids, active)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [name.trim(), trigger_type, trigger_value, message_template, recipient_ids, active]);

  res.status(201).json({ data: rows[0] });
});

// PUT /api/alerts/:id
router.put('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, trigger_type, trigger_value, message_template, recipient_ids, active } = req.body;
  const sets = []; const params = []; let i = 1;

  if (name             !== undefined) { sets.push(`name = $${i++}`);              params.push(name); }
  if (trigger_type     !== undefined) { sets.push(`trigger_type = $${i++}`);      params.push(trigger_type); }
  if (trigger_value    !== undefined) { sets.push(`trigger_value = $${i++}`);     params.push(trigger_value); }
  if (message_template !== undefined) { sets.push(`message_template = $${i++}`);  params.push(message_template); }
  if (recipient_ids    !== undefined) { sets.push(`recipient_ids = $${i++}`);     params.push(recipient_ids); }
  if (active           !== undefined) { sets.push(`active = $${i++}`);            params.push(active); }
  sets.push('updated_at = NOW()');

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE alerts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
  res.json({ data: rows[0] });
});

// DELETE /api/alerts/:id
router.delete('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM alerts WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
  res.json({ data: { deleted: true } });
});

// POST /api/alerts/:id/evaluate
router.post('/:id/evaluate', requireAuth, async (req, res) => {
  const { rows: aRows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [req.params.id]);
  if (!aRows.length) return res.status(404).json({ error: 'Alert not found' });
  const alert = aRows[0];

  const triggerResult = await evaluateTrigger(alert);

  let emailSent = false;
  let recipients = [];

  if (triggerResult.triggered && alert.active) {
    if (alert.recipient_ids?.length) {
      const { rows: pRows } = await pool.query(
        `SELECT id, name, email FROM people
         WHERE  id = ANY($1) AND email IS NOT NULL AND email <> ''`,
        [alert.recipient_ids]
      );
      recipients = pRows;
      emailSent = await sendAlertEmails(alert, recipients, triggerResult);
    }

    await pool.query(`
      INSERT INTO alert_logs (alert_id, trigger_data, recipients_notified, email_sent)
      VALUES ($1, $2, $3, $4)
    `, [
      alert.id,
      JSON.stringify({ count: triggerResult.count, records: triggerResult.records }),
      JSON.stringify(recipients.map(r => ({ id: r.id, name: r.name, email: r.email }))),
      emailSent,
    ]);

    await pool.query('UPDATE alerts SET last_triggered = NOW() WHERE id = $1', [alert.id]);
  }

  res.json({
    data: {
      triggered:        triggerResult.triggered,
      count:            triggerResult.count,
      records:          triggerResult.records,
      email_sent:       emailSent,
      recipients_found: recipients.length,
    },
  });
});

module.exports = router;
