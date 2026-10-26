const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, WRITER_ROLES, ROLES } = require('../middleware/rbac');
const { writeAudit } = require('../db/auditLog');
const { fireEventAlerts } = require('./alerts');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const {
    discipline_id, contract_type_id, contract_category,
    region_id, is_active = 'true', limit = 100, offset = 0,
  } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (is_active !== 'all') {
    conditions.push(`pe.is_active = $${i++}`);
    params.push(is_active !== 'false');
  }
  if (discipline_id)    { conditions.push(`pe.discipline_id = $${i++}`);    params.push(parseInt(discipline_id, 10)); }
  if (contract_type_id) { conditions.push(`pe.contract_type_id = $${i++}`); params.push(parseInt(contract_type_id, 10)); }
  if (contract_category) {
    const cats = contract_category.split(',').map(c => c.trim()).filter(Boolean);
    const placeholders = cats.map(() => `$${i++}`).join(', ');
    conditions.push(`(ct.category IN (${placeholders}) OR pe.contract_type_id IS NULL)`);
    params.push(...cats);
  }
  if (region_id) {
    conditions.push(`EXISTS (SELECT 1 FROM person_regions pr WHERE pr.person_id = pe.id AND pr.region_id = $${i++})`);
    params.push(parseInt(region_id, 10));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const { rows } = await pool.query(
    `SELECT pe.id, pe.name, pe.contracted_fte, pe.is_active, pe.workday_jr_id, pe.notes,
            pe.system_profile, pe.email, pe.created_at, pe.updated_at,
            pe.login_email, pe.app_role, pe.platform_access_enabled, pe.last_login,
            pe.contract_type_id, pe.hiring_manager, pe.dept_head, pe.job_title,
            ct.code AS contract_type_code, ct.description AS contract_type_description,
            ct.colour_hex, ct.category AS contract_category,
            l.level_name, l.short_code AS level_code, l.id AS level_id,
            d.name AS discipline_name, d.id AS discipline_id,
            t.tbh_id, pe.tbh_code_id,
            t.confirmed_start_date, t.cost_centre, t.job_profile AS tbh_job_profile,
            COALESCE(reg_agg.region_names, '') AS region_names,
            COALESCE(cou_agg.country_names, '') AS country_names
     FROM people pe
     LEFT JOIN contract_types ct ON pe.contract_type_id = ct.id
     LEFT JOIN levels l ON pe.level_id = l.id
     LEFT JOIN disciplines d ON pe.discipline_id = d.id
     LEFT JOIN tbh_codes t ON pe.tbh_code_id = t.id
     LEFT JOIN (
       SELECT pr.person_id, STRING_AGG(r.name, ', ' ORDER BY r.name) AS region_names
       FROM person_regions pr JOIN regions r ON pr.region_id = r.id
       GROUP BY pr.person_id
     ) reg_agg ON reg_agg.person_id = pe.id
     LEFT JOIN (
       SELECT pc.person_id, STRING_AGG(cou.name, ', ' ORDER BY cou.name) AS country_names
       FROM person_countries pc JOIN countries cou ON pc.country_id = cou.id
       GROUP BY pc.person_id
     ) cou_agg ON cou_agg.person_id = pe.id
     ${where}
     ORDER BY pe.name ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pe.*, ct.code AS contract_type_code, ct.description AS contract_type_description, ct.colour_hex,
            l.level_name, l.short_code AS level_code, d.name AS discipline_name, t.tbh_id
     FROM people pe
     LEFT JOIN contract_types ct ON pe.contract_type_id = ct.id
     LEFT JOIN levels l ON pe.level_id = l.id
     LEFT JOIN disciplines d ON pe.discipline_id = d.id
     LEFT JOIN tbh_codes t ON pe.tbh_code_id = t.id
     WHERE pe.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Person not found' });

  const [regions, countries] = await Promise.all([
    pool.query(
      'SELECT pr.region_id, r.name, r.code FROM person_regions pr JOIN regions r ON pr.region_id = r.id WHERE pr.person_id = $1',
      [req.params.id]
    ),
    pool.query(
      'SELECT pc.country_id, c.name, c.code FROM person_countries pc JOIN countries c ON pc.country_id = c.id WHERE pc.person_id = $1',
      [req.params.id]
    ),
  ]);

  res.json({ data: { ...rows[0], regions: regions.rows, countries: countries.rows } });
});

router.post('/', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, contract_type_id, level_id, discipline_id, contracted_fte = 1.0,
          tbh_code_id, workday_jr_id, system_profile, region_ids = [], country_ids = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO people (name, contract_type_id, level_id, discipline_id, contracted_fte, tbh_code_id, workday_jr_id, system_profile)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, contract_type_id ?? null, level_id ?? null, discipline_id ?? null, contracted_fte, tbh_code_id ?? null, workday_jr_id ?? null, system_profile ?? null]
    );
    const personId = rows[0].id;

    for (const rid of region_ids) {
      await client.query('INSERT INTO person_regions (person_id, region_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [personId, rid]);
    }
    for (const cid of country_ids) {
      await client.query('INSERT INTO person_countries (person_id, country_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [personId, cid]);
    }

    await client.query('COMMIT');
    await req.auditLog({ actionType: 'CREATE', resourceType: 'person', resourceId: personId, newValue: rows[0] });
    await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'CREATE', tableName: 'people', recordId: personId, newValues: rows[0], ipAddress: req.ip });
    fireEventAlerts('person_added', {
      person_name: rows[0].name, person_id: personId,
      added_by_name: req.user.name, added_by_email: req.user.email,
    }).catch(() => {});
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Bulk permanent delete — must be before /:id routes
router.post('/bulk-delete', requireAuth, requireRole(ROLES.PMO, ROLES.WORKFORCE_PLANNING), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: found } = await client.query('SELECT id, name FROM people WHERE id = ANY($1)', [ids]);
    await client.query('DELETE FROM allocations      WHERE person_id = ANY($1)', [ids]);
    await client.query('DELETE FROM person_regions   WHERE person_id = ANY($1)', [ids]);
    await client.query('DELETE FROM person_countries WHERE person_id = ANY($1)', [ids]);
    const { rowCount } = await client.query('DELETE FROM people WHERE id = ANY($1)', [ids]);
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'BULK_PERMANENT_DELETE', resourceType: 'person', newValue: { count: rowCount, names: found.map(p => p.name) } });
    res.json({ data: { deleted: rowCount } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, contract_type_id, level_id, discipline_id, contracted_fte,
          tbh_code_id, workday_jr_id, is_active, notes, system_profile, email,
          login_email, app_role, platform_access_enabled, planning_cycle_id,
          dept_head, hiring_manager, job_title,
          region_ids, country_ids } = req.body;
  const sets = [];
  const params = [];
  let i = 1;

  if (name             !== undefined) { sets.push(`name = $${i++}`);              params.push(name); }
  if (contract_type_id !== undefined) { sets.push(`contract_type_id = $${i++}`);  params.push(contract_type_id); }
  if (level_id         !== undefined) { sets.push(`level_id = $${i++}`);          params.push(level_id); }
  if (discipline_id    !== undefined) { sets.push(`discipline_id = $${i++}`);     params.push(discipline_id); }
  if (contracted_fte   !== undefined) { sets.push(`contracted_fte = $${i++}`);    params.push(contracted_fte); }
  if (tbh_code_id      !== undefined) { sets.push(`tbh_code_id = $${i++}`);       params.push(tbh_code_id); }
  if (workday_jr_id    !== undefined) { sets.push(`workday_jr_id = $${i++}`);     params.push(workday_jr_id); }
  if (is_active        !== undefined) { sets.push(`is_active = $${i++}`);         params.push(is_active); }
  if (notes            !== undefined) { sets.push(`notes = $${i++}`);             params.push(notes); }
  if (system_profile          !== undefined) { sets.push(`system_profile = $${i++}`);           params.push(system_profile || null); }
  if (email                   !== undefined) { sets.push(`email = $${i++}`);                    params.push(email || null); }
  if (login_email             !== undefined) { sets.push(`login_email = $${i++}`);              params.push(login_email || null); }
  if (app_role                !== undefined) { sets.push(`app_role = $${i++}`);                 params.push(app_role || null); }
  if (platform_access_enabled !== undefined) { sets.push(`platform_access_enabled = $${i++}`); params.push(platform_access_enabled); }
  if (planning_cycle_id       !== undefined) { sets.push(`planning_cycle_id = $${i++}`);       params.push(planning_cycle_id ?? null); }
  if (dept_head               !== undefined) { sets.push(`dept_head = $${i++}`);               params.push(dept_head || null); }
  if (hiring_manager          !== undefined) { sets.push(`hiring_manager = $${i++}`);          params.push(hiring_manager || null); }
  if (job_title               !== undefined) { sets.push(`job_title = $${i++}`);               params.push(job_title || null); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated;
    if (sets.length) {
      params.push(req.params.id);
      const { rows } = await client.query(
        `UPDATE people SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        params
      );
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Person not found' }); }
      updated = rows[0];
    } else {
      const { rows } = await client.query('SELECT * FROM people WHERE id = $1', [req.params.id]);
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Person not found' }); }
      updated = rows[0];
    }

    if (region_ids !== undefined) {
      await client.query('DELETE FROM person_regions WHERE person_id = $1', [req.params.id]);
      for (const rid of region_ids) {
        await client.query('INSERT INTO person_regions (person_id, region_id) VALUES ($1,$2)', [req.params.id, rid]);
      }
    }
    if (country_ids !== undefined) {
      await client.query('DELETE FROM person_countries WHERE person_id = $1', [req.params.id]);
      for (const cid of country_ids) {
        await client.query('INSERT INTO person_countries (person_id, country_id) VALUES ($1,$2)', [req.params.id, cid]);
      }
    }

    await client.query('COMMIT');
    await req.auditLog({ actionType: 'UPDATE', resourceType: 'person', resourceId: updated.id, newValue: updated });
    await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'UPDATE', tableName: 'people', recordId: updated.id, newValues: updated, ipAddress: req.ip });
    fireEventAlerts('person_updated', {
      person_name: updated.name, person_id: updated.id,
      updated_by_name: req.user.name, updated_by_email: req.user.email,
    }).catch(() => {});
    res.json({ data: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Permanent hard delete — must be registered before /:id to avoid route shadowing
router.delete('/:id/permanent', requireAuth, requireRole(ROLES.PMO, ROLES.WORKFORCE_PLANNING), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query('SELECT id, name FROM people WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Person not found' });
    const { id, name } = check.rows[0];

    await client.query('DELETE FROM allocations    WHERE person_id = $1', [id]);
    await client.query('DELETE FROM person_regions  WHERE person_id = $1', [id]);
    await client.query('DELETE FROM person_countries WHERE person_id = $1', [id]);
    await client.query('DELETE FROM people          WHERE id = $1', [id]);

    await client.query('COMMIT');
    await req.auditLog({ actionType: 'PERMANENT_DELETE', resourceType: 'person', resourceId: id, newValue: { name } });
    await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'PERMANENT_DELETE', tableName: 'people', recordId: id, oldValues: { name }, ipAddress: req.ip });
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE people SET is_active = FALSE WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Person not found' });
  await req.auditLog({ actionType: 'DELETE', resourceType: 'person', resourceId: rows[0].id });
  res.status(204).end();
});

module.exports = router;
