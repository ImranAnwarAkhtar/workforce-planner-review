const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');

const router = Router();

const GEARING_SELECT = `
  SELECT gc.id, gc.discipline_id, gc.project_type,
         gc.divisor, gc.min_divisor, gc.max_divisor, gc.updated_at,
         d.name AS discipline_name, u.name AS updated_by_name
  FROM gearing_constants gc
  JOIN disciplines d ON gc.discipline_id = d.id
  LEFT JOIN users u ON gc.updated_by = u.id
  ORDER BY d.name ASC, gc.project_type ASC`;

// Seeds default gearing constants using WHERE NOT EXISTS — works without any unique constraint
async function ensureGearingSeeded() {
  await pool.query(`
    INSERT INTO disciplines (name) VALUES
      ('Construction'), ('Design'), ('Commercial'), ('Commissioning'), ('Other')
    ON CONFLICT (name) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gearing_constants (
      id            SERIAL       PRIMARY KEY,
      discipline_id INTEGER      NOT NULL REFERENCES disciplines(id),
      project_type  VARCHAR(20)  NOT NULL,
      min_divisor   DECIMAL(4,2) NOT NULL,
      max_divisor   DECIMAL(4,2) NOT NULL,
      updated_by    INTEGER,
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const { rowCount } = await pool.query(`
    INSERT INTO gearing_constants (discipline_id, project_type, min_divisor, max_divisor)
    SELECT d.id, v.project_type, v.min_d::decimal, v.max_d::decimal
    FROM (VALUES
      ('Construction', 'Retail',  2.00, 1.00),
      ('Construction', 'xScale',  1.00, 0.50),
      ('Construction', 'EM',      0.50, 0.25),
      ('Design',       'Retail',  4.00, 2.00),
      ('Design',       'xScale',  2.00, 1.00),
      ('Design',       'EM',      2.00, 1.00),
      ('Commercial',   'Retail',  6.00, 3.00),
      ('Commercial',   'xScale',  2.50, 1.25),
      ('Commercial',   'EM',      2.50, 1.25),
      ('Commissioning','Retail',  4.00, 2.00),
      ('Commissioning','xScale',  2.00, 1.00)
    ) AS v(discipline_name, project_type, min_d, max_d)
    JOIN disciplines d ON d.name = v.discipline_name
    WHERE NOT EXISTS (
      SELECT 1 FROM gearing_constants gc
      WHERE gc.discipline_id = d.id AND gc.project_type = v.project_type
    )
  `);

  return rowCount;
}

// Self-healing GET: if the table is missing or empty, seed defaults and retry
router.get('/', requireAuth, async (req, res) => {
  let rows;

  try {
    ({ rows } = await pool.query(GEARING_SELECT));
  } catch {
    // Table likely doesn't exist — seed and retry
    await ensureGearingSeeded();
    ({ rows } = await pool.query(GEARING_SELECT));
    return res.json({ data: rows });
  }

  if (rows.length === 0) {
    try {
      await ensureGearingSeeded();
      ({ rows } = await pool.query(GEARING_SELECT));
    } catch {
      // Best-effort: return empty rather than error
    }
  }

  res.json({ data: rows });
});

router.get('/debug', requireAuth, async (req, res) => {
  const tableExists = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gearing_constants') AS exists`
  ).then(r => r.rows[0].exists).catch(() => false);

  const disciplines = await pool.query('SELECT id, name FROM disciplines ORDER BY name')
    .then(r => r.rows).catch(() => []);

  const gearing_constants_count = tableExists
    ? await pool.query('SELECT COUNT(*) AS count FROM gearing_constants').then(r => r.rows[0].count).catch(() => 'error')
    : 'table missing';

  const sample = tableExists
    ? await pool.query(`
        SELECT d.name AS discipline, gc.project_type, gc.min_divisor, gc.max_divisor
        FROM gearing_constants gc JOIN disciplines d ON gc.discipline_id = d.id
        ORDER BY d.name, gc.project_type LIMIT 20
      `).then(r => r.rows).catch(() => [])
    : [];

  res.json({ gearing_constants_table_exists: tableExists, gearing_constants_count, disciplines, sample });
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
  const { divisor } = req.body;
  if (divisor === undefined || isNaN(Number(divisor)) || Number(divisor) <= 0) {
    return res.status(400).json({ error: 'divisor must be a positive number' });
  }
  const d = Number(divisor);
  const minDiv = d;
  const maxDiv = Math.round((d / 2) * 100) / 100;

  const { rows } = await pool.query(
    `UPDATE gearing_constants
     SET divisor = $1, min_divisor = $2, max_divisor = $3, updated_by = $4
     WHERE id = $5 RETURNING *`,
    [d, minDiv, maxDiv, req.user.id, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Gearing constant not found' });
  await req.auditLog({ actionType: 'UPDATE', resourceType: 'gearing_constant', resourceId: rows[0].id, newValue: rows[0] });
  res.json({ data: rows[0] });
});

router.post('/', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { discipline_id, project_type, divisor } = req.body;
  if (!discipline_id || !project_type || !divisor) {
    return res.status(400).json({ error: 'discipline_id, project_type, and divisor are required' });
  }
  if (isNaN(Number(divisor)) || Number(divisor) <= 0) {
    return res.status(400).json({ error: 'divisor must be a positive number' });
  }
  const d = Number(divisor);
  const minDiv = d;
  const maxDiv = Math.round((d / 2) * 100) / 100;

  const { rows: exists } = await pool.query(
    'SELECT id FROM gearing_constants WHERE discipline_id = $1 AND project_type = $2',
    [discipline_id, project_type]
  );
  if (exists.length) {
    return res.status(409).json({ error: 'A gearing ratio already exists for this discipline and project type' });
  }

  const { rows } = await pool.query(
    `INSERT INTO gearing_constants (discipline_id, project_type, divisor, min_divisor, max_divisor, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [discipline_id, project_type, d, minDiv, maxDiv, req.user.id]
  );
  await req.auditLog({ actionType: 'CREATE', resourceType: 'gearing_constant', resourceId: rows[0].id, newValue: rows[0] });
  res.status(201).json({ data: rows[0] });
});

module.exports = router;
