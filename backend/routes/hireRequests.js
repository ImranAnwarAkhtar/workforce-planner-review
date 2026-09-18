const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ALL_ROLES, ROLES, SENIOR_ROLES } = require('../middleware/rbac');
const { writeAudit } = require('../db/auditLog');

const router = Router();

const STAGE2_ROLES = [ROLES.PMO, ROLES.HEAD_OF_DEPARTMENT, ROLES.DEPARTMENT_LEAD, ROLES.FUNCTION_LEAD];
const STAGE3_ROLES = [ROLES.PMO, ROLES.HEAD_OF_COMMERCIAL, ROLES.EVP];
const STAGE4_ROLES = [ROLES.PMO, ROLES.EVP];

router.get('/', requireAuth, async (req, res) => {
  const { status, stage, submitted_by, region_id, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (status)      { conditions.push(`hr.status = $${i++}`);       params.push(status); }
  if (stage)       { conditions.push(`hr.stage = $${i++}`);        params.push(parseInt(stage, 10)); }
  if (submitted_by){ conditions.push(`hr.submitted_by = $${i++}`); params.push(parseInt(submitted_by, 10)); }
  if (region_id)   { conditions.push(`hr.region_id = $${i++}`);    params.push(parseInt(region_id, 10)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const { rows } = await pool.query(
    `SELECT hr.id, hr.request_type, hr.status, hr.stage, hr.justification, hr.created_at,
            d.name AS discipline_name, l.level_name, ct.code AS contract_type_code,
            r.name AS region_name, c.name AS country_name, p.name AS project_name,
            u.name AS submitted_by_name
     FROM hire_requests hr
     LEFT JOIN disciplines d ON hr.discipline_id = d.id
     LEFT JOIN levels l ON hr.level_id = l.id
     LEFT JOIN contract_types ct ON hr.contract_type_id = ct.id
     LEFT JOIN regions r ON hr.region_id = r.id
     LEFT JOIN countries c ON hr.country_id = c.id
     LEFT JOIN projects p ON hr.project_id = p.id
     LEFT JOIN users u ON hr.submitted_by = u.id
     ${where}
     ORDER BY hr.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT hr.*,
            d.name AS discipline_name, l.level_name, ct.code AS contract_type_code,
            r.name AS region_name, c.name AS country_name, p.name AS project_name,
            su.name AS submitted_by_name,
            s2u.name AS stage2_user_name, s3u.name AS stage3_user_name, s4u.name AS stage4_user_name,
            ru.name AS rejected_by_name
     FROM hire_requests hr
     LEFT JOIN disciplines d ON hr.discipline_id = d.id
     LEFT JOIN levels l ON hr.level_id = l.id
     LEFT JOIN contract_types ct ON hr.contract_type_id = ct.id
     LEFT JOIN regions r ON hr.region_id = r.id
     LEFT JOIN countries c ON hr.country_id = c.id
     LEFT JOIN projects p ON hr.project_id = p.id
     LEFT JOIN users su ON hr.submitted_by = su.id
     LEFT JOIN users s2u ON hr.stage2_user_id = s2u.id
     LEFT JOIN users s3u ON hr.stage3_user_id = s3u.id
     LEFT JOIN users s4u ON hr.stage4_user_id = s4u.id
     LEFT JOIN users ru ON hr.rejected_by = ru.id
     WHERE hr.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Hire request not found' });
  res.json({ data: rows[0] });
});

router.post('/', requireAuth, requireRole(...ALL_ROLES), async (req, res) => {
  const { request_type, discipline_id, level_id, contract_type_id, region_id, country_id, project_id, justification } = req.body;
  if (!request_type) return res.status(400).json({ error: 'request_type is required' });

  const { rows } = await pool.query(
    `INSERT INTO hire_requests
       (request_type, discipline_id, level_id, contract_type_id, region_id, country_id, project_id, justification, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [request_type, discipline_id ?? null, level_id ?? null, contract_type_id ?? null,
     region_id ?? null, country_id ?? null, project_id ?? null, justification ?? null, req.user.id]
  );
  await req.auditLog({ actionType: 'CREATE', resourceType: 'hire_request', resourceId: rows[0].id, newValue: rows[0] });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'CREATE', tableName: 'hire_requests', recordId: rows[0].id, newValues: rows[0], ipAddress: req.ip });
  res.status(201).json({ data: rows[0] });
});

router.post('/:id/approve', requireAuth, async (req, res, next) => {
  const { rows: current } = await pool.query('SELECT * FROM hire_requests WHERE id = $1', [req.params.id]);
  if (!current.length) return res.status(404).json({ error: 'Hire request not found' });

  const hr = current[0];
  if (hr.status !== 'Pending') return res.status(409).json({ error: 'Request is not pending' });

  const stageRoles = { 1: STAGE2_ROLES, 2: STAGE3_ROLES, 3: STAGE4_ROLES };
  const allowed = stageRoles[hr.stage];
  if (!allowed) return res.status(409).json({ error: 'Request is already fully approved' });
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions for this stage' });

  const nextStage = hr.stage + 1;
  const isFullyApproved = nextStage > 4;
  const userCol = `stage${hr.stage + 1}_user_id`;
  const timeCol = `stage${hr.stage + 1}_approved_at`;

  let updateSql;
  if (isFullyApproved) {
    updateSql = `UPDATE hire_requests SET stage = $1, status = 'Approved', ${userCol} = $2, ${timeCol} = NOW() WHERE id = $3 RETURNING *`;
  } else {
    updateSql = `UPDATE hire_requests SET stage = $1, ${userCol} = $2, ${timeCol} = NOW() WHERE id = $3 RETURNING *`;
  }

  const { rows } = await pool.query(updateSql, [nextStage, req.user.id, req.params.id]);
  await req.auditLog({ actionType: 'APPROVE', resourceType: 'hire_request', resourceId: rows[0].id, newValue: rows[0] });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'APPROVE', tableName: 'hire_requests', recordId: rows[0].id, newValues: { stage: rows[0].stage, status: rows[0].status }, ipAddress: req.ip });
  res.json({ data: rows[0] });
});

router.post('/:id/reject', requireAuth, requireRole(...SENIOR_ROLES), async (req, res) => {
  const { rejection_reason } = req.body;
  const { rows } = await pool.query(
    `UPDATE hire_requests
     SET status = 'Rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
     WHERE id = $3 AND status = 'Pending'
     RETURNING *`,
    [req.user.id, rejection_reason ?? null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Hire request not found or not pending' });
  await req.auditLog({ actionType: 'REJECT', resourceType: 'hire_request', resourceId: rows[0].id, newValue: rows[0] });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'REJECT', tableName: 'hire_requests', recordId: rows[0].id, newValues: { status: 'Rejected', rejection_reason }, ipAddress: req.ip });
  res.json({ data: rows[0] });
});

module.exports = router;
