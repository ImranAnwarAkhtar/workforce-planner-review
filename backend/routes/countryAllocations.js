const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// GET /api/country-allocations?planning_cycle_id=X&region_id=Y&person_id=Z
router.get('/', requireAuth, async (req, res) => {
  const { planning_cycle_id, region_id, person_id } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (planning_cycle_id) { conditions.push(`ca.planning_cycle_id = $${i++}`); params.push(parseInt(planning_cycle_id, 10)); }
  if (region_id)         { conditions.push(`co.region_id = $${i++}`);          params.push(parseInt(region_id, 10)); }
  if (person_id)         { conditions.push(`ca.person_id = $${i++}`);          params.push(parseInt(person_id, 10)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ca.id, ca.person_id, ca.country_id, ca.planning_cycle_id,
            ca.fte_value, ca.non_project_fte, ca.created_at, ca.updated_at,
            co.name AS country_name, pe.name AS person_name
     FROM country_allocations ca
     JOIN countries co ON ca.country_id = co.id
     JOIN people    pe ON ca.person_id  = pe.id
     ${where}
     ORDER BY ca.person_id, ca.country_id`,
    params
  );
  res.json({ data: rows });
});

// PUT /api/country-allocations/:personId
// Body: { planning_cycle_id, allocations: [{ country_id, fte_value }] }
router.put('/:personId', requireAuth, async (req, res) => {
  const personId = parseInt(req.params.personId, 10);
  const { planning_cycle_id, allocations = [] } = req.body;

  const total = allocations.reduce((s, a) => s + (parseFloat(a.fte_value) || 0), 0);
  if (total > 1.001) return res.status(400).json({ error: `Total FTE ${total.toFixed(2)} exceeds 1.0` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (planning_cycle_id) {
      await client.query(
        'DELETE FROM country_allocations WHERE person_id = $1 AND planning_cycle_id = $2',
        [personId, planning_cycle_id]
      );
    } else {
      await client.query(
        'DELETE FROM country_allocations WHERE person_id = $1 AND planning_cycle_id IS NULL',
        [personId]
      );
    }
    const saved = [];
    for (const { country_id, fte_value, non_project_fte } of allocations) {
      const fv  = parseFloat(fte_value) || 0;
      const npv = Math.min(parseFloat(non_project_fte) || 0, fv); // NP cannot exceed total FTE
      if (fv <= 0) continue;
      const { rows: [row] } = await client.query(
        `INSERT INTO country_allocations (person_id, country_id, planning_cycle_id, fte_value, non_project_fte)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [personId, parseInt(country_id, 10), planning_cycle_id || null, fv, npv]
      );
      saved.push(row);
    }
    await client.query('COMMIT');
    res.json({ data: saved });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
