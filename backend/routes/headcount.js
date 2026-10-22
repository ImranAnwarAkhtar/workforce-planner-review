const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES, WRITER_ROLES } = require('../middleware/rbac');

const router = Router();

const WP_ROLES = [ROLES.WORKFORCE_PLANNING, ROLES.PMO];

const SELECT_PERSON = `
  SELECT pe.id, pe.name, pe.contracted_fte, pe.is_active, pe.workday_jr_id, pe.notes,
         pe.created_at, pe.updated_at, pe.tbh_code_id,
         ct.code AS contract_type_code, ct.description AS contract_type_description,
         ct.colour_hex, ct.category AS contract_category, pe.contract_type_id,
         l.level_name, l.short_code AS level_code, l.id AS level_id,
         d.name AS discipline_name, d.id AS discipline_id,
         t.tbh_id,
         pe.planning_cycle_id, pc.name AS planning_cycle_name,
         pe.dept_head, pe.hiring_manager,
         COALESCE((SELECT STRING_AGG(r.name, ', ' ORDER BY r.name)
                   FROM person_regions pr JOIN regions r ON pr.region_id = r.id
                   WHERE pr.person_id = pe.id), '') AS region_names,
         COALESCE((SELECT STRING_AGG(cou.name, ', ' ORDER BY cou.name)
                   FROM person_countries pc JOIN countries cou ON pc.country_id = cou.id
                   WHERE pc.person_id = pe.id), '') AS country_names
  FROM people pe
  LEFT JOIN contract_types ct ON pe.contract_type_id = ct.id
  LEFT JOIN levels l ON pe.level_id = l.id
  LEFT JOIN disciplines d ON pe.discipline_id = d.id
  LEFT JOIN tbh_codes t ON pe.tbh_code_id = t.id
  LEFT JOIN planning_cycles pc ON pe.planning_cycle_id = pc.id
`;

// GET /api/headcount — all placeholder records (R FTE, A FTE, R CON, A CON)
router.get('/', requireAuth, async (req, res) => {
  const { limit = 500, offset = 0 } = req.query;
  const { rows } = await pool.query(
    `${SELECT_PERSON}
     WHERE pe.is_active = TRUE AND ct.category IN ('requested', 'approved')
     ORDER BY d.name ASC, l.level_number ASC NULLS LAST, pe.name ASC
     LIMIT $1 OFFSET $2`,
    [parseInt(limit, 10), parseInt(offset, 10)]
  );
  res.json({ data: rows });
});

// POST /api/headcount — create a new headcount placeholder
router.post('/', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const {
    name, contract_type_code = 'R FTE',
    level_id, discipline_id, contracted_fte = 1.0,
    country_id, region_id, notes, planning_cycle_id,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const validCodes = ['R FTE', 'R CON'];
  if (!validCodes.includes(contract_type_code)) {
    return res.status(400).json({ error: `contract_type_code must be one of: ${validCodes.join(', ')}` });
  }

  const { rows: ctRows } = await pool.query(
    'SELECT id FROM contract_types WHERE code = $1', [contract_type_code]
  );
  if (!ctRows.length) return res.status(400).json({ error: `Unknown contract type: ${contract_type_code}` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO people (name, contract_type_id, level_id, discipline_id, contracted_fte, notes, planning_cycle_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, ctRows[0].id, level_id ?? null, discipline_id ?? null, contracted_fte, notes ?? null, planning_cycle_id ?? null]
    );
    const personId = rows[0].id;

    if (region_id) {
      await client.query(
        'INSERT INTO person_regions (person_id, region_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [personId, region_id]
      );
    }
    if (country_id) {
      await client.query(
        'INSERT INTO person_countries (person_id, country_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [personId, country_id]
      );
    }
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'CREATE', resourceType: 'person', resourceId: personId, newValue: rows[0] });

    const { rows: full } = await pool.query(`${SELECT_PERSON} WHERE pe.id = $1`, [personId]);
    res.status(201).json({ data: full[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/headcount/:id/approve — R FTE → A FTE, R CON → A CON (WP + PMO only)
router.put('/:id/approve', requireAuth, requireRole(...WP_ROLES), async (req, res) => {
  const { rows: current } = await pool.query(
    `SELECT pe.id, ct.code AS contract_type_code
     FROM people pe JOIN contract_types ct ON ct.id = pe.contract_type_id
     WHERE pe.id = $1 AND pe.is_active = TRUE`,
    [req.params.id]
  );
  if (!current.length) return res.status(404).json({ error: 'Headcount record not found' });

  const currentCode = current[0].contract_type_code;
  const nextCode = currentCode === 'R FTE' ? 'A FTE'
                 : currentCode === 'R CON' ? 'A CON'
                 : null;

  if (!nextCode) {
    return res.status(400).json({ error: `Cannot approve a record with type '${currentCode}'. Must be R FTE or R CON.` });
  }

  const { rows: ctRows } = await pool.query('SELECT id FROM contract_types WHERE code = $1', [nextCode]);
  if (!ctRows.length) return res.status(500).json({ error: `Contract type '${nextCode}' not found in reference data` });

  await pool.query(
    'UPDATE people SET contract_type_id = $1, updated_at = NOW() WHERE id = $2',
    [ctRows[0].id, req.params.id]
  );
  await req.auditLog({
    actionType: 'APPROVE_HEADCOUNT',
    resourceType: 'person',
    resourceId: parseInt(req.params.id, 10),
    newValue: { contract_type_code: nextCode },
  });

  const { rows: full } = await pool.query(`${SELECT_PERSON} WHERE pe.id = $1`, [req.params.id]);
  res.json({ data: full[0] });
});

// PUT /api/headcount/:id/tbh — assign or update TBH code (WP + PMO only)
router.put('/:id/tbh', requireAuth, requireRole(...WP_ROLES), async (req, res) => {
  const { tbh_code_id } = req.body;
  if (tbh_code_id === undefined) return res.status(400).json({ error: 'tbh_code_id is required' });

  const { rows: current } = await pool.query(
    'SELECT id FROM people WHERE id = $1 AND is_active = TRUE', [req.params.id]
  );
  if (!current.length) return res.status(404).json({ error: 'Headcount record not found' });

  await pool.query(
    'UPDATE people SET tbh_code_id = $1, updated_at = NOW() WHERE id = $2',
    [tbh_code_id ?? null, req.params.id]
  );
  await req.auditLog({
    actionType: 'ASSIGN_TBH',
    resourceType: 'person',
    resourceId: parseInt(req.params.id, 10),
    newValue: { tbh_code_id },
  });

  const { rows: full } = await pool.query(`${SELECT_PERSON} WHERE pe.id = $1`, [req.params.id]);
  res.json({ data: full[0] });
});

// PUT /api/headcount/:id/convert — convert to named hire (WP + PMO only)
// A FTE → FTE or SNR   |   A CON → CON
router.put('/:id/convert', requireAuth, requireRole(...WP_ROLES), async (req, res) => {
  const { name, new_contract_type_code, notes, workday_jr_id } = req.body;

  if (!name)                   return res.status(400).json({ error: 'name is required' });
  if (!new_contract_type_code) return res.status(400).json({ error: 'new_contract_type_code is required' });

  const { rows: current } = await pool.query(
    `SELECT pe.id, ct.code AS contract_type_code
     FROM people pe JOIN contract_types ct ON ct.id = pe.contract_type_id
     WHERE pe.id = $1 AND pe.is_active = TRUE`,
    [req.params.id]
  );
  if (!current.length) return res.status(404).json({ error: 'Headcount record not found' });

  const currentCode = current[0].contract_type_code;
  if (!['A FTE', 'A CON'].includes(currentCode)) {
    return res.status(400).json({ error: `Can only convert approved records (A FTE / A CON). Current type: '${currentCode}'` });
  }

  const allowedConversions = {
    'A FTE': ['FTE', 'SNR'],
    'A CON': ['CON'],
  };
  if (!allowedConversions[currentCode].includes(new_contract_type_code)) {
    return res.status(400).json({
      error: `Cannot convert '${currentCode}' to '${new_contract_type_code}'. Allowed: ${allowedConversions[currentCode].join(', ')}`,
    });
  }

  const { rows: ctRows } = await pool.query(
    'SELECT id FROM contract_types WHERE code = $1', [new_contract_type_code]
  );
  if (!ctRows.length) return res.status(400).json({ error: `Unknown contract type: ${new_contract_type_code}` });

  const sets = ['name = $1', 'contract_type_id = $2', 'updated_at = NOW()'];
  const params = [name, ctRows[0].id];
  let i = 3;
  if (notes        !== undefined) { sets.push(`notes = $${i++}`);         params.push(notes); }
  if (workday_jr_id !== undefined) { sets.push(`workday_jr_id = $${i++}`); params.push(workday_jr_id); }
  params.push(req.params.id);

  await pool.query(
    `UPDATE people SET ${sets.join(', ')} WHERE id = $${i}`,
    params
  );
  await req.auditLog({
    actionType: 'CONVERT_TO_HIRE',
    resourceType: 'person',
    resourceId: parseInt(req.params.id, 10),
    newValue: { name, contract_type_code: new_contract_type_code },
  });

  const { rows: full } = await pool.query(`${SELECT_PERSON} WHERE pe.id = $1`, [req.params.id]);
  res.json({ data: full[0] });
});

// DELETE /api/headcount/:id — soft-delete (reject request or remove record)
router.delete('/:id', requireAuth, requireRole(...WP_ROLES), async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE people SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Headcount record not found' });
  await req.auditLog({
    actionType: 'DELETE',
    resourceType: 'person',
    resourceId: parseInt(req.params.id, 10),
  });
  res.status(204).end();
});

module.exports = router;
