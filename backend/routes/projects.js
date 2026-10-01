const { Router } = require('express');
const multer = require('multer');
const XLSX   = require('xlsx');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, WRITER_ROLES, ROLES } = require('../middleware/rbac');
const { guardCycleEdit } = require('../middleware/cycleAccess');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { region_id, year, status, type, is_active = 'true', planning_cycle_id, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (is_active !== 'all') {
    conditions.push(`p.is_active = $${i++}`);
    params.push(is_active !== 'false');
  }
  if (region_id)         { conditions.push(`p.region_id = $${i++}`);          params.push(parseInt(region_id, 10)); }
  if (year)              { conditions.push(`p.year = $${i++}`);                params.push(parseInt(year, 10)); }
  if (status)            { conditions.push(`p.status = $${i++}`);              params.push(status); }
  if (type)              { conditions.push(`p.type = $${i++}`);                params.push(type); }
  if (planning_cycle_id) { conditions.push(`p.planning_cycle_id = $${i++}`);   params.push(parseInt(planning_cycle_id, 10)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.type, p.status, p.weight, p.power_kw, p.region_id, p.country_id,
            p.metro, p.phase_code, p.year, p.is_active, p.created_at, p.updated_at,
            r.name AS region_name, c.name AS country_name, c.is_emerging_market
     FROM projects p
     LEFT JOIN regions r ON p.region_id = r.id
     LEFT JOIN countries c ON p.country_id = c.id
     ${where}
     ORDER BY p.year DESC NULLS LAST, p.name ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, r.name AS region_name, c.name AS country_name, u.name AS created_by_name
     FROM projects p
     LEFT JOIN regions r ON p.region_id = r.id
     LEFT JOIN countries c ON p.country_id = c.id
     LEFT JOIN users u ON p.created_by = u.id
     WHERE p.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.json({ data: rows[0] });
});

// GET /api/projects/:id/comments — must be registered before any catch-all /:id routes
router.get('/:id/comments', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, project_id, user_name, user_role, body, created_at
     FROM project_comments
     WHERE project_id = $1
     ORDER BY created_at ASC`,
    [parseInt(req.params.id, 10)]
  );
  res.json({ data: rows });
});

// POST /api/projects/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required' });
  const projectId = parseInt(req.params.id, 10);
  const { rows: [project] } = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { rows } = await pool.query(
    `INSERT INTO project_comments (project_id, user_name, user_role, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, project_id, user_name, user_role, body, created_at`,
    [projectId, req.user.name, req.user.role ?? null, body.trim()]
  );
  res.status(201).json({ data: rows[0] });
});

// CSV/XLSX upload — must be before /:id routes
router.post('/upload', requireAuth, requireRole(...WRITER_ROLES), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return res.status(400).json({ error: 'File contains no data rows' });

  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s\/]+/g, '_'));
  const idx = col => headers.indexOf(col);

  const { rows: dbRegions }   = await pool.query('SELECT id, name FROM regions');
  const { rows: dbCountries } = await pool.query('SELECT id, name, region_id FROM countries');
  const regionByName   = Object.fromEntries(dbRegions.map(r   => [r.name.toLowerCase(), r]));
  const countryByName  = Object.fromEntries(dbCountries.map(c => [c.name.toLowerCase(), c]));

  const planningCycleId = req.body.planning_cycle_id ? parseInt(req.body.planning_cycle_id, 10) : null;

  let inserted = 0, skipped = 0;
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const get  = col => { const j = idx(col); return j >= 0 ? row[j] : ''; };
    const name = String(get('name')).trim();
    if (!name) { skipped++; continue; }

    const type      = String(get('type')   || 'Retail').trim();
    const status    = String(get('status') || 'Proposed').trim();
    const weight    = parseFloat(get('weight'))   || 1.0;
    const rawKw     = get('power_kw');
    const power_kw  = rawKw !== '' && rawKw != null ? parseFloat(rawKw) : null;
    const year      = get('year')       ? parseInt(get('year'), 10)  : null;
    const metro     = String(get('metro')      || '').trim() || null;
    const phase_code = String(get('phase_code') || '').trim() || null;

    let region_id = null, country_id = null;
    const rName = String(get('region')  || '').trim().toLowerCase();
    const cName = String(get('country') || '').trim().toLowerCase();
    if (rName && regionByName[rName])   region_id  = regionByName[rName].id;
    if (cName && countryByName[cName]) {
      const c = countryByName[cName];
      country_id = c.id;
      if (!region_id) region_id = c.region_id;
    }

    try {
      await pool.query(
        `INSERT INTO projects (name, type, status, weight, power_kw, region_id, country_id, metro, phase_code, year, planning_cycle_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [name, type, status, weight, power_kw, region_id, country_id, metro, phase_code, year, planningCycleId, req.user.id]
      );
      inserted++;
    } catch (err) {
      errors.push({ row: i + 1, name, error: err.message });
      skipped++;
    }
  }

  res.json({ data: { inserted, skipped, errors } });
});

router.post('/', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, type, status, weight = 1.0, power_kw, region_id, country_id, metro, phase_code, year, planning_cycle_id } = req.body;
  if (!name || !type || !status) return res.status(400).json({ error: 'name, type, and status are required' });

  if (!await guardCycleEdit(planning_cycle_id, req, res)) return;

  const { rows } = await pool.query(
    `INSERT INTO projects (name, type, status, weight, power_kw, region_id, country_id, metro, phase_code, year, planning_cycle_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [name, type, status, weight, power_kw ?? null, region_id ?? null, country_id ?? null, metro ?? null, phase_code ?? null, year ?? null, planning_cycle_id ?? null, req.user.id]
  );
  await req.auditLog({ actionType: 'CREATE', resourceType: 'project', resourceId: rows[0].id, newValue: rows[0] });
  res.status(201).json({ data: rows[0] });
});

router.put('/:id', requireAuth, requireRole(...WRITER_ROLES), async (req, res) => {
  const { name, type, status, weight, power_kw, region_id, country_id, metro, phase_code, year, is_active, planning_cycle_id } = req.body;

  const { rows: [existing] } = await pool.query(
    'SELECT planning_cycle_id FROM projects WHERE id = $1',
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!await guardCycleEdit(existing.planning_cycle_id, req, res)) return;

  const sets = [];
  const params = [];
  let i = 1;

  if (name              !== undefined) { sets.push(`name = $${i++}`);              params.push(name); }
  if (type              !== undefined) { sets.push(`type = $${i++}`);              params.push(type); }
  if (status            !== undefined) { sets.push(`status = $${i++}`);            params.push(status); }
  if (weight            !== undefined) { sets.push(`weight = $${i++}`);            params.push(weight); }
  if (power_kw          !== undefined) { sets.push(`power_kw = $${i++}`);          params.push(power_kw); }
  if (region_id         !== undefined) { sets.push(`region_id = $${i++}`);         params.push(region_id); }
  if (country_id        !== undefined) { sets.push(`country_id = $${i++}`);        params.push(country_id); }
  if (metro             !== undefined) { sets.push(`metro = $${i++}`);             params.push(metro); }
  if (phase_code        !== undefined) { sets.push(`phase_code = $${i++}`);        params.push(phase_code); }
  if (year              !== undefined) { sets.push(`year = $${i++}`);              params.push(year); }
  if (is_active         !== undefined) { sets.push(`is_active = $${i++}`);         params.push(is_active); }
  if (planning_cycle_id !== undefined) { sets.push(`planning_cycle_id = $${i++}`); params.push(planning_cycle_id); }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  await req.auditLog({ actionType: 'UPDATE', resourceType: 'project', resourceId: rows[0].id, newValue: rows[0] });
  res.json({ data: rows[0] });
});

router.delete('/:id', requireAuth, requireRole(ROLES.PMO), async (req, res) => {
  const { rows: [existing] } = await pool.query(
    'SELECT planning_cycle_id FROM projects WHERE id = $1',
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!await guardCycleEdit(existing.planning_cycle_id, req, res)) return;

  const { rows } = await pool.query(
    'UPDATE projects SET is_active = FALSE WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  await req.auditLog({ actionType: 'DELETE', resourceType: 'project', resourceId: rows[0].id });
  res.status(204).end();
});

module.exports = router;
