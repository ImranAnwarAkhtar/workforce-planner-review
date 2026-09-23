const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GEARING_DISCIPLINES = ['Construction', 'Design', 'Commercial', 'Commissioning'];

function buildPipelineRows(projRows) {
  const byRegion = {};
  for (const row of projRows) {
    if (!byRegion[row.region_name]) {
      byRegion[row.region_name] = {
        region_name: row.region_name,
        sort_order: Number(row.sort_order),
        retail: { Approved: 0, Seeded: 0, Proposed: 0, weight: 0, Approved_weight: 0, Seeded_weight: 0, Proposed_weight: 0 },
        xscale: { Approved: 0, Seeded: 0, Proposed: 0, weight: 0, Approved_weight: 0, Seeded_weight: 0, Proposed_weight: 0 },
        total_weight: 0,
      };
    }
    const r = byRegion[row.region_name];
    const w = Number(row.total_weight);
    const n = Number(row.proj_count);
    if (row.type === 'xScale') {
      if (row.status in r.xscale) {
        r.xscale[row.status] += n;
        r.xscale[`${row.status}_weight`] += w;
      }
      r.xscale.weight += w;
    } else {
      if (row.status in r.retail) {
        r.retail[row.status] += n;
        r.retail[`${row.status}_weight`] += w;
      }
      r.retail.weight += w;
    }
    r.total_weight += w;
  }
  return Object.values(byRegion).sort((a, b) => a.sort_order - b.sort_order);
}

function buildPipelineByCountryRows(rows) {
  const byCountry = {};
  for (const row of rows) {
    const key = row.country_name || 'Unknown';
    if (!byCountry[key]) {
      byCountry[key] = {
        region_name: key,
        sort_order: Number(row.sort_order),
        retail: { Approved: 0, Seeded: 0, Proposed: 0, weight: 0 },
        xscale: { Approved: 0, Seeded: 0, Proposed: 0, weight: 0 },
        total_weight: 0,
      };
    }
    const r = byCountry[key];
    const w = Number(row.total_weight);
    const n = Number(row.proj_count);
    if (row.type === 'xScale') {
      if (row.status in r.xscale) r.xscale[row.status] += n;
      r.xscale.weight += w;
    } else {
      if (row.status in r.retail) r.retail[row.status] += n;
      r.retail.weight += w;
    }
    r.total_weight += w;
  }
  return Object.values(byCountry).sort((a, b) =>
    a.sort_order !== b.sort_order
      ? a.sort_order - b.sort_order
      : a.region_name.localeCompare(b.region_name)
  );
}

function buildHeadcountRows(hcRows) {
  const VP_DIR = new Set(['VP', 'Dr']);
  const byRegion = {};
  for (const row of hcRows) {
    const key = row.region_name;
    if (!byRegion[key]) {
      byRegion[key] = {
        region_name: key, sort_order: Number(row.sort_order),
        exist_vp_dir: 0, exist_fte: 0, exist_con: 0,
        appr_fte: 0, appr_con_fte: 0,
        req_fte: 0, req_con_fte: 0, req_con: 0,
      };
    }
    const r = byRegion[key];
    const n = Number(row.headcount);
    const code = row.contract_code;
    if (VP_DIR.has(code))       r.exist_vp_dir  += n;
    else if (code === 'CON')    r.exist_con      += n;
    else if (code === 'A FTE')  r.appr_fte       += n;
    else if (code === 'A CON>FTE') r.appr_con_fte += n;
    else if (code === 'R FTE')  r.req_fte        += n;
    else if (code === 'R CON>FTE') r.req_con_fte  += n;
    else if (code === 'R CON')  r.req_con        += n;
    else if (row.category === 'existing') r.exist_fte += n;
  }
  return Object.values(byRegion).map(r => ({
    ...r,
    existing_heads: r.exist_vp_dir + r.exist_fte + r.exist_con + r.appr_fte + r.appr_con_fte,
    total_heads:    r.exist_vp_dir + r.exist_fte + r.exist_con + r.appr_fte + r.appr_con_fte +
                    r.req_fte + r.req_con_fte + r.req_con,
  }))
  .filter(r => r.total_heads > 0)
  .sort((a, b) => a.sort_order - b.sort_order);
}

function buildGearingRows(projsByRegion, gearingConsts, peopleByDiscRegion, allRegionNames = []) {
  const regionNames = allRegionNames.length > 0
    ? allRegionNames
    : [...new Set(projsByRegion.map(p => p.region_name))];

  return GEARING_DISCIPLINES.map(disc => {
    const consts = gearingConsts.filter(g => g.discipline_name === disc);

    const regionRows = regionNames.map(region => {
      let minHC = 0, maxHC = 0;
      for (const c of consts) {
        const proj = projsByRegion.find(
          p => p.region_name === region && p.project_type === c.project_type
        );
        if (proj && Number(proj.total_weight) > 0) {
          minHC += Number(proj.total_weight) / Number(c.min_divisor);
          maxHC += Number(proj.total_weight) / Number(c.max_divisor);
        }
      }
      minHC = Math.round(minHC);
      maxHC = Math.round(maxHC);

      const optimal  = Math.round((minHC + maxHC) / 2);
      const proposed = peopleByDiscRegion
        .filter(p => p.discipline_name === disc && p.region_name === region &&
                     (p.category === 'existing' || p.category === 'approved'))
        .reduce((s, p) => s + Number(p.headcount), 0);
      const variance     = proposed - optimal;
      const variance_pct = optimal > 0 ? Math.round((variance / optimal) * 1000) / 10 : 0;
      return { region_name: region, min: minHC, max: maxHC, proposed, optimal, variance, variance_pct };
    });

    const tot = regionRows.reduce(
      (a, r) => ({ min: a.min + r.min, max: a.max + r.max, proposed: a.proposed + r.proposed }),
      { min: 0, max: 0, proposed: 0 }
    );
    const totOptimal      = Math.round((tot.min + tot.max) / 2);
    const totVariance     = tot.proposed - totOptimal;
    const totVariancePct  = totOptimal > 0 ? Math.round((totVariance / totOptimal) * 1000) / 10 : 0;

    return {
      discipline: disc,
      regions: regionRows,
      totals: { ...tot, optimal: totOptimal, variance: totVariance, variance_pct: totVariancePct },
    };
  });
}

function buildSummary(projRow, hcRows) {
  const perm       = hcRows.filter(r => r.category === 'existing' && !['VP','Dr','CON'].includes(r.contract_code)).reduce((s, r) => s + Number(r.headcount), 0)
                   + hcRows.filter(r => ['VP','Dr'].includes(r.contract_code)).reduce((s, r) => s + Number(r.headcount), 0);
  const contingent = hcRows.filter(r => r.contract_code === 'CON').reduce((s, r) => s + Number(r.headcount), 0);
  const appr_fte   = hcRows.filter(r => r.contract_code === 'A FTE').reduce((s, r) => s + Number(r.headcount), 0);
  const appr_con   = hcRows.filter(r => ['A CON', 'A CON>FTE'].includes(r.contract_code)).reduce((s, r) => s + Number(r.headcount), 0);
  const req_fte    = hcRows.filter(r => ['R FTE', 'R FTE 26'].includes(r.contract_code)).reduce((s, r) => s + Number(r.headcount), 0);
  const req_con    = hcRows.filter(r => ['R CON', 'R CON>FTE'].includes(r.contract_code)).reduce((s, r) => s + Number(r.headcount), 0);
  return {
    projects: {
      total:        Number(projRow.total_projects  || 0),
      retail:       Number(projRow.retail_count    || 0),
      xscale:       Number(projRow.xscale_count    || 0),
      total_weight: Number(projRow.total_weight    || 0),
      retail_weight:Number(projRow.retail_weight   || 0),
      xscale_weight:Number(projRow.xscale_weight   || 0),
    },
    exist_hc: { total: perm + contingent, perm, contingent },
    appr_hc:  { total: appr_fte + appr_con, fte: appr_fte, con: appr_con },
    req_hc:   { total: req_fte + req_con,   fte: req_fte,  con: req_con  },
  };
}

// ---------------------------------------------------------------------------
// Shared queries (year-independent)
// ---------------------------------------------------------------------------

async function fetchShared() {
  const [gcRes, hcRes, pdRes, trendRes, tbhRes, regRes, allRegRes] = await Promise.all([
    pool.query(`
      SELECT d.name AS discipline_name, gc.project_type,
             gc.min_divisor::float AS min_divisor,
             gc.max_divisor::float AS max_divisor
      FROM gearing_constants gc
      JOIN disciplines d ON d.id = gc.discipline_id
    `),
    pool.query(`
      SELECT r.name AS region_name, r.sort_order, ct.code AS contract_code,
             ct.category, COUNT(*)::int AS headcount
      FROM people pe
      JOIN person_regions pr  ON pr.person_id  = pe.id
      JOIN regions r           ON r.id          = pr.region_id
      JOIN contract_types ct  ON pe.contract_type_id = ct.id
      WHERE pe.is_active = TRUE
      GROUP BY r.name, r.sort_order, ct.code, ct.category
      ORDER BY r.sort_order
    `),
    pool.query(`
      SELECT d.name AS discipline_name, r.name AS region_name,
             ct.category, COUNT(*)::int AS headcount
      FROM people pe
      JOIN disciplines d       ON pe.discipline_id      = d.id
      JOIN person_regions pr   ON pr.person_id           = pe.id
      JOIN regions r           ON r.id                   = pr.region_id
      JOIN contract_types ct   ON pe.contract_type_id    = ct.id
      WHERE pe.is_active = TRUE
      GROUP BY d.name, r.name, ct.category
      ORDER BY d.name, r.name
    `),
    pool.query(`
      SELECT year, status, COUNT(*)::int AS count
      FROM projects
      WHERE is_active = TRUE AND year IS NOT NULL
      GROUP BY year, status
      ORDER BY year, status
    `),
    pool.query(`
      SELECT COALESCE(funding_year, 0) AS funding_year,
             COALESCE(req_status, 'Not Raised') AS req_status,
             COUNT(*)::int AS count
      FROM tbh_codes
      GROUP BY funding_year, req_status
      ORDER BY funding_year, count DESC
    `),
    pool.query(`SELECT name, code FROM regions WHERE name != 'Global' ORDER BY sort_order`),
    pool.query(`SELECT name, code FROM regions ORDER BY sort_order`),
  ]);
  const codeMap = Object.fromEntries(allRegRes.rows.map(r => [r.name, r.code || r.name]));
  return {
    gearingConsts:            gcRes.rows,
    hcByRegion:               hcRes.rows,
    peopleByDiscRegion:       pdRes.rows,
    projectTrend:             trendRes.rows,
    tbhStatus:                tbhRes.rows,
    allRegionNames:           regRes.rows.map(r => r.name),
    allRegionNamesWithGlobal: allRegRes.rows.map(r => r.name),
    regionCodeMap:            codeMap,
  };
}

// ---------------------------------------------------------------------------
// Year-scoped queries
// ---------------------------------------------------------------------------

async function fetchForYear(year) {
  const y = parseInt(year, 10);
  const [projSumRes, pipelineRes, pipelineCountryRes, projGearRes, reqRes, metaRes] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total_projects,
             COUNT(*) FILTER (WHERE type = 'Retail')::int AS retail_count,
             COUNT(*) FILTER (WHERE type = 'xScale')::int AS xscale_count,
             COALESCE(SUM(weight), 0)::float AS total_weight,
             COALESCE(SUM(weight) FILTER (WHERE type = 'Retail'), 0)::float AS retail_weight,
             COALESCE(SUM(weight) FILTER (WHERE type = 'xScale'), 0)::float AS xscale_weight
      FROM projects
      WHERE is_active = TRUE AND year = $1
    `, [y]),
    pool.query(`
      SELECT r.name AS region_name, r.sort_order,
             p.type, p.status,
             COUNT(*)::int AS proj_count,
             COALESCE(SUM(p.weight), 0)::float AS total_weight
      FROM projects p
      JOIN regions r ON p.region_id = r.id
      WHERE p.is_active = TRUE AND p.year = $1
      GROUP BY r.name, r.sort_order, p.type, p.status
      ORDER BY r.sort_order, p.type, p.status
    `, [y]),
    pool.query(`
      SELECT COALESCE(c.name, 'Unknown') AS country_name, r.sort_order,
             p.type, p.status,
             COUNT(*)::int AS proj_count,
             COALESCE(SUM(p.weight), 0)::float AS total_weight
      FROM projects p
      JOIN regions r ON p.region_id = r.id
      LEFT JOIN countries c ON p.country_id = c.id
      WHERE p.is_active = TRUE AND p.year = $1
      GROUP BY c.name, r.sort_order, p.type, p.status
      ORDER BY r.sort_order, COALESCE(c.name, 'zzz'), p.type, p.status
    `, [y]),
    pool.query(`
      SELECT r.name AS region_name, p.type AS project_type,
             COALESCE(SUM(p.weight), 0)::float AS total_weight,
             COUNT(*)::int AS proj_count
      FROM projects p
      JOIN regions r ON p.region_id = r.id
      WHERE p.is_active = TRUE AND p.year = $1
      GROUP BY r.name, p.type
    `, [y]),
    pool.query(`
      SELECT d.name AS discipline_name,
             r.name AS region_name,
             c.name AS country_name,
             l.short_code AS level_code,
             ct.code AS contract_code,
             pe.planning_year,
             pe.name AS person_name,
             pe.contracted_fte::float AS contracted_fte
      FROM people pe
      JOIN contract_types ct   ON pe.contract_type_id = ct.id
      JOIN disciplines d       ON pe.discipline_id    = d.id
      LEFT JOIN levels l       ON pe.level_id         = l.id
      JOIN person_regions pr   ON pr.person_id        = pe.id
      JOIN regions r           ON r.id                = pr.region_id
      LEFT JOIN person_countries pc ON pc.person_id   = pe.id
      LEFT JOIN countries c    ON c.id                = pc.country_id
      WHERE pe.is_active = TRUE AND ct.category = 'requested'
      ORDER BY d.name, r.name, c.name, l.short_code
    `),
    pool.query(`
      SELECT COUNT(DISTINCT country_id)::int AS countries_count,
             COUNT(DISTINCT metro) FILTER (WHERE metro IS NOT NULL AND metro != '')::int AS metros_count
      FROM projects
      WHERE is_active = TRUE AND year = $1
    `, [y]),
  ]);
  return {
    projSum:             projSumRes.rows[0] || {},
    pipelineRows:        pipelineRes.rows,
    pipelineCountryRows: pipelineCountryRes.rows,
    projsByRegion:       projGearRes.rows,
    requests:            reqRes.rows,
    meta:                metaRes.rows[0] || { countries_count: 0, metros_count: 0 },
  };
}

// ---------------------------------------------------------------------------
// GET /planning-years
// ---------------------------------------------------------------------------

router.get('/planning-years', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT year, is_active FROM planning_years ORDER BY year ASC`
  );
  res.json({ data: rows });
});

// ---------------------------------------------------------------------------
// GET /hub-iq?yearA=2026&yearB=2027
// ---------------------------------------------------------------------------

router.get('/hub-iq', requireAuth, async (req, res) => {
  const rawA = req.query.yearA;
  const rawB = req.query.yearB;

  const yearsReq = await pool.query(`SELECT year FROM planning_years ORDER BY year ASC`);
  const available = yearsReq.rows.map(r => r.year);

  const yearA = rawA ? parseInt(rawA, 10) : (available[0] ?? 2026);
  const yearB = rawB ? parseInt(rawB, 10) : (available[1] ?? 2027);

  const [shared, dataA, dataB] = await Promise.all([
    fetchShared(),
    fetchForYear(yearA),
    fetchForYear(yearB),
  ]);

  function buildYear(d) {
    return {
      summary:          buildSummary(d.projSum, shared.hcByRegion),
      pipeline:         buildPipelineRows(d.pipelineRows),
      pipeline_country: buildPipelineByCountryRows(d.pipelineCountryRows),
      headcount:        buildHeadcountRows(shared.hcByRegion),
      gearing:          buildGearingRows(d.projsByRegion, shared.gearingConsts, shared.peopleByDiscRegion, shared.allRegionNames),
      requests:         d.requests,
      meta:             d.meta,
    };
  }

  res.json({
    available_years: available,
    yearA,
    yearB,
    region_names:          shared.allRegionNames,
    all_region_names:      shared.allRegionNamesWithGlobal,
    region_code_map:       shared.regionCodeMap,
    project_trend: shared.projectTrend,
    tbh_status:    shared.tbhStatus,
    years: {
      [yearA]: buildYear(dataA),
      [yearB]: buildYear(dataB),
    },
  });
});

// ---------------------------------------------------------------------------
// Existing endpoints (unchanged)
// ---------------------------------------------------------------------------

router.get('/summary', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM people WHERE is_active = TRUE)::int            AS total_people,
      (SELECT COUNT(*) FROM projects WHERE is_active = TRUE)::int          AS total_projects,
      (SELECT COUNT(*) FROM allocations)::int                              AS total_allocations,
      (SELECT COUNT(*) FROM hire_requests WHERE status = 'Pending')::int  AS pending_hire_requests,
      (SELECT COUNT(*) FROM change_requests WHERE status = 'Pending')::int AS pending_change_requests,
      (SELECT COUNT(*) FROM tbh_codes WHERE req_status IS NULL OR req_status != 'Filled')::int AS open_tbh_codes
  `);
  res.json({ data: rows[0] });
});

router.get('/capacity', requireAuth, async (req, res) => {
  const { month, region_id } = req.query;
  if (!month) return res.status(400).json({ error: 'month query parameter required (YYYY-MM-DD)' });

  const conditions = [`a.month = $1`];
  const params = [month];
  let i = 2;

  if (region_id) {
    conditions.push(
      `EXISTS (SELECT 1 FROM person_regions pr WHERE pr.person_id = pe.id AND pr.region_id = $${i++})`
    );
    params.push(parseInt(region_id, 10));
  }

  const { rows } = await pool.query(
    `SELECT pe.id, pe.name, pe.contracted_fte,
            COALESCE(SUM(a.fte_value), 0) AS allocated_fte,
            COALESCE(SUM(a.fte_value), 0) / NULLIF(pe.contracted_fte, 0) AS utilisation_ratio,
            d.name AS discipline_name, ct.code AS contract_type_code, ct.colour_hex
     FROM people pe
     LEFT JOIN allocations a ON a.person_id = pe.id AND ${conditions[0]}
     LEFT JOIN disciplines d ON pe.discipline_id = d.id
     LEFT JOIN contract_types ct ON pe.contract_type_id = ct.id
     WHERE pe.is_active = TRUE
       ${region_id ? `AND EXISTS (SELECT 1 FROM person_regions pr WHERE pr.person_id = pe.id AND pr.region_id = $${i - 1})` : ''}
     GROUP BY pe.id, pe.name, pe.contracted_fte, d.name, ct.code, ct.colour_hex
     ORDER BY utilisation_ratio DESC NULLS LAST`,
    params
  );
  res.json({ data: rows });
});

router.get('/gearing', requireAuth, async (req, res) => {
  const { year, region_id } = req.query;
  const conditions = ['pr.is_active = TRUE'];
  const params = [];
  let i = 1;

  if (year)      { conditions.push(`pr.year = $${i++}`);       params.push(parseInt(year, 10)); }
  if (region_id) { conditions.push(`pr.region_id = $${i++}`);  params.push(parseInt(region_id, 10)); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT d.name AS discipline_name, pr.type AS project_type,
            COUNT(DISTINCT pr.id) AS project_count,
            COUNT(DISTINCT pe.id) FILTER (WHERE pe.discipline_id = d.id) AS people_count,
            gc.min_divisor, gc.max_divisor,
            CASE WHEN gc.min_divisor > 0
                 THEN ROUND(COUNT(DISTINCT pr.id)::numeric / gc.min_divisor, 2)
                 ELSE NULL END AS min_headcount_needed,
            CASE WHEN gc.max_divisor > 0
                 THEN ROUND(COUNT(DISTINCT pr.id)::numeric / gc.max_divisor, 2)
                 ELSE NULL END AS max_headcount_needed
     FROM projects pr
     CROSS JOIN disciplines d
     LEFT JOIN gearing_constants gc ON gc.discipline_id = d.id AND gc.project_type = pr.type
     LEFT JOIN people pe ON pe.discipline_id = d.id AND pe.is_active = TRUE
     ${where}
     GROUP BY d.name, pr.type, gc.min_divisor, gc.max_divisor
     ORDER BY d.name ASC, pr.type ASC`,
    params
  );
  res.json({ data: rows });
});

module.exports = router;
