const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ALL_ROLES, ROLES } = require('../middleware/rbac');
const { fireEventAlerts } = require('./alerts');

const router = Router();

// Full SELECT — includes the 8 columns added by startup migration
const SELECT_FULL = `
  cr.id, cr.change_type, cr.status, cr.auto_approved,
  cr.current_manager, cr.new_manager, cr.new_metro_location,
  cr.justification, cr.approval_type, cr.senior_approver, cr.senior_approver_status,
  cr.xscale_vs_retail, cr.requestor_email, cr.comments, cr.reviewer_notes,
  cr.is_borrowed_or_repurposed, cr.rejection_reason,
  cr.new_tbh_code_assigned, cr.finance_notified_at, cr.created_at, cr.approved_at,
  t.tbh_id,
  r.name  AS new_region_name,
  c.name  AS new_country_name,
  l.level_name AS new_level_name,
  u.name  AS submitted_by_name,
  u.email AS submitted_by_email,
  au.name AS approved_by_name
FROM change_requests cr
LEFT JOIN tbh_codes t  ON cr.tbh_code_id  = t.id
LEFT JOIN regions   r  ON cr.new_region_id = r.id
LEFT JOIN countries c  ON cr.new_country_id = c.id
LEFT JOIN levels    l  ON cr.new_level_id  = l.id
LEFT JOIN users     u  ON cr.submitted_by  = u.id
LEFT JOIN users     au ON cr.approved_by   = au.id`;

// Fallback SELECT — only columns that exist in the original schema
const SELECT_CORE = `
  cr.id, cr.change_type, cr.status, cr.auto_approved,
  cr.current_manager, cr.new_manager,
  cr.justification,
  cr.is_borrowed_or_repurposed, cr.rejection_reason,
  cr.new_tbh_code_assigned, cr.finance_notified_at, cr.created_at, cr.approved_at,
  t.tbh_id,
  r.name  AS new_region_name,
  c.name  AS new_country_name,
  l.level_name AS new_level_name,
  u.name  AS submitted_by_name,
  u.email AS submitted_by_email,
  au.name AS approved_by_name
FROM change_requests cr
LEFT JOIN tbh_codes t  ON cr.tbh_code_id  = t.id
LEFT JOIN regions   r  ON cr.new_region_id = r.id
LEFT JOIN countries c  ON cr.new_country_id = c.id
LEFT JOIN levels    l  ON cr.new_level_id  = l.id
LEFT JOIN users     u  ON cr.submitted_by  = u.id
LEFT JOIN users     au ON cr.approved_by   = au.id`;

async function selectRows(selectCols, suffix, params) {
  try {
    const { rows } = await pool.query(`SELECT ${selectCols} ${suffix}`, params);
    return rows;
  } catch (err) {
    if (err.code === '42703') {
      // "column does not exist" — migration hasn't run yet, fall back to core columns
      console.warn('[change-requests] falling back to core columns:', err.message);
      const { rows } = await pool.query(`SELECT ${SELECT_CORE} ${suffix}`, params);
      return rows;
    }
    throw err;
  }
}


router.get('/', requireAuth, async (req, res) => {
  const { status, change_type, submitted_by, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (status)       { conditions.push(`cr.status = $${i++}`);       params.push(status); }
  if (change_type)  { conditions.push(`cr.change_type = $${i++}`);  params.push(change_type); }
  if (submitted_by) { conditions.push(`cr.submitted_by = $${i++}`); params.push(parseInt(submitted_by, 10)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const rows = await selectRows(
    SELECT_FULL,
    `${where} ORDER BY cr.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  const rows = await selectRows(SELECT_FULL, `WHERE cr.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Change request not found' });
  res.json({ data: rows[0] });
});

router.post('/', requireAuth, requireRole(...ALL_ROLES), async (req, res) => {
  const {
    tbh_code_id, change_type,
    current_manager, new_manager, new_metro_location,
    new_region_id, new_country_id, new_level_id,
    is_borrowed_or_repurposed, justification,
    approval_type, senior_approver, xscale_vs_retail,
    requestor_email, comments,
  } = req.body;

  if (!change_type) return res.status(400).json({ error: 'change_type is required' });

  const { rows: rules } = await pool.query(
    'SELECT auto_approve FROM change_request_rules WHERE change_type = $1',
    [change_type]
  );
  const autoApprove = rules.length ? rules[0].auto_approve : false;
  const status = autoApprove ? 'Auto-Approved' : 'Pending';

  const { rows } = await pool.query(
    `INSERT INTO change_requests (
       tbh_code_id, change_type,
       current_manager, new_manager, new_metro_location,
       new_region_id, new_country_id, new_level_id,
       is_borrowed_or_repurposed, justification,
       approval_type, senior_approver, senior_approver_status,
       xscale_vs_retail, requestor_email, comments,
       status, auto_approved, submitted_by, approved_by, approved_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
     ) RETURNING *`,
    [
      tbh_code_id ?? null, change_type,
      current_manager ?? null, new_manager ?? null, new_metro_location ?? null,
      new_region_id ?? null, new_country_id ?? null, new_level_id ?? null,
      is_borrowed_or_repurposed ?? null, justification ?? null,
      approval_type ?? null, senior_approver ?? null,
      senior_approver ? 'Pending' : 'N/A',
      xscale_vs_retail ?? null,
      requestor_email ?? req.user.email ?? null,
      comments ?? null,
      status, autoApprove,
      req.user.id,
      autoApprove ? req.user.id : null,
      autoApprove ? new Date() : null,
    ]
  );
  await req.auditLog({ actionType: 'CREATE', resourceType: 'change_request', resourceId: rows[0].id, newValue: rows[0] });
  fireEventAlerts('change_request_submitted', {
    request_id: rows[0].id, change_type: rows[0].change_type,
    submitter_name: req.user.name, submitter_email: req.user.email,
  }).catch(() => {});
  res.status(201).json({ data: rows[0] });
});

router.post('/:id/approve', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { reviewer_notes, new_tbh_code_assigned, senior_approver_status } = req.body;
  const { rows } = await pool.query(
    `UPDATE change_requests
     SET status = 'Approved', approved_by = $1, approved_at = NOW(),
         reviewer_notes = COALESCE($3, reviewer_notes),
         new_tbh_code_assigned = COALESCE($4, new_tbh_code_assigned),
         senior_approver_status = COALESCE($5, senior_approver_status)
     WHERE id = $2 AND status = 'Pending'
     RETURNING *`,
    [req.user.id, req.params.id, reviewer_notes ?? null, new_tbh_code_assigned ?? null, senior_approver_status ?? null]
  );
  if (!rows.length) return res.status(404).json({ error: 'Change request not found or not pending' });
  await req.auditLog({ actionType: 'APPROVE', resourceType: 'change_request', resourceId: rows[0].id, newValue: rows[0] });
  fireEventAlerts('change_request_approved', {
    request_id: rows[0].id, change_type: rows[0].change_type,
    approver_name: req.user.name,
  }).catch(() => {});
  res.json({ data: rows[0] });
});

router.post('/:id/reject', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { rejection_reason, reviewer_notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE change_requests
     SET status = 'Rejected',
         rejection_reason = $1,
         reviewer_notes = COALESCE($3, reviewer_notes)
     WHERE id = $2 AND status = 'Pending'
     RETURNING *`,
    [rejection_reason ?? null, req.params.id, reviewer_notes ?? null]
  );
  if (!rows.length) return res.status(404).json({ error: 'Change request not found or not pending' });
  await req.auditLog({ actionType: 'REJECT', resourceType: 'change_request', resourceId: rows[0].id, newValue: rows[0] });
  fireEventAlerts('change_request_rejected', {
    request_id: rows[0].id, change_type: rows[0].change_type,
    rejection_reason: rows[0].rejection_reason, rejector_name: req.user.name,
  }).catch(() => {});
  res.json({ data: rows[0] });
});

module.exports = router;
