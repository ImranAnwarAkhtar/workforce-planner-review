const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT gc.id, gc.discipline_id, gc.project_type, gc.min_divisor, gc.max_divisor, gc.updated_at,
            d.name AS discipline_name, u.name AS updated_by_name
     FROM gearing_constants gc
     JOIN disciplines d ON gc.discipline_id = d.id
     LEFT JOIN users u ON gc.updated_by = u.id
     ORDER BY d.name ASC, gc.project_type ASC`
  );
  res.json({ data: rows });
});

router.get('/debug', requireAuth, async (req, res) => {
  const tableExists = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gearing_constants') AS exists`
  ).then(r => r.rows[0].exists).catch(() => false);

  const disciplines = await pool.query('SELECT id, name FROM disciplines ORDER BY name')
    .then(r => r.rows).catch(() => []);

  const constants = tableExists
    ? await pool.query('SELECT COUNT(*) AS count FROM gearing_constants').then(r => r.rows[0].count).catch(() => 'error')
    : 'table missing';

  const sample = tableExists
    ? await pool.query(`
        SELECT d.name AS discipline, gc.project_type, gc.min_divisor, gc.max_divisor
        FROM gearing_constants gc JOIN disciplines d ON gc.discipline_id = d.id
        ORDER BY d.name, gc.project_type LIMIT 20
      `).then(r => r.rows).catch(() => [])
    : [];

  res.json({ gearing_constants_table_exists: tableExists, gearing_constants_count: constants, disciplines, sample });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT gc.*, d.name AS discipline_name
     FROM gearing_constants gc
     JOIN disciplines d ON gc.discipline_id = d.id
     WHERE gc.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Gearing constant not found' });
  res.json({ data: rows[0] });
});

router.put('/:id', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { min_divisor, max_divisor } = req.body;
  if (min_divisor === undefined && max_divisor === undefined) {
    return res.status(400).json({ error: 'min_divisor or max_divisor required' });
  }
  const sets = [];
  const params = [];
  let i = 1;

  if (min_divisor !== undefined) { sets.push(`min_divisor = $${i++}`); params.push(min_divisor); }
  if (max_divisor !== undefined) { sets.push(`max_divisor = $${i++}`); params.push(max_divisor); }
  sets.push(`updated_by = $${i++}`);
  params.push(req.user.id);
  params.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE gearing_constants SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Gearing constant not found' });
  await req.auditLog({ actionType: 'UPDATE', resourceType: 'gearing_constant', resourceId: rows[0].id, newValue: rows[0] });
  res.json({ data: rows[0] });
});

module.exports = router;
