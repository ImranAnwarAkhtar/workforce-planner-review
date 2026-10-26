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

  const [kpiRes, byDiscRegionRes, byRegionTypeRes, gearingRes, pipelineRes, disciplinesRes, regionsRes, cyclesRes, requestsDetailRes, powerByYearRes] = await Promise.all([
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
    // Power delivered by year: project count + total MW
    safeQuery(`
      SELECT year,
             COUNT(*)::int                                     AS projects,
             ROUND(COALESCE(SUM(power_kw), 0) / 1000.0, 1)   AS power_mw
      FROM projects
      WHERE is_active = TRUE AND year IS NOT NULL
      GROUP BY year
      ORDER BY year
    `),
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
    power_by_year: powerByYearRes.rows.map(r => ({
      year: r.year,
      projects: r.projects,
      power_mw: parseFloat(r.power_mw),
      avg_mw: r.projects > 0 ? parseFloat((parseFloat(r.power_mw) / r.projects).toFixed(1)) : 0,
    })),
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
// Gradient PNG generator — pure Node.js built-ins, cached after first call
// Produces a 160×90 diagonal gradient (dark purple → dark navy) that scales
// to fill any 16:9 slide. Colors: #1A0040 (bottom-left) → #000828 (top-right)
// ---------------------------------------------------------------------------
let _gradB64 = null;
function getGradientB64() {
  if (_gradB64) return _gradB64;
  const zlib = require('zlib');
  const W = 160, H = 90;
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = [0]; // PNG filter: None
    for (let x = 0; x < W; x++) {
      // 300°: t=0 at bottom-left (dark purple), t=1 at top-right (dark navy)
      const t = Math.max(0, Math.min(1, (x / (W - 1) + (H - 1 - y) / (H - 1)) / 2));
      row.push(
        Math.round(0x41 * (1 - t)),                     // R: 65 → 0  (#411980 bottom-left → #001042 top-right)
        Math.round(0x19 * (1 - t) + 0x10 * t),          // G: 25 → 16
        Math.round(0x80 * (1 - t) + 0x42 * t),          // B: 128 → 66
        255
      );
    }
    rows.push(Buffer.from(row));
  }
  const raw = Buffer.concat(rows);
  const idat = zlib.deflateSync(raw, { level: 9 });
  const tbl = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    return t;
  })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (const v of b) c = tbl[(c ^ v) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (tp, d) => { const l = Buffer.alloc(4), cv = Buffer.alloc(4), tb = Buffer.from(tp); l.writeUInt32BE(d.length); cv.writeUInt32BE(crc32(Buffer.concat([tb, d]))); return Buffer.concat([l, tb, d, cv]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, RGBA
  _gradB64 = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
  return _gradB64;
}

// ---------------------------------------------------------------------------
// Equinix logo — loads the white SVG from the bundled frontend build, cached.
// Returns null gracefully if the file is missing (slides render without logo).
// ---------------------------------------------------------------------------
let _logoDataUri = undefined; // undefined = not yet attempted, null = not found
function getLogoDataUri() {
  if (_logoDataUri !== undefined) return _logoDataUri;
  try {
    const p = require('path'), fs = require('fs');
    const fp = p.join(__dirname, '../public/static/media/equinix-fortress-white.bb7c94645cc65619617fd3cb92d1e4f6.svg');
    _logoDataUri = `image/svg+xml;base64,${fs.readFileSync(fp).toString('base64')}`;
  } catch { _logoDataUri = null; }
  return _logoDataUri;
}

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
  pres.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5" — coordinates throughout this handler use this canvas

  // ── Equinix brand palette ─────────────────────────────────────────────────
  const RED      = 'E91C24';  // Equinix Red
  const D_VIOLET = '411980';  // Deep Violet (table sub-headers)
  const M_PURPLE = '3D1077';  // Mid-purple (table total rows)
  const YELLOW   = 'FDB90D';  // Equinix Gold (positive indicators)
  const WHITE    = 'FFFFFF';
  const OFF_W    = 'D0D0E8';  // white at ~80% on dark bg (muted labels)
  const BLACK    = '000000';
  const LGRAY    = 'F2F3F5';  // alternating table row fill
  const BGRAY    = '5A657B';  // table border / muted text
  const FONT     = 'Arial';
  const GRAD     = `image/png;base64,${getGradientB64()}`;
  const LOGO     = getLogoDataUri(); // null if SVG not found; slides render fine without it

  let slideNum = 1;

  // Set gradient background + Equinix logo (call FIRST on every non-title slide)
  function setBg(sl) {
    sl.background = { color: BLACK };
    sl.addImage({ data: GRAD, x: 0, y: 0, w: 13.33, h: 7.5 });
    // Logo: 855×470 px SVG → 1.18"×0.65" at top-right (clear of title text)
    if (LOGO) sl.addImage({ data: LOGO, x: 12.00, y: 0.10, w: 1.18, h: 0.65 });
  }

  // Footer: © line bottom-left + slide number bottom-right
  function addFooter(sl) {
    sl.addText('© 2026 Equinix, Inc.', { x: 0.60, y: 7.25, w: 5, h: 0.20, fontSize: 8, color: WHITE, fontFace: FONT, isTextBox: true, margin: 0 });
    sl.addText(String(slideNum), { x: 12.60, y: 7.25, w: 0.60, h: 0.20, fontSize: 8, color: WHITE, fontFace: FONT, isTextBox: true, align: 'right', margin: 0 });
    slideNum++;
  }

  // TYPE 3 — Section divider
  function addSectionDivider(title, subtitle) {
    const sl = pres.addSlide();
    setBg(sl);
    // Title is vertically centred in slide body — logo (y=0.10–0.75) is well clear
    sl.addText(title, { x: 0.60, y: 2.70, w: 12.13, h: 1.00, fontSize: 44, bold: true, color: WHITE, fontFace: FONT, isTextBox: true });
    if (subtitle) sl.addText(subtitle, { x: 0.60, y: 3.80, w: 12.13, h: 0.55, fontSize: 20, color: OFF_W, fontFace: FONT, isTextBox: true });
    sl.addShape(pres.ShapeType.line, { x: 0.60, y: 2.65, w: 1.20, h: 0, line: { color: RED, width: 3.0 } });
    addFooter(sl);
  }

  // TYPE 2 — Content slide (title + optional subtitle on gradient bg)
  // Title width is capped at 11.15" to leave room for the logo at x=12.00
  function addContentSlide(title, subtitle) {
    const sl = pres.addSlide();
    setBg(sl);
    sl.addText(title, { x: 0.60, y: 0.50, w: 11.15, h: 0.60, fontSize: 20, bold: true, color: WHITE, fontFace: FONT, isTextBox: true, margin: 0 });
    sl.addShape(pres.ShapeType.line, { x: 0.60, y: 1.12, w: 12.13, h: 0, line: { color: RED, width: 1.0 } });
    if (subtitle) sl.addText(subtitle, { x: 0.60, y: 1.18, w: 11.15, h: 0.35, fontSize: 11, color: OFF_W, fontFace: FONT, isTextBox: true, margin: 0 });
    addFooter(sl);
    return sl;
  }

  // ── Table cell helpers ────────────────────────────────────────────────────
  // pptxgenjs mutates options objects — always build fresh with spread
  const hdrCell  = (t, o = {}) => ({ text: t, options: { bold: true, color: WHITE, fill: RED,      fontSize: 10, fontFace: FONT, valign: 'middle', ...o } });
  const subHdr   = (t, o = {}) => ({ text: t, options: { bold: true, color: WHITE, fill: D_VIOLET, fontSize: 10, fontFace: FONT, valign: 'middle', ...o } });
  const totCell  = (t, o = {}) => ({ text: t, options: { bold: true, color: WHITE, fill: M_PURPLE, fontSize: 10, fontFace: FONT, valign: 'middle', ...o } });
  const dataCell = (t, row, o = {}) => ({ text: t, options: { color: BLACK, fill: row % 2 === 0 ? WHITE : LGRAY, fontSize: 9, fontFace: FONT, valign: 'middle', ...o } });

  const TBL = { border: { type: 'solid', color: BGRAY, size: 1 }, rowH: 0.30 };

  // ─── Slide 1: TYPE 1 — Cover (solid black, no gradient) ──────────────────
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: BLACK };
  // Thin red left accent bar — signature Equinix design element on cover
  titleSlide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.10, h: 7.5, fill: { color: RED }, line: { color: RED, width: 0 } });
  titleSlide.addText('GDC Headcount Budget', { x: 0.60, y: 1.60, w: 7.50, h: 2.39, fontSize: 44, bold: true, color: WHITE, fontFace: FONT, isTextBox: true, valign: 'top' });
  titleSlide.addText(`Planning Cycle: ${cycleLabel}`, { x: 0.60, y: 4.15, w: 7.50, h: 1.00, fontSize: 20, color: WHITE, fontFace: FONT, isTextBox: true });
  titleSlide.addText(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { x: 0.60, y: 5.40, w: 6.06, h: 0.40, fontSize: 14, color: OFF_W, fontFace: FONT, isTextBox: true });
  titleSlide.addText('© 2026 Equinix, Inc.', { x: 0.60, y: 7.25, w: 5, h: 0.20, fontSize: 8, color: WHITE, fontFace: FONT, isTextBox: true, margin: 0 });
  // Equinix logo — top right on cover
  if (LOGO) titleSlide.addImage({ data: LOGO, x: 12.00, y: 0.10, w: 1.18, h: 0.65 });
  slideNum++;

  // ─── Slide 2: Executive Summary KPIs ─────────────────────────────────────
  const execSlide = addContentSlide('Executive Summary', `Planning Cycle: ${cycleLabel}`);
  const kpis = [
    { label: 'Total Workforce',     value: d.kpis.total_existing.toString(), sub: 'Current headcount' },
    { label: 'FTE Requests',        value: d.kpis.req_fte.toString(),        sub: 'New FTE positions' },
    { label: 'Contingent Requests', value: d.kpis.req_con.toString(),        sub: 'Contingent workers' },
    { label: 'Contingent %',        value: `${d.kpis.contingent_pct}%`,      sub: 'Of existing headcount' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.40 + i * 3.20;
    execSlide.addText(k.value, { x, y: 1.75, w: 2.90, h: 1.00, fontSize: 48, bold: true, color: WHITE, fontFace: FONT, isTextBox: true, align: 'center', margin: 0 });
    execSlide.addShape(pres.ShapeType.line, { x: x + 0.10, y: 2.80, w: 2.70, h: 0, line: { color: WHITE, width: 0.75 } });
    execSlide.addText(k.label, { x, y: 2.85, w: 2.90, h: 0.35, fontSize: 12, bold: true, color: WHITE, fontFace: FONT, isTextBox: true, align: 'center', margin: 0 });
    execSlide.addText(k.sub,   { x, y: 3.22, w: 2.90, h: 0.30, fontSize: 10, color: OFF_W, fontFace: FONT, isTextBox: true, align: 'center', margin: 0 });
  });

  // ─── Slide 3: Divider – Headcount Summary ────────────────────────────────
  addSectionDivider('Headcount Summary', 'By function and head type');

  // ─── Slide 4: Headcount by Function ──────────────────────────────────────
  const fnSlide = addContentSlide('Headcount Summary — By Function', `Planning Cycle: ${cycleLabel}`);
  const fnDiscs   = d.headcount_by_function.disciplines;
  const fnRegions = d.headcount_by_function.regions;
  const fnMatrix  = d.headcount_by_function.matrix;
  const fnRegW    = fnRegions.length > 0 ? parseFloat(((12.50 - 1.4) / fnRegions.length).toFixed(2)) : 1.85;
  const fnHeaderRow = [hdrCell('Discipline'), ...fnRegions.map(r => hdrCell(r.length > 8 ? r.slice(0, 8) : r, { align: 'center' }))];
  const fnRows = [fnHeaderRow];
  fnDiscs.forEach((disc, di) => {
    const row = [dataCell(disc, di, { bold: true })];
    for (const reg of fnRegions) {
      const cell = fnMatrix[disc]?.[reg] || { existing: 0, requested: 0 };
      const tot = cell.existing + cell.requested;
      row.push(dataCell(tot > 0 ? tot.toString() : '—', di, { align: 'center' }));
    }
    fnRows.push(row);
  });
  const fnTotalRow = [totCell('TOTAL')];
  for (const reg of fnRegions) {
    let t = 0;
    for (const disc of fnDiscs) t += (fnMatrix[disc]?.[reg]?.existing || 0) + (fnMatrix[disc]?.[reg]?.requested || 0);
    fnTotalRow.push(totCell(t > 0 ? t.toString() : '—', { align: 'center' }));
  }
  fnRows.push(fnTotalRow);
  fnSlide.addTable(fnRows, { x: 0.40, y: 1.65, w: 12.50, colW: [1.4, ...fnRegions.map(() => fnRegW)], ...TBL, fontFace: FONT });

  // ─── Slide 5: Headcount by Head Type ─────────────────────────────────────
  const htSlide = addContentSlide('Headcount Summary — By Head Type', `Planning Cycle: ${cycleLabel}`);
  const htHeaderRow = [
    hdrCell('Region'),
    hdrCell('Senior Staff', { align: 'center' }),
    hdrCell('FTE',          { align: 'center' }),
    hdrCell('Contingent',   { align: 'center' }),
    hdrCell('Approved FTE', { align: 'center' }),
    hdrCell('Req FTE',      { align: 'center' }),
    hdrCell('Req Cont',     { align: 'center' }),
    hdrCell('Total',        { align: 'center' }),
  ];
  const htRows = [htHeaderRow];
  let htTotals = { snr: 0, fte: 0, con: 0, appr_fte: 0, req_fte: 0, req_con: 0, total: 0 };
  d.headcount_by_type.forEach((r, ri) => {
    const total = r.snr + r.fte + r.con + r.appr_fte + r.req_fte + r.req_con + (r.req_con_fte || 0);
    htTotals.snr += r.snr; htTotals.fte += r.fte; htTotals.con += r.con;
    htTotals.appr_fte += r.appr_fte; htTotals.req_fte += r.req_fte; htTotals.req_con += r.req_con; htTotals.total += total;
    htRows.push([
      dataCell(r.region, ri),
      dataCell(r.snr      > 0 ? r.snr.toString()      : '—', ri, { align: 'center' }),
      dataCell(r.fte      > 0 ? r.fte.toString()      : '—', ri, { align: 'center' }),
      dataCell(r.con      > 0 ? r.con.toString()      : '—', ri, { align: 'center' }),
      dataCell(r.appr_fte > 0 ? r.appr_fte.toString() : '—', ri, { align: 'center' }),
      dataCell(r.req_fte  > 0 ? r.req_fte.toString()  : '—', ri, { align: 'center', bold: r.req_fte > 0, color: r.req_fte > 0 ? RED : BLACK }),
      dataCell(r.req_con  > 0 ? r.req_con.toString()  : '—', ri, { align: 'center', bold: r.req_con > 0, color: r.req_con > 0 ? D_VIOLET : BLACK }),
      dataCell(total      > 0 ? total.toString()       : '—', ri, { align: 'center', bold: true }),
    ]);
  });
  htRows.push([
    totCell('TOTAL'),
    totCell(htTotals.snr.toString(),      { align: 'center' }),
    totCell(htTotals.fte.toString(),      { align: 'center' }),
    totCell(htTotals.con.toString(),      { align: 'center' }),
    totCell(htTotals.appr_fte.toString(), { align: 'center' }),
    totCell(htTotals.req_fte.toString(),  { align: 'center' }),
    totCell(htTotals.req_con.toString(),  { align: 'center' }),
    totCell(htTotals.total.toString(),    { align: 'center' }),
  ]);
  htSlide.addTable(htRows, { x: 0.40, y: 1.65, w: 12.50, colW: [2.2, 1.3, 1.0, 1.3, 1.6, 1.2, 1.2, 1.7], ...TBL, fontFace: FONT });

  // ─── Slide 6: Divider – Gearing Ratios ───────────────────────────────────
  addSectionDivider('Gearing Ratios', 'Proposed headcount vs project-driven requirements');

  // ─── Gearing slides — one per discipline ─────────────────────────────────
  for (const gd of d.gearing) {
    const gs = addContentSlide(`Gearing Ratio — ${gd.discipline}`, `Planning Cycle: ${cycleLabel}`);
    const grHeaderRow = [
      hdrCell('Region'),
      hdrCell('Min',      { align: 'center' }),
      hdrCell('Max',      { align: 'center' }),
      hdrCell('Proposed', { align: 'center' }),
      hdrCell('Optimal',  { align: 'center' }),
      hdrCell('Variance', { align: 'center' }),
      hdrCell('Var %',    { align: 'center' }),
    ];
    const grRows = [grHeaderRow];
    const visRows = gd.regions.filter(r => !(r.min === 0 && r.max === 0 && r.proposed === 0));
    visRows.forEach((r, ri) => {
      const varColor = r.variance < 0 ? RED : BLACK;
      grRows.push([
        dataCell(r.region, ri),
        dataCell(r.min.toString(),      ri, { align: 'center' }),
        dataCell(r.max.toString(),      ri, { align: 'center' }),
        dataCell(r.proposed.toString(), ri, { align: 'center', bold: true }),
        dataCell(r.optimal.toString(),  ri, { align: 'center' }),
        dataCell((r.variance > 0 ? '+' : '') + r.variance.toString(),     ri, { align: 'center', bold: true, color: varColor }),
        dataCell((r.variance_pct > 0 ? '+' : '') + r.variance_pct + '%',  ri, { align: 'center', bold: true, color: varColor }),
      ]);
    });
    const gt = gd.totals;
    const gtVarColor = gt.variance < 0 ? RED : YELLOW;
    grRows.push([
      totCell('Grand Total'),
      totCell(gt.min.toString(),      { align: 'center' }),
      totCell(gt.max.toString(),      { align: 'center' }),
      totCell(gt.proposed.toString(), { align: 'center' }),
      totCell(gt.optimal.toString(),  { align: 'center' }),
      totCell((gt.variance > 0 ? '+' : '') + gt.variance.toString(),    { align: 'center', color: gtVarColor }),
      totCell((gt.variance_pct > 0 ? '+' : '') + gt.variance_pct + '%', { align: 'center', color: gtVarColor }),
    ]);
    gs.addTable(grRows, { x: 0.40, y: 1.65, w: 12.50, colW: [2.5, 1.3, 1.3, 1.7, 1.7, 2.0, 2.0], ...TBL, fontFace: FONT });
  }

  // ─── Project Pipeline ─────────────────────────────────────────────────────
  addSectionDivider('Project Pipeline', 'By region and status');
  const ppSlide = addContentSlide('Project Pipeline — By Region', `Planning Cycle: ${cycleLabel}`);
  const ppHeaderRow = [
    hdrCell('Region'),
    hdrCell('Approved',   { align: 'center' }),
    hdrCell('Seeded',     { align: 'center' }),
    hdrCell('Proposed',   { align: 'center' }),
    hdrCell('Total',      { align: 'center' }),
    hdrCell('Adj Weight', { align: 'center' }),
  ];
  const ppRows = [ppHeaderRow];
  let ppTot = { Approved: 0, Seeded: 0, Proposed: 0, total: 0, weight: 0 };
  d.pipeline.forEach((r, ri) => {
    ppTot.Approved += r.Approved || 0; ppTot.Seeded += r.Seeded || 0;
    ppTot.Proposed += r.Proposed || 0; ppTot.total   += r.total  || 0;
    const adjWeight = r.retail_weight + r.xscale_weight;
    ppTot.weight += adjWeight;
    ppRows.push([
      dataCell(r.region,                  ri),
      dataCell(r.Approved?.toString() || '0', ri, { align: 'center' }),
      dataCell(r.Seeded?.toString()   || '0', ri, { align: 'center' }),
      dataCell(r.Proposed?.toString() || '0', ri, { align: 'center' }),
      dataCell(r.total?.toString()    || '0', ri, { align: 'center', bold: true }),
      dataCell(adjWeight.toFixed(1),       ri, { align: 'center' }),
    ]);
  });
  ppRows.push([
    totCell('TOTAL'),
    totCell(ppTot.Approved.toString(), { align: 'center' }),
    totCell(ppTot.Seeded.toString(),   { align: 'center' }),
    totCell(ppTot.Proposed.toString(), { align: 'center' }),
    totCell(ppTot.total.toString(),    { align: 'center' }),
    totCell(ppTot.weight.toFixed(1),   { align: 'center' }),
  ]);
  ppSlide.addTable(ppRows, { x: 0.40, y: 1.65, w: 12.50, colW: [3.0, 1.8, 1.8, 1.8, 1.8, 2.3], ...TBL, fontFace: FONT });

  // ─── Appendix: Headcount Requests Detail ─────────────────────────────────
  if (d.requests_detail.length > 0) {
    addSectionDivider('Appendix', 'Headcount requests — detail');
    const reqSlide = addContentSlide('Headcount Requests — Detail', `Planning Cycle: ${cycleLabel}`);
    const reqHeaderRow = [
      hdrCell('Name'),
      hdrCell('Discipline'),
      hdrCell('Region'),
      hdrCell('Level',          { align: 'center' }),
      hdrCell('Type',           { align: 'center' }),
      hdrCell('Hiring Manager'),
      hdrCell('Planning Cycle'),
    ];
    const reqRows = [reqHeaderRow];
    d.requests_detail.forEach((r, ri) => {
      const typeColor = r.contract_code && r.contract_code.startsWith('R FTE') ? RED : D_VIOLET;
      reqRows.push([
        dataCell(r.name            || '—', ri, { fontSize: 8 }),
        dataCell(r.discipline      || '—', ri, { fontSize: 8 }),
        dataCell(r.region          || '—', ri, { fontSize: 8 }),
        dataCell(r.level           || '—', ri, { fontSize: 8, align: 'center' }),
        dataCell(r.contract_code   || '—', ri, { fontSize: 8, align: 'center', bold: true, color: typeColor }),
        dataCell(r.hiring_manager  || '—', ri, { fontSize: 8 }),
        dataCell(r.planning_cycle  || '—', ri, { fontSize: 8 }),
      ]);
    });
    reqSlide.addTable(reqRows, { x: 0.40, y: 1.65, w: 12.50, colW: [2.4, 1.8, 1.4, 0.8, 0.9, 2.4, 2.8], ...TBL, fontFace: FONT });
  }

  // ─── Stream the file ──────────────────────────────────────────────────────
  const fileName = `GDC_Headcount_Budget_${cycleLabel}_${new Date().toISOString().slice(0,10)}.pptx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  res.send(buffer);
});

module.exports = router;
