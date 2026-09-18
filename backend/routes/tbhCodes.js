const { Router } = require('express');
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');
const { writeAudit } = require('../db/auditLog');

const WRITE_ROLES = [ROLES.PMO, ROLES.WORKFORCE_PLANNING, ROLES.FINANCE];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Map Excel status values → app status values
const STATUS_MAP = { 'Hired': 'Filled', 'Closed': 'Cancelled' };
// Map Excel hire type values → app hire type values
const HIRE_TYPE_MAP = {
  'New Hire - Budgeted': 'Net New',
  'Contractor Conversion': 'Conversion',
  'Replacement': 'Backfill',
};

function normalise(s) { return String(s ?? '').replace(/\s+/g, ' ').trim(); }

function parseExcelDate(val) {
  const s = normalise(val);
  if (!s || s === '0') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  if (d === 0 || mo === 0 || y < 1950) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractYear(funding) {
  const m = String(funding ?? '').match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function mapProjectType(p) {
  const s = normalise(p).toLowerCase();
  if (s.includes('matrix')) return 'Matrix';
  if (s.includes('xscale') || s.includes('x scale')) return 'xScale';
  if (s === 'retail') return 'Retail';
  return null;
}

function locationCode(loc) {
  const m = normalise(loc).match(/^(\d{4})/);
  return m ? m[1] : (normalise(loc).substring(0, 20) || null);
}

function clean(v) {
  const s = normalise(v);
  return (!s || s === '0') ? null : s;
}

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { region_id, funding_year, req_status, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (region_id)    { conditions.push(`t.region_id = $${i++}`);    params.push(parseInt(region_id, 10)); }
  if (funding_year) { conditions.push(`t.funding_year = $${i++}`); params.push(parseInt(funding_year, 10)); }
  if (req_status)   { conditions.push(`t.req_status = $${i++}`);   params.push(req_status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const { rows } = await pool.query(
    `SELECT t.*, r.name AS region_name
     FROM tbh_codes t
     LEFT JOIN regions r ON t.region_id = r.id
     ${where}
     ORDER BY t.funding_year DESC NULLS LAST, t.tbh_id ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json({ data: rows });
});

// ── Excel import (upsert by tbh_id) ─────────────────────────────────────────
router.post('/import', requireAuth, requireRole(...WRITE_ROLES), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.includes('N TBH') ? 'N TBH' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find the header row (first row containing a cell "TBH ID")
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(8, allRows.length); i++) {
    const row = allRows[i];
    const found = row.findIndex(c => normalise(c) === 'TBH ID');
    if (found >= 0) {
      headerIdx = i;
      row.forEach((h, idx) => { const k = normalise(h); if (k) colMap[k] = idx; });
      break;
    }
  }
  if (headerIdx < 0) return res.status(400).json({ error: 'Header row with "TBH ID" not found in first 8 rows' });

  // Pre-load regions for name/code → id lookup
  const { rows: regionRows } = await pool.query('SELECT id, name, code FROM regions');
  const regionById = {};
  for (const r of regionRows) {
    regionById[normalise(r.name).toUpperCase()] = r.id;
    regionById[normalise(r.code).toUpperCase()] = r.id;
  }

  function cell(row, ...keys) {
    for (const k of keys) {
      const idx = colMap[normalise(k)];
      if (idx !== undefined) { const v = normalise(row[idx]); if (v) return v; }
    }
    return '';
  }

  let inserted = 0, updated = 0, skipped = 0;

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row.length || row.every(c => !normalise(c))) continue;

    let tbhId = cell(row, 'TBH ID');
    const oldTbh = cell(row, 'OLD TBH');
    if (!tbhId || tbhId === 'No new Code') tbhId = oldTbh;
    if (!tbhId) { skipped++; continue; }

    const rawStatus = cell(row, 'REQ Status');
    const reqStatus = STATUS_MAP[rawStatus] || rawStatus || null;

    const rawHireType = cell(row, 'Hire Type');
    const hireType = HIRE_TYPE_MAP[rawHireType] || rawHireType || null;

    const regionKey = cell(row, 'Region').toUpperCase();
    const regionId  = regionById[regionKey] ?? null;

    let candidateName = clean(cell(row, 'Final Candidate'));
    const taComments  = clean(cell(row, 'TA Status Comments + Location + TA Contact name + Offer Comp Ratio + Current Company'));
    if (!candidateName) candidateName = taComments;

    const params = [
      tbhId,
      clean(oldTbh),
      extractYear(cell(row, 'FUNDING')),
      hireType,
      regionId,
      mapProjectType(cell(row, 'Project')),
      clean(cell(row, 'Legal Entity Final')),
      locationCode(cell(row, 'Location')),
      clean(cell(row, 'Cost Center', 'Cost Centre')),
      clean(cell(row, 'Job Profile', 'Job  Profile')),
      clean(cell(row, 'Replaced Emp Name')),
      clean(cell(row, 'Manager Name')),
      parseExcelDate(cell(row, 'Hire Date')),
      clean(cell(row, 'Job Req ID')),
      reqStatus,
      clean(cell(row, 'TA Contact')),
      candidateName,
      parseExcelDate(cell(row, 'TA (Estimated) Hire Date')),
      taComments,
      clean(cell(row, 'TBH Description')),
      clean(cell(row, 'Note from FP&A', 'Note from FP&A Approver')),
    ];

    const { rows: r } = await pool.query(
      `INSERT INTO tbh_codes
         (tbh_id, old_tbh, funding_year, hire_type, region_id, project_type, legal_entity,
          location_code, cost_centre, job_profile, replaced_emp_name, manager_name,
          target_hire_date, jr_id, req_status, ta_contact, candidate_name,
          estimated_hire_date, ta_status_comments, tbh_description, fp_and_a_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (tbh_id) DO UPDATE SET
         old_tbh = EXCLUDED.old_tbh, funding_year = EXCLUDED.funding_year,
         hire_type = EXCLUDED.hire_type, region_id = EXCLUDED.region_id,
         project_type = EXCLUDED.project_type, legal_entity = EXCLUDED.legal_entity,
         location_code = EXCLUDED.location_code, cost_centre = EXCLUDED.cost_centre,
         job_profile = EXCLUDED.job_profile, replaced_emp_name = EXCLUDED.replaced_emp_name,
         manager_name = EXCLUDED.manager_name, target_hire_date = EXCLUDED.target_hire_date,
         jr_id = EXCLUDED.jr_id, req_status = EXCLUDED.req_status,
         ta_contact = EXCLUDED.ta_contact, candidate_name = EXCLUDED.candidate_name,
         estimated_hire_date = EXCLUDED.estimated_hire_date,
         ta_status_comments = EXCLUDED.ta_status_comments,
         tbh_description = EXCLUDED.tbh_description, fp_and_a_notes = EXCLUDED.fp_and_a_notes,
         updated_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      params
    );
    r[0]?.is_insert ? inserted++ : updated++;
  }

  res.json({ inserted, updated, skipped, total: inserted + updated });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, r.name AS region_name
     FROM tbh_codes t
     LEFT JOIN regions r ON t.region_id = r.id
     WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'TBH code not found' });
  res.json({ data: rows[0] });
});

router.post('/', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const {
    tbh_id, old_tbh, funding_year, hire_type, region_id, project_type, legal_entity,
    location_code, cost_centre, job_profile, replaced_emp_name, manager_name,
    target_hire_date, jr_id, req_status, ta_contact, candidate_name,
    estimated_hire_date, ta_status_comments, tbh_description, fp_and_a_notes,
  } = req.body;
  if (!tbh_id) return res.status(400).json({ error: 'tbh_id is required' });

  const { rows } = await pool.query(
    `INSERT INTO tbh_codes
       (tbh_id, old_tbh, funding_year, hire_type, region_id, project_type, legal_entity,
        location_code, cost_centre, job_profile, replaced_emp_name, manager_name,
        target_hire_date, jr_id, req_status, ta_contact, candidate_name,
        estimated_hire_date, ta_status_comments, tbh_description, fp_and_a_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [tbh_id, old_tbh ?? null, funding_year ?? null, hire_type ?? null, region_id ?? null,
     project_type ?? null, legal_entity ?? null, location_code ?? null, cost_centre ?? null,
     job_profile ?? null, replaced_emp_name ?? null, manager_name ?? null,
     target_hire_date ?? null, jr_id ?? null, req_status ?? null, ta_contact ?? null,
     candidate_name ?? null, estimated_hire_date ?? null, ta_status_comments ?? null,
     tbh_description ?? null, fp_and_a_notes ?? null]
  );
  await req.auditLog({ actionType: 'CREATE', resourceType: 'tbh_code', resourceId: rows[0].id, newValue: rows[0] });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'CREATE', tableName: 'tbh_codes', recordId: rows[0].id, newValues: rows[0], ipAddress: req.ip });
  res.status(201).json({ data: rows[0] });
});

router.put('/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const fields = [
    'old_tbh','funding_year','hire_type','region_id','project_type','legal_entity',
    'location_code','cost_centre','job_profile','replaced_emp_name','manager_name',
    'target_hire_date','jr_id','req_status','ta_contact','candidate_name',
    'estimated_hire_date','ta_status_comments','tbh_description','fp_and_a_notes',
  ];
  const sets = [];
  const params = [];
  let i = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = $${i++}`);
      params.push(req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE tbh_codes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'TBH code not found' });
  await req.auditLog({ actionType: 'UPDATE', resourceType: 'tbh_code', resourceId: rows[0].id, newValue: rows[0] });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'UPDATE', tableName: 'tbh_codes', recordId: rows[0].id, newValues: rows[0], ipAddress: req.ip });
  res.json({ data: rows[0] });
});

router.delete('/:id', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM tbh_codes WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'TBH code not found' });
  await req.auditLog({ actionType: 'DELETE', resourceType: 'tbh_code', resourceId: rows[0].id });
  await writeAudit({ userId: req.user.id, userEmail: req.user.email, action: 'DELETE', tableName: 'tbh_codes', recordId: rows[0].id, ipAddress: req.ip });
  res.status(204).end();
});

module.exports = router;
