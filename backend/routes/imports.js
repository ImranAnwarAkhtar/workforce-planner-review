const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');

const router = Router();

// POST /api/imports/people
// Body: { records: [{ name, contract_type_id, level_id, discipline_id, contracted_fte, workday_jr_id, region_ids, country_ids }] }
router.post('/people', requireAuth, requireRole(ROLES.PMO, ROLES.WORKFORCE_PLANNING), async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const r of records) {
      if (!r.name) continue;
      const { rows } = await client.query(
        `INSERT INTO people (name, contract_type_id, level_id, discipline_id, contracted_fte, workday_jr_id, job_title, hiring_manager, system_profile)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [r.name, r.contract_type_id ?? null, r.level_id ?? null, r.discipline_id ?? null,
         r.contracted_fte ?? 1.0, r.workday_jr_id ?? null,
         r.job_title ?? null, r.hiring_manager ?? null, r.system_profile ?? null]
      );
      const personId = rows[0].id;
      for (const rid of (r.region_ids ?? [])) {
        await client.query(
          'INSERT INTO person_regions (person_id, region_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [personId, rid]
        );
      }
      for (const cid of (r.country_ids ?? [])) {
        await client.query(
          'INSERT INTO person_countries (person_id, country_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [personId, cid]
        );
      }
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'BULK_IMPORT', resourceType: 'person', newValue: { count: inserted.length } });
    res.status(201).json({ data: { imported: inserted.length, records: inserted } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/imports/allocations
// Body: { records: [{ person_id, project_id, month, fte_value, is_billable }] }
router.post('/allocations', requireAuth, requireRole(ROLES.PMO, ROLES.WORKFORCE_PLANNING), async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let imported = 0;
    for (const r of records) {
      if (!r.person_id || !r.project_id || !r.month) continue;
      await client.query(
        `INSERT INTO allocations (person_id, project_id, month, fte_value, is_billable)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (person_id, project_id, month) DO UPDATE
           SET fte_value = EXCLUDED.fte_value, is_billable = EXCLUDED.is_billable, updated_at = NOW()`,
        [r.person_id, r.project_id, r.month, r.fte_value ?? 0, r.is_billable ?? true]
      );
      imported++;
    }
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'BULK_IMPORT', resourceType: 'allocation', newValue: { count: imported } });
    res.status(201).json({ data: { imported } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/imports/tbh-codes
// Body: { records: [{ tbh_id, funding_year, hire_type, region_id, ... }] }
router.post('/tbh-codes', requireAuth, requireRole(ROLES.PMO, ROLES.FINANCE), async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const r of records) {
      if (!r.tbh_id) continue;
      const { rows } = await client.query(
        `INSERT INTO tbh_codes
           (tbh_id, old_tbh, funding_year, hire_type, region_id, project_type, legal_entity,
            location_code, cost_centre, job_profile, replaced_emp_name, manager_name,
            target_hire_date, jr_id, req_status, ta_contact, candidate_name,
            estimated_hire_date, ta_status_comments, tbh_description, fp_and_a_notes,
            confirmed_start_date, hire_source, hire_source_details, fp_and_a_approver_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         ON CONFLICT (tbh_id) DO UPDATE SET
           funding_year = EXCLUDED.funding_year, req_status = EXCLUDED.req_status,
           confirmed_start_date = COALESCE(EXCLUDED.confirmed_start_date, tbh_codes.confirmed_start_date),
           hire_source = COALESCE(EXCLUDED.hire_source, tbh_codes.hire_source),
           hire_source_details = COALESCE(EXCLUDED.hire_source_details, tbh_codes.hire_source_details),
           updated_at = NOW()
         RETURNING *`,
        [r.tbh_id, r.old_tbh ?? null, r.funding_year ?? null, r.hire_type ?? null,
         r.region_id ?? null, r.project_type ?? null, r.legal_entity ?? null,
         r.location_code ?? null, r.cost_centre ?? null, r.job_profile ?? null,
         r.replaced_emp_name ?? null, r.manager_name ?? null, r.target_hire_date ?? null,
         r.jr_id ?? null, r.req_status ?? null, r.ta_contact ?? null,
         r.candidate_name ?? null, r.estimated_hire_date ?? null,
         r.ta_status_comments ?? null, r.tbh_description ?? null, r.fp_and_a_notes ?? null,
         r.confirmed_start_date ?? null, r.hire_source ?? null, r.hire_source_details ?? null,
         r.fp_and_a_approver_notes ?? null]
      );
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'BULK_IMPORT', resourceType: 'tbh_code', newValue: { count: inserted.length } });
    res.status(201).json({ data: { imported: inserted.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/imports/projects
router.post('/projects', requireAuth, requireRole(ROLES.PMO, ROLES.WORKFORCE_PLANNING), async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const regionRows = await client.query('SELECT id, code, name FROM regions');
    const countryRows = await client.query('SELECT id, code, name FROM countries');
    const regionByCode = Object.fromEntries(regionRows.rows.map(r => [r.code.toUpperCase(), r.id]));
    const regionByName = Object.fromEntries(regionRows.rows.map(r => [r.name.toLowerCase(), r.id]));
    const countryByCode = Object.fromEntries(countryRows.rows.map(c => [c.code.toUpperCase(), c.id]));
    const countryByName = Object.fromEntries(countryRows.rows.map(c => [c.name.toLowerCase(), c.id]));

    const inserted = [];
    for (const r of records) {
      if (!r.name || !r.type || !r.status) continue;
      const regionId = r.region_id ?? regionByCode[String(r.region_code ?? '').toUpperCase()]
        ?? regionByName[String(r.region_name ?? '').toLowerCase()] ?? null;
      const countryId = r.country_id ?? countryByCode[String(r.country_code ?? '').toUpperCase()]
        ?? countryByName[String(r.country_name ?? '').toLowerCase()] ?? null;

      const type = ['Retail','xScale','Matrix'].includes(r.type) ? r.type : 'Retail';
      const status = ['Approved','Seeded','Proposed'].includes(r.status) ? r.status : 'Proposed';

      const { rows } = await client.query(
        `INSERT INTO projects (name, type, status, weight, power_kw, region_id, country_id, metro, phase_code, year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING RETURNING *`,
        [r.name, type, status, r.weight ?? 1.0,
         r.power_kw != null && r.power_kw !== '' ? parseFloat(r.power_kw) : null,
         regionId, countryId, r.metro ?? null, r.phase_code ?? null, r.year ?? null]
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    await req.auditLog({ actionType: 'BULK_IMPORT', resourceType: 'project', newValue: { count: inserted.length } });
    res.status(201).json({ data: { imported: inserted.length, records: inserted } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
