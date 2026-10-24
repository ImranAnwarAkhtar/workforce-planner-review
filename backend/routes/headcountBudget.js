const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// Shared data fetch for budget summary
// ---------------------------------------------------------------------------
function safeQuery(q, params = []) {
  return pool.query(q, params).catch(() => ({ rows: [] }));
}

async function fetchBudgetData(cycleId = null) {
  // When a specific cycle is selected, filter requested headcount to that cycle only.
  // Existing and approved headcount is always included (cycle-agnostic).
  const safeId = cycleId != null ? parseInt(cycleId, 10) : null;
  const cycleFilter = safeId != null
    ? 'AND (ct.category IN (\'existing\', \'approved\') OR pe.planning_cycle_id = $1)'
    : '';
  const cycleParams = safeId != null ? [safeId] : [];
  const cycleDetailFilter = safeId != null ? 'AND pe.planning_cycle_id = $1' : '';

  const [kpiRes, byDiscRegionRes, byRegionTypeRes, gearingRes, pipelineRes, disciplinesRes, regionsRes, cyclesRes, requestsDetailRes] = await Promise.all([
    // KPIs: headcount breakdown by category
    safeQuery(`
      SELECT
        COUNT(*) FILTER (WHERE ct.category = 'existing')::int   AS exist_total,
        COUNT(*) FILTER (WHERE ct.code = 'CON')::int            AS exist_con,
        COUNT(*) FILTER (WHERE ct.code IN ('FTE','SNR'))::int   AS exist_fte,
        COUNT(*) FILTER (WHERE ct.code = 'A FTE')::int         AS appr_fte,
        COUNT(*) FILTER (WHERE ct.code = 'A CON')::int         AS appr_con,
        COUNT(*) FILTER (WHERE ct.code = 'R FTE')::int         AS req_fte,
        COUNT(*) FILTER (WHERE ct.code = 'R CON')::int         AS req_con,
        COUNT(*) FILTER (WHERE ct.code = 'R CON>FTE')::int     AS req_con_fte
      FROM people pe
      JOIN contract_types ct ON pe.contract_type_id = ct.id
      WHERE pe.is_active = TRUE ${cycleFilter}
    `, cycleParams),
    // Headcount by discipline × region × contract category
    safeQuery(`
      SELECT d.name AS discipline, r.name AS region, r.sort_order,
             ct.code AS contract_code, ct.category,
             COUNT(*)::int AS headcount
      FROM people pe
      JOIN disciplines d       ON pe.discipline_id    = d.id
      JOIN person_regions pr   ON pr.person_id        = pe.id
      JOIN regions r           ON r.id                = pr.region_id
      JOIN contract_types ct   ON pe.contract_type_id = ct.id
      WHERE pe.is_active = TRUE ${cycleFilter}
      GROUP BY d.name, r.name, r.sort_order, ct.code, ct.category
      ORDER BY d.name, r.sort_order
    `, cycleParams),
    // Headcount by region × contract type (for head-type table)
    safeQuery(`
      SELECT r.name AS region, r.sort_order,
             ct.code AS contract_code, ct.category,
             COUNT(*)::int AS headcount
      FROM people pe
      JOIN person_regions pr ON pr.person_id = pe.id
      JOIN regions r         ON r.id         = pr.region_id
      JOIN contract_types ct ON pe.contract_type_id = ct.id
      WHERE pe.is_active = TRUE ${cycleFilter}
      GROUP BY r.name, r.sort_order, ct.code, ct.category
      ORDER BY r.sort_order
    `, cycleParams),
    // Gearing constants
    safeQuery(`
      SELECT d.name AS discipline_name, gc.project_type,
             gc.min_divisor::float, gc.max_divisor::float
      FROM gearing_constants gc
      JOIN disciplines d ON d.id = gc.discipline_id
      ORDER BY d.name, gc.project_type
    `),
    // Project pipeline by region
    safeQuery(`
      SELECT r.name AS region, r.sort_order, p.type, p.status,
             COUNT(*)::int AS proj_count,
             COALESCE(SUM(p.weight), 0)::float AS total_weight
      FROM projects p
      JOIN regions r ON p.region_id = r.id
      WHERE p.is_active = TRUE
      GROUP BY r.name, r.sort_order, p.type, p.status
      ORDER BY r.sort_order, p.type, p.status
    `),
    safeQuery(`SELECT id, name FROM disciplines ORDER BY name`),
    safeQuery(`SELECT name, sort_order FROM regions WHERE name != 'Global' ORDER BY sort_order`),
    safeQuery(`SELECT id, name, status FROM planning_cycles ORDER BY created_at DESC LIMIT 10`),
    // Requested headcount detail (for appendix-style breakdown)
    safeQuery(`
      SELECT pe.name, d.name AS discipline, r.name AS region,
             l.short_code AS level, ct.code AS contract_code,
             pe.dept_head, pe.hiring_manager,
             pc.name AS planning_cycle
      FROM people pe
      JOIN contract_types ct   ON pe.contract_type_id = ct.id
      LEFT JOIN disciplines d  ON pe.discipline_id    = d.id
      LEFT JOIN levels l       ON pe.level_id         = l.id
      LEFT JOIN person_regions pr ON pr.person_id     = pe.id
      LEFT JOIN regions r      ON r.id                = pr.region_id
      LEFT JOIN planning_cycles pc ON pe.planning_cycle_id = pc.id
      WHERE pe.is_active = TRUE AND ct.category = 'requested'
        ${cycleDetailFilter}
      ORDER BY d.name NULLS LAST, r.name NULLS LAST, pe.name
    `, cycleParams),
  ]);

  const kpi = kpiRes.rows[0] || {};
  const existTotal = parseInt(kpi.exist_total || 0, 10);
  const existCon   = parseInt(kpi.exist_con || 0, 10);
  const reqFte     = parseInt(kpi.req_fte || 0, 10);
  const reqCon     = parseInt(kpi.req_con || 0, 10);
  const reqConFte  = parseInt(kpi.req_con_fte || 0, 10);
  const apprFte    = parseInt(kpi.appr_fte || 0, 10);
  const conPct     = existTotal > 0 ? ((existCon / existTotal) * 100).toFixed(1) : '0.0';

  // Build project pipeline
  const pipelineByRegion = {};
  for (const row of pipelineRes.rows) {
    if (!pipelineByRegion[row.region]) {
      pipelineByRegion[row.region] = { region: row.region, sort_order: row.sort_order, Approved: 0, Seeded: 0, Proposed: 0, total: 0, retail_weight: 0, xscale_weight: 0 };
    }
    const r = pipelineByRegion[row.region];
    r[row.status] = (r[row.status] || 0) + row.proj_count;
    r.total += row.proj_count;
    if (row.type === 'xScale') r.xscale_weight += row.total_weight;
    else r.retail_weight += row.total_weight;
  }

  // Build headcount by discipline × region
  const discList = ['Construction', 'Design', 'Commercial', 'Commissioning', 'Other'];
  const regionList = regionsRes.rows.map(r => r.name);

  const discRegionMatrix = {};
  for (const d of discList) {
    discRegionMatrix[d] = {};
    for (const r of [...regionList, 'Global', 'Total']) {
      discRegionMatrix[d][r] = { existing: 0, approved: 0, requested: 0 };
    }
  }

  for (const row of byDiscRegionRes.rows) {
    const disc = discList.includes(row.discipline) ? row.discipline : 'Other';
    const region = row.region;
    if (!discRegionMatrix[disc]) continue;
    if (!discRegionMatrix[disc][region]) discRegionMatrix[disc][region] = { existing: 0, approved: 0, requested: 0 };
    const cell = discRegionMatrix[disc][region];
    if (row.category === 'existing') cell.existing += row.headcount;
    else if (row.category === 'approved') cell.approved += row.headcount;
    else if (row.category === 'requested') cell.requested += row.headcount;

    // Accumulate totals
    const totCell = discRegionMatrix[disc]['Total'];
    if (row.category === 'existing') totCell.existing += row.headcount;
    else if (row.category === 'approved') totCell.approved += row.headcount;
    else if (row.category === 'requested') totCell.requested += row.headcount;
  }

  // Build headcount by region × type
  const byRegionType = {};
  for (const row of byRegionTypeRes.rows) {
    const reg = row.region;
    if (!byRegionType[reg]) byRegionType[reg] = { region: reg, sort_order: row.sort_order, snr: 0, fte: 0, con: 0, appr_fte: 0, req_fte: 0, req_con_fte: 0, req_con: 0 };
    const r = byRegionType[reg];
    if (row.contract_code === 'SNR')         r.snr      += row.headcount;
    else if (row.contract_code === 'FTE')    r.fte      += row.headcount;
    else if (row.contract_code === 'CON')    r.con      += row.headcount;
    else if (row.contract_code === 'A FTE')  r.appr_fte += row.headcount;
    else if (row.contract_code === 'R FTE')  r.req_fte  += row.headcount;
    else if (row.contract_code === 'R CON>FTE') r.req_con_fte += row.headcount;
    else if (row.contract_code === 'R CON')  r.req_con  += row.headcount;
  }

  // Build gearing calculations per discipline
  const GEARING_DISCS = ['Construction', 'Design', 'Commercial', 'Commissioning'];
  const projsByRegion = {};
  for (const row of pipelineRes.rows) {
    const key = `${row.region}|${row.type}`;
    if (!projsByRegion[key]) projsByRegion[key] = { region: row.region, type: row.type, weight: 0 };
    projsByRegion[key].weight += row.total_weight;
  }

  const gearingTables = GEARING_DISCS.map(disc => {
    const consts = gearingRes.rows.filter(g => g.discipline_name === disc);
    const regionRows = regionList.map(region => {
      let minHC = 0, maxHC = 0;
      for (const c of consts) {
        const key = `${region}|${c.project_type}`;
        const pw = projsByRegion[key]?.weight || 0;
        if (pw > 0) {
          minHC += pw / c.min_divisor;
          maxHC += pw / c.max_divisor;
        }
      }
      minHC = Math.round(minHC);
      maxHC = Math.round(maxHC);
      const optimal = Math.round((minHC + maxHC) / 2);

      // Proposed = existing + approved for this discipline/region
      const cell = discRegionMatrix[disc]?.[region] || { existing: 0, approved: 0, requested: 0 };
      const proposed = cell.existing + cell.approved;
      const variance = proposed - optimal;
      const variance_pct = optimal > 0 ? Math.round((variance / optimal) * 1000) / 10 : 0;
      return { region, min: minHC, max: maxHC, proposed, optimal, variance, variance_pct };
    });

    const tot = regionRows.reduce((a, r) => ({ min: a.min + r.min, max: a.max + r.max, proposed: a.proposed + r.proposed }), { min: 0, max: 0, proposed: 0 });
    const totOptimal = Math.round((tot.min + tot.max) / 2);
    const totVariance = tot.proposed - totOptimal;
    const totVariancePct = totOptimal > 0 ? Math.round((totVariance / totOptimal) * 1000) / 10 : 0;

    return {
      discipline: disc,
      regions: regionRows,
      totals: { ...tot, optimal: totOptimal, variance: totVariance, variance_pct: totVariancePct },
    };
  });

  return {
    kpis: {
      total_existing: existTotal,
      exist_fte: parseInt(kpi.exist_fte || 0, 10),
      exist_con: existCon,
      appr_fte: apprFte,
      req_fte: reqFte,
      req_con: reqCon,
      req_con_fte: reqConFte,
      contingent_pct: parseFloat(conPct),
      total_with_requests: existTotal + reqFte + reqCon + reqConFte,
    },
    headcount_by_function: {
      disciplines: discList,
      regions: [...regionList, 'Total'],
      matrix: discRegionMatrix,
    },
    headcount_by_type: Object.values(byRegionType).sort((a, b) => a.sort_order - b.sort_order),
    gearing: gearingTables,
    pipeline: Object.values(pipelineByRegion).sort((a, b) => a.sort_order - b.sort_order),
    planning_cycles: cyclesRes.rows,
    regions: regionList,
    requests_detail: requestsDetailRes.rows,
  };
}

// ---------------------------------------------------------------------------
// GET /api/headcount-budget/  (health check — confirms route is registered)
// ---------------------------------------------------------------------------
router.get('/', requireAuth, (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// GET /api/headcount-budget/data
// ---------------------------------------------------------------------------
router.get('/data', requireAuth, async (req, res) => {
  try {
    const cycleId = req.query.cycle_id ? parseInt(req.query.cycle_id, 10) : null;
    const data = await fetchBudgetData(cycleId);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load budget data', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/headcount-budget/report  → streams a .pptx file
// ---------------------------------------------------------------------------
router.get('/report', requireAuth, async (req, res) => {
  let pptxgen;
  try {
    pptxgen = require('pptxgenjs');
  } catch {
    return res.status(503).json({ error: 'PPTX generation library not available. Please ensure pptxgenjs is installed.' });
  }

  const cycleId = req.query.cycle_id ? parseInt(req.query.cycle_id, 10) : null;
  const d = await fetchBudgetData(cycleId);
  const cycle = (cycleId != null ? d.planning_cycles.find(c => c.id === cycleId) : null)
    || d.planning_cycles.find(c => c.status === 'active')
    || d.planning_cycles[0];
  const cycleLabel = cycle ? cycle.name : new Date().getFullYear().toString();

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  // Equinix brand palette (from Equinix 16:9 Widescreen 2026 theme)
  const RED    = 'E91C24';  // accent1 — Equinix Red
  const DARK   = '1A1A2E';  // near-black for dark slide backgrounds
  const HDRFIL = '000000';  // pure black for content slide header bar
  const WHITE  = 'FFFFFF';
  const LGRAY  = 'F2F3F5';  // lt2 — Equinix light background
  const MGRAY  = '5A657B';  // dk2 — Equinix cool grey
  const DGRAY  = '374151';
  const GREEN  = '33A85C';
  const AMBER  = 'FDB90D';  // accent5 — Equinix Gold
  const VIOLET = '411980';  // Dark Violet
  const BLUE   = '086AE3';  // accent4 — Equinix Blue
  const FONT   = 'Arial';

  function addSectionDivider(title, subtitle) {
    const sl = pres.addSlide();
    sl.background = { color: DARK };
    // Red accent bar on left
    sl.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 5.63, fill: { color: RED } });
    sl.addText(title, { x: 0.5, y: 1.85, w: 12.3, h: 0.85, fontSize: 40, bold: true, color: WHITE, fontFace: FONT, isTextBox: true });
    if (subtitle) sl.addText(subtitle, { x: 0.5, y: 2.78, w: 12.3, h: 0.5, fontSize: 18, color: MGRAY, fontFace: FONT, isTextBox: true });
    sl.addText('© 2026 Equinix, Inc.', { x: 0.5, y: 5.3, w: 6, h: 0.22, fontSize: 8, color: MGRAY, fontFace: FONT, isTextBox: true });
  }

  function addContentSlide(title) {
    const sl = pres.addSlide();
    sl.background = { color: WHITE };
    sl.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.6, fill: { color: HDRFIL } });
    sl.addText(title, { x: 0.3, y: 0.1, w: 11.8, h: 0.42, fontSize: 16, bold: true, color: WHITE, fontFace: FONT, isTextBox: true, margin: 0 });
    sl.addShape(pres.ShapeType.rect, { x: 0, y: 5.38, w: 13.33, h: 0.25, fill: { color: LGRAY } });
    sl.addText('© 2026 Equinix, Inc.', { x: 0.3, y: 5.4, w: 4, h: 0.18, fontSize: 8, color: MGRAY, fontFace: FONT, isTextBox: true, margin: 0 });
    sl.addText(`GDC Headcount Budget · ${cycleLabel}`, { x: 8, y: 5.4, w: 5, h: 0.18, fontSize: 8, color: MGRAY, fontFace: FONT, isTextBox: true, align: 'right', margin: 0 });
    return sl;
  }

  // ─── Slide 1: Title ───────────────────────────────────────────────────────
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: DARK };
  titleSlide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 5.63, fill: { color: RED } });
  titleSlide.addText('GDC Headcount Budget', { x: 0.5, y: 1.4, w: 11.5, h: 1.0, fontSize: 44, bold: true, color: WHITE, fontFace: FONT, isTextBox: true });
  titleSlide.addText(`Planning Cycle: ${cycleLabel}`, { x: 0.5, y: 2.55, w: 11.5, h: 0.55, fontSize: 22, color: MGRAY, fontFace: FONT, isTextBox: true });
  titleSlide.addText(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { x: 0.5, y: 3.2, w: 8, h: 0.35, fontSize: 14, color: MGRAY, fontFace: FONT, isTextBox: true });
  titleSlide.addText('© 2026 Equinix, Inc.', { x: 0.5, y: 5.28, w: 6, h: 0.24, fontSize: 8, color: MGRAY, fontFace: FONT, isTextBox: true });

  // ─── Slide 2: Executive Summary KPIs ─────────────────────────────────────
  const execSlide = addContentSlide('Executive Summary');
  const kpis = [
    { label: 'Total Workforce', value: d.kpis.total_existing.toString(), sub: 'Current headcount', color: HDRFIL },
    { label: 'FTE Requests', value: d.kpis.req_fte.toString(), sub: 'New FTE positions', color: RED },
    { label: 'Contingent Requests', value: d.kpis.req_con.toString(), sub: 'Contingent workers', color: VIOLET },
    { label: 'Contingent Workforce', value: `${d.kpis.contingent_pct}%`, sub: 'Of existing headcount', color: BLUE },
  ];
  kpis.forEach((k, i) => {
    const x = 0.4 + i * 3.15;
    execSlide.addShape(pres.ShapeType.rect, { x, y: 0.85, w: 2.9, h: 1.5, fill: { color: LGRAY }, line: { color: 'E0E3E8', width: 1 } });
    execSlide.addText(k.value, { x: x + 0.15, y: 0.95, w: 2.6, h: 0.8, fontSize: 40, bold: true, color: k.color, fontFace: FONT, isTextBox: true });
    execSlide.addText(k.label, { x: x + 0.15, y: 1.65, w: 2.6, h: 0.3, fontSize: 12, bold: true, color: DGRAY, fontFace: FONT, isTextBox: true });
    execSlide.addText(k.sub, { x: x + 0.15, y: 1.95, w: 2.6, h: 0.25, fontSize: 10, color: MGRAY, fontFace: FONT, isTextBox: true });
  });

  // Summary text
  execSlide.addText(
    `The current workforce stands at ${d.kpis.total_existing} headcount. ` +
    `This planning cycle includes ${d.kpis.req_fte} new FTE requests and ${d.kpis.req_con} contingent requests. ` +
    `${d.kpis.contingent_pct}% of the existing workforce is contingent.`,
    { x: 0.4, y: 2.55, w: 12.4, h: 0.8, fontSize: 12, color: DGRAY, fontFace: FONT, isTextBox: true, wrap: true }
  );

  // ─── Slide 3: Divider – Headcount Summary ────────────────────────────────
  addSectionDivider('Headcount Summary', 'By function and head type');

  // ─── Slide 4: Headcount by Function ──────────────────────────────────────
  const fnSlide = addContentSlide('Headcount Summary — By Function');
  const fnDiscs = d.headcount_by_function.disciplines;
  const fnRegions = d.headcount_by_function.regions;
  const fnMatrix = d.headcount_by_function.matrix;
  const fnCols = [['Discipline', 1.4], ...fnRegions.map(r => [r.length > 8 ? r.slice(0, 8) : r, 0.85])];
  const fnHeaders = fnCols.map(([h]) => ({ text: h, options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } }));
  const fnRows = [fnHeaders];
  for (const disc of fnDiscs) {
    const row = [{ text: disc, options: { bold: true, color: DGRAY, fontSize: 9 } }];
    for (const reg of fnRegions) {
      const cell = fnMatrix[disc]?.[reg] || { existing: 0, requested: 0 };
      const total = cell.existing + cell.requested;
      row.push({ text: total > 0 ? total.toString() : '—', options: { color: total > 0 ? DGRAY : MGRAY, fontSize: 9, align: 'center' } });
    }
    fnRows.push(row);
  }
  // Total row
  const totalRow = [{ text: 'TOTAL', options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } }];
  for (const reg of fnRegions) {
    let t = 0;
    for (const disc of fnDiscs) t += (fnMatrix[disc]?.[reg]?.existing || 0) + (fnMatrix[disc]?.[reg]?.requested || 0);
    totalRow.push({ text: t > 0 ? t.toString() : '—', options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } });
  }
  fnRows.push(totalRow);
  fnSlide.addTable(fnRows, {
    x: 0.3, y: 0.75, w: 12.7,
    colW: fnCols.map(([, w]) => w),
    border: { type: 'solid', color: 'E0E3E8', size: 1 },
    rowH: 0.32,
    fontFace: FONT,
  });

  // ─── Slide 5: Headcount by Head Type ─────────────────────────────────────
  const htSlide = addContentSlide('Headcount Summary — By Head Type');
  const htHeaders = [
    { text: 'Region',        options: { bold: true, color: WHITE, fill: DARK, fontSize: 9 } },
    { text: 'Senior Staff',  options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'FTE',           options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'Contingent',    options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'Approved FTE',  options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'Req FTE',       options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'Req Cont',      options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
    { text: 'Total',         options: { bold: true, color: WHITE, fill: DARK, fontSize: 9, align: 'center' } },
  ];
  const htRows = [htHeaders];
  let htTotals = { snr: 0, fte: 0, con: 0, appr_fte: 0, req_fte: 0, req_con: 0, total: 0 };
  for (const r of d.headcount_by_type) {
    const total = r.snr + r.fte + r.con + r.appr_fte + r.req_fte + r.req_con + r.req_con_fte;
    htTotals.snr += r.snr; htTotals.fte += r.fte; htTotals.con += r.con;
    htTotals.appr_fte += r.appr_fte; htTotals.req_fte += r.req_fte; htTotals.req_con += r.req_con; htTotals.total += total;
    htRows.push([
      { text: r.region, options: { bold: false, color: DGRAY, fontSize: 9 } },
      { text: r.snr > 0 ? r.snr.toString() : '—', options: { color: DGRAY, fontSize: 9, align: 'center' } },
      { text: r.fte > 0 ? r.fte.toString() : '—', options: { color: DGRAY, fontSize: 9, align: 'center' } },
      { text: r.con > 0 ? r.con.toString() : '—', options: { color: DGRAY, fontSize: 9, align: 'center' } },
      { text: r.appr_fte > 0 ? r.appr_fte.toString() : '—', options: { color: DGRAY, fontSize: 9, align: 'center' } },
      { text: r.req_fte > 0 ? r.req_fte.toString() : '—', options: { color: RED, bold: r.req_fte > 0, fontSize: 9, align: 'center' } },
      { text: r.req_con > 0 ? r.req_con.toString() : '—', options: { color: VIOLET, bold: r.req_con > 0, fontSize: 9, align: 'center' } },
      { text: total > 0 ? total.toString() : '—', options: { bold: true, color: DGRAY, fontSize: 9, align: 'center' } },
    ]);
  }
  htRows.push([
    { text: 'TOTAL', options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
    { text: htTotals.snr.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.fte.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.con.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.appr_fte.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.req_fte.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.req_con.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
    { text: htTotals.total.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
  ]);
  htSlide.addTable(htRows, {
    x: 0.3, y: 0.75, w: 12.7,
    colW: [2.2, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.4],
    border: { type: 'solid', color: 'E0E3E8', size: 1 },
    rowH: 0.35,
    fontFace: FONT,
  });

  // ─── Slide 6: Divider – Gearing Ratios ───────────────────────────────────
  addSectionDivider('Gearing Ratios', 'Proposed headcount vs project-driven requirements');

  // ─── Slides 7-10: Gearing per discipline ─────────────────────────────────
  for (const gd of d.gearing) {
    const gs = addContentSlide(`Gearing Ratio — ${gd.discipline}`);
    const grHeaders = [
      { text: 'Region',   options: { bold: true, color: WHITE, fill: DARK, fontSize: 10 } },
      { text: 'Min',      options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
      { text: 'Max',      options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
      { text: 'Proposed', options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
      { text: 'Optimal',  options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
      { text: 'Variance', options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
      { text: 'Var %',    options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
    ];
    const grRows = [grHeaders];
    for (const r of gd.regions) {
      if (r.min === 0 && r.max === 0 && r.proposed === 0) continue;
      const varColor = r.variance > 0 ? AMBER : r.variance < 0 ? RED : GREEN;
      grRows.push([
        { text: r.region, options: { color: DGRAY, fontSize: 10 } },
        { text: r.min.toString(), options: { color: MGRAY, fontSize: 10, align: 'center' } },
        { text: r.max.toString(), options: { color: MGRAY, fontSize: 10, align: 'center' } },
        { text: r.proposed.toString(), options: { bold: true, color: DGRAY, fontSize: 10, align: 'center' } },
        { text: r.optimal.toString(), options: { color: DGRAY, fontSize: 10, align: 'center' } },
        { text: (r.variance > 0 ? '+' : '') + r.variance.toString(), options: { bold: true, color: varColor, fontSize: 10, align: 'center' } },
        { text: (r.variance_pct > 0 ? '+' : '') + r.variance_pct + '%', options: { bold: true, color: varColor, fontSize: 10, align: 'center' } },
      ]);
    }
    // Grand total row
    const t = gd.totals;
    const tVarColor = t.variance > 0 ? AMBER : t.variance < 0 ? RED : GREEN;
    grRows.push([
      { text: 'Grand Total', options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10 } },
      { text: t.min.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
      { text: t.max.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
      { text: t.proposed.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
      { text: t.optimal.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
      { text: (t.variance > 0 ? '+' : '') + t.variance.toString(), options: { bold: true, color: tVarColor, fill: HDRFIL, fontSize: 10, align: 'center' } },
      { text: (t.variance_pct > 0 ? '+' : '') + t.variance_pct + '%', options: { bold: true, color: tVarColor, fill: HDRFIL, fontSize: 10, align: 'center' } },
    ]);
    gs.addTable(grRows, {
      x: 0.5, y: 0.75, w: 12.3,
      colW: [2.5, 1.3, 1.3, 1.6, 1.6, 1.6, 1.4],
      border: { type: 'solid', color: 'E0E3E8', size: 1 },
      rowH: 0.42,
      fontFace: FONT,
    });
  }

  // ─── Slide 11: Project Pipeline ───────────────────────────────────────────
  addSectionDivider('Project Pipeline', 'By region and status');
  const ppSlide = addContentSlide('Project Pipeline — By Region');
  const ppHeaders = [
    { text: 'Region',   options: { bold: true, color: WHITE, fill: DARK, fontSize: 10 } },
    { text: 'Approved', options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
    { text: 'Seeded',   options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
    { text: 'Proposed', options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
    { text: 'Total',    options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
    { text: 'Adj Weight', options: { bold: true, color: WHITE, fill: DARK, fontSize: 10, align: 'center' } },
  ];
  const ppRows = [ppHeaders];
  let ppTot = { Approved: 0, Seeded: 0, Proposed: 0, total: 0, weight: 0 };
  for (const r of d.pipeline) {
    ppTot.Approved += r.Approved || 0; ppTot.Seeded += r.Seeded || 0;
    ppTot.Proposed += r.Proposed || 0; ppTot.total += r.total || 0;
    ppTot.weight += r.retail_weight + r.xscale_weight;
    const adjWeight = r.retail_weight + r.xscale_weight;
    ppRows.push([
      { text: r.region, options: { color: DGRAY, fontSize: 10 } },
      { text: r.Approved?.toString() || '0', options: { color: DGRAY, fontSize: 10, align: 'center' } },
      { text: r.Seeded?.toString() || '0', options: { color: DGRAY, fontSize: 10, align: 'center' } },
      { text: r.Proposed?.toString() || '0', options: { color: DGRAY, fontSize: 10, align: 'center' } },
      { text: r.total?.toString() || '0', options: { bold: true, color: DGRAY, fontSize: 10, align: 'center' } },
      { text: adjWeight.toFixed(1), options: { color: MGRAY, fontSize: 10, align: 'center' } },
    ]);
  }
  ppRows.push([
    { text: 'TOTAL', options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10 } },
    { text: ppTot.Approved.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
    { text: ppTot.Seeded.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
    { text: ppTot.Proposed.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
    { text: ppTot.total.toString(), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
    { text: ppTot.weight.toFixed(1), options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 10, align: 'center' } },
  ]);
  ppSlide.addTable(ppRows, {
    x: 0.5, y: 0.75, w: 12.3,
    colW: [3.0, 1.8, 1.8, 1.8, 1.8, 2.1],
    border: { type: 'solid', color: 'E0E3E8', size: 1 },
    rowH: 0.42,
    fontFace: FONT,
  });

  // ─── Headcount Requests Appendix ─────────────────────────────────────────
  if (d.requests_detail.length > 0) {
    addSectionDivider('Appendix', 'Headcount requests — detail');
    const reqSlide = addContentSlide('Headcount Requests — Detail');
    const reqHeaders = [
      { text: 'Name',            options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
      { text: 'Discipline',      options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
      { text: 'Region',          options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
      { text: 'Level',           options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
      { text: 'Type',            options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9, align: 'center' } },
      { text: 'Hiring Manager',  options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
      { text: 'Planning Cycle',  options: { bold: true, color: WHITE, fill: HDRFIL, fontSize: 9 } },
    ];
    const reqRows = [reqHeaders];
    for (const r of d.requests_detail) {
      const typeColor = r.contract_code && r.contract_code.startsWith('R FTE') ? RED : VIOLET;
      reqRows.push([
        { text: r.name || '—', options: { color: DGRAY, fontSize: 8 } },
        { text: r.discipline || '—', options: { color: MGRAY, fontSize: 8 } },
        { text: r.region || '—', options: { color: MGRAY, fontSize: 8 } },
        { text: r.level || '—', options: { color: DGRAY, fontSize: 8, align: 'center' } },
        { text: r.contract_code || '—', options: { color: typeColor, bold: true, fontSize: 8, align: 'center' } },
        { text: r.hiring_manager || '—', options: { color: MGRAY, fontSize: 8 } },
        { text: r.planning_cycle || '—', options: { color: MGRAY, fontSize: 8 } },
      ]);
    }
    reqSlide.addTable(reqRows, {
      x: 0.3, y: 0.7, w: 12.7,
      colW: [2.4, 1.8, 1.4, 0.8, 0.9, 2.4, 3.0],
      border: { type: 'solid', color: 'E0E3E8', size: 1 },
      rowH: 0.3,
      fontFace: FONT,
    });
  }

  // ─── Stream the file ──────────────────────────────────────────────────────
  const fileName = `GDC_Headcount_Budget_${cycleLabel}_${new Date().toISOString().slice(0,10)}.pptx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  res.send(buffer);
});

module.exports = router;
