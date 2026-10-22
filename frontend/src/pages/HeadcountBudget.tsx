import { useState, useEffect, useCallback } from 'react';

const API_BASE = (process.env.REACT_APP_API_URL ?? 'http://localhost:3001') + '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KPIs {
  total_existing: number;
  exist_fte: number;
  exist_con: number;
  appr_fte: number;
  req_fte: number;
  req_con: number;
  req_con_fte: number;
  contingent_pct: number;
  total_with_requests: number;
}

interface MatrixCell { existing: number; approved: number; requested: number; }
interface HeadcountByFunction {
  disciplines: string[];
  regions: string[];
  matrix: Record<string, Record<string, MatrixCell>>;
}

interface HeadcountByType {
  region: string;
  sort_order: number;
  snr: number;
  fte: number;
  con: number;
  appr_fte: number;
  req_fte: number;
  req_con_fte: number;
  req_con: number;
}

interface GearingRegion { region: string; min: number; max: number; proposed: number; optimal: number; variance: number; variance_pct: number; }
interface GearingTable { discipline: string; regions: GearingRegion[]; totals: GearingRegion; }

interface PipelineRow { region: string; sort_order: number; Approved: number; Seeded: number; Proposed: number; total: number; retail_weight: number; xscale_weight: number; }

interface RequestDetail { name: string; discipline: string; region: string; level: string; contract_code: string; dept_head: string; hiring_manager: string; planning_cycle: string; }

interface PlanningCycle { name: string; status: string; }

interface BudgetData {
  kpis: KPIs;
  headcount_by_function: HeadcountByFunction;
  headcount_by_type: HeadcountByType[];
  gearing: GearingTable[];
  pipeline: PipelineRow[];
  planning_cycles: PlanningCycle[];
  regions: string[];
  requests_detail: RequestDetail[];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:   { display: 'flex' as const, flexDirection: 'column' as const, flex: 1, minHeight: 0, fontFamily: 'Noto Sans, Calibri, sans-serif' },
  title:  { color: '#111827', fontSize: 22, fontWeight: 700, margin: 0 },
  bar:    { width: 40, height: 3, background: '#E91C24', borderRadius: 2, margin: '8px 0 16px' },
  tabs:   { display: 'flex', gap: 0, borderBottom: '2px solid #E0E3E8', marginBottom: 24 },
  tab:    (active: boolean) => ({
    padding: '8px 20px',
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#111827' : '#5A657B',
    borderBottom: active ? '2px solid #E91C24' : '2px solid transparent',
    cursor: 'pointer', background: 'none', border: 'none',
    marginBottom: -2, whiteSpace: 'nowrap' as const,
  }),
  section: { marginBottom: 32 },
  sHead:  { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4, marginTop: 0 },
  sDesc:  { fontSize: 12, color: '#5A657B', marginBottom: 14, marginTop: 0 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 },
  kpiCard:{ background: '#F9FAFB', border: '1px solid #E0E3E8', borderRadius: 8, padding: '16px 20px' },
  kpiVal: { fontSize: 36, fontWeight: 800, lineHeight: 1.1, marginBottom: 2 },
  kpiLbl: { fontSize: 12, color: '#374151', fontWeight: 600 },
  kpiSub: { fontSize: 11, color: '#8B93A3', marginTop: 2 },
  table:  { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:     { background: '#1A1A2E', color: '#FFFFFF', padding: '7px 10px', fontWeight: 600, textAlign: 'left' as const, fontSize: 12, whiteSpace: 'nowrap' as const },
  thC:    { background: '#1A1A2E', color: '#FFFFFF', padding: '7px 10px', fontWeight: 600, textAlign: 'center' as const, fontSize: 12, whiteSpace: 'nowrap' as const },
  td:     { padding: '6px 10px', borderBottom: '1px solid #F0F1F3', color: '#374151', verticalAlign: 'top' as const },
  tdC:    { padding: '6px 10px', borderBottom: '1px solid #F0F1F3', color: '#374151', textAlign: 'center' as const },
  tdB:    { padding: '6px 10px', borderBottom: '1px solid #F0F1F3', fontWeight: 600, color: '#111827' },
  tdBr:   { padding: '6px 10px', fontWeight: 700, color: '#FFFFFF', background: '#2D2D2D', textAlign: 'center' as const },
  totalR: { background: '#2D2D2D' },
  altRow: { background: '#FAFAFA' },
  wrap:   { overflowX: 'auto' as const, border: '1px solid #E0E3E8', borderRadius: 6, marginBottom: 20 },
  badge:  (c: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c + '20', color: c }),
  btn:    { padding: '10px 22px', background: '#E91C24', color: '#FFFFFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnSec: { padding: '10px 22px', background: '#F5F6F8', color: '#374151', border: '1px solid #E0E3E8', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n > 0 ? n.toString() : '—'; }
function pct(n: number): string { return n > 0 ? `+${n}%` : n < 0 ? `${n}%` : '0%'; }
function varColor(v: number): string { return v > 0 ? '#FDB90D' : v < 0 ? '#E91C24' : '#33A85C'; }

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({ value, label, sub, color }: { value: string; label: string; sub: string; color: string }) {
  return (
    <div style={S.kpiCard}>
      <div style={{ ...S.kpiVal, color }}>{value}</div>
      <div style={S.kpiLbl}>{label}</div>
      <div style={S.kpiSub}>{sub}</div>
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <>
      <h2 style={S.sHead}>{title}</h2>
      {desc && <p style={S.sDesc}>{desc}</p>}
    </>
  );
}

// ── Budget Data Tab ───────────────────────────────────────────────────────────

function BudgetDataTab({ data }: { data: BudgetData }) {
  const [gearingDisc, setGearingDisc] = useState<string>(data.gearing[0]?.discipline ?? 'Construction');
  const activeGearing = data.gearing.find(g => g.discipline === gearingDisc);
  const activeCycle = data.planning_cycles.find(c => c.status === 'active') || data.planning_cycles[0];

  const { kpis, headcount_by_function: hbf, headcount_by_type: hbt, pipeline } = data;

  // Totals for headcount by type
  const hbtTotal = hbt.reduce((a, r) => ({
    snr: a.snr + r.snr, fte: a.fte + r.fte, con: a.con + r.con,
    appr_fte: a.appr_fte + r.appr_fte, req_fte: a.req_fte + r.req_fte,
    req_con: a.req_con + r.req_con, req_con_fte: a.req_con_fte + r.req_con_fte,
  }), { snr: 0, fte: 0, con: 0, appr_fte: 0, req_fte: 0, req_con: 0, req_con_fte: 0 });

  // Pipeline totals
  const pipeTot = pipeline.reduce((a, r) => ({
    Approved: a.Approved + (r.Approved || 0),
    Seeded: a.Seeded + (r.Seeded || 0),
    Proposed: a.Proposed + (r.Proposed || 0),
    total: a.total + (r.total || 0),
    weight: a.weight + r.retail_weight + r.xscale_weight,
  }), { Approved: 0, Seeded: 0, Proposed: 0, total: 0, weight: 0 });

  return (
    <div>
      {/* Planning cycle banner */}
      {activeCycle && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '8px 14px', marginBottom: 20, fontSize: 12, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700 }}>Planning Cycle:</span>
          <span>{activeCycle.name}</span>
          <span style={S.badge('#086AE3')}>{activeCycle.status}</span>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={S.section}>
        <SectionHeader title="Executive Summary" desc="High-level headcount overview for this planning cycle." />
        <div style={S.kpiRow}>
          <KpiTile value={kpis.total_existing.toString()} label="Total Workforce" sub="Current active headcount" color="#1A1A2E" />
          <KpiTile value={kpis.req_fte.toString()} label="FTE Requests" sub="New FTE positions requested" color="#E91C24" />
          <KpiTile value={kpis.req_con.toString()} label="Contingent Requests" sub="New contingent workers" color="#411980" />
          <KpiTile value={`${kpis.contingent_pct}%`} label="Contingent Workforce" sub="Of existing headcount" color="#00737A" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KpiTile value={kpis.exist_fte.toString()} label="Existing FTE" sub="FTE + Senior Staff" color="#374151" />
          <KpiTile value={kpis.exist_con.toString()} label="Existing Contingent" sub="Active contractors" color="#374151" />
          <KpiTile value={kpis.appr_fte.toString()} label="Approved TBH" sub="Positions in pipeline" color="#086AE3" />
          <KpiTile value={kpis.req_con_fte.toString()} label="Con→FTE Conversions" sub="Requested conversions" color="#33A85C" />
        </div>
      </div>

      {/* ── Headcount by Function ── */}
      <div style={S.section}>
        <SectionHeader title="Headcount Summary — By Function" desc="Headcount breakdown across disciplines and regions. Totals include existing, approved, and requested positions." />
        <div style={S.wrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Discipline</th>
                {hbf.regions.map(r => <th key={r} style={S.thC}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {hbf.disciplines.map((disc, i) => {
                const rowBg = i % 2 === 1 ? '#FAFAFA' : '#FFFFFF';
                return (
                  <tr key={disc} style={{ background: rowBg }}>
                    <td style={{ ...S.tdB, background: rowBg }}>{disc}</td>
                    {hbf.regions.map(reg => {
                      const cell = hbf.matrix[disc]?.[reg] || { existing: 0, approved: 0, requested: 0 };
                      const total = cell.existing + cell.approved + cell.requested;
                      const hasReq = cell.requested > 0;
                      return (
                        <td key={reg} style={{ ...S.tdC, background: rowBg }}>
                          {total > 0 ? (
                            <span>
                              <span style={{ color: '#374151' }}>{cell.existing + cell.approved}</span>
                              {hasReq && <span style={{ color: '#E91C24', fontWeight: 600 }}> +{cell.requested}</span>}
                            </span>
                          ) : <span style={{ color: '#CCCCCC' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Total row */}
              <tr style={S.totalR}>
                <td style={{ ...S.tdB, color: '#FFFFFF', background: '#2D2D2D' }}>TOTAL</td>
                {hbf.regions.map(reg => {
                  let ex = 0, req = 0;
                  for (const d of hbf.disciplines) {
                    const c = hbf.matrix[d]?.[reg] || { existing: 0, approved: 0, requested: 0 };
                    ex += c.existing + c.approved; req += c.requested;
                  }
                  return (
                    <td key={reg} style={S.tdBr}>
                      {ex + req > 0 ? (
                        <span>{ex}{req > 0 ? ` +${req}` : ''}</span>
                      ) : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#8B93A3', margin: 0 }}>Numbers shown as <strong>existing+approved</strong> <span style={{ color: '#E91C24' }}>+requested</span></p>
      </div>

      {/* ── Headcount by Head Type ── */}
      <div style={S.section}>
        <SectionHeader title="Headcount Summary — By Head Type" desc="Regional breakdown by employment category." />
        <div style={S.wrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Region</th>
                <th style={S.thC}>Senior Staff</th>
                <th style={S.thC}>FTE</th>
                <th style={S.thC}>Contingent</th>
                <th style={S.thC}>Appr TBH</th>
                <th style={S.thC}>Req FTE</th>
                <th style={S.thC}>Req Cont</th>
                <th style={S.thC} title="Contingent-to-FTE conversions">Con→FTE</th>
                <th style={{ ...S.thC, background: '#374151' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {hbt.map((r, i) => {
                const total = r.snr + r.fte + r.con + r.appr_fte + r.req_fte + r.req_con + r.req_con_fte;
                const rowBg = i % 2 === 1 ? '#FAFAFA' : '#FFFFFF';
                return (
                  <tr key={r.region} style={{ background: rowBg }}>
                    <td style={{ ...S.tdB, background: rowBg }}>{r.region}</td>
                    <td style={{ ...S.tdC, background: rowBg }}>{fmt(r.snr)}</td>
                    <td style={{ ...S.tdC, background: rowBg }}>{fmt(r.fte)}</td>
                    <td style={{ ...S.tdC, background: rowBg }}>{fmt(r.con)}</td>
                    <td style={{ ...S.tdC, background: rowBg, color: r.appr_fte > 0 ? '#086AE3' : '#CCCCCC' }}>{fmt(r.appr_fte)}</td>
                    <td style={{ ...S.tdC, background: rowBg, color: r.req_fte > 0 ? '#E91C24' : '#CCCCCC', fontWeight: r.req_fte > 0 ? 600 : 400 }}>{fmt(r.req_fte)}</td>
                    <td style={{ ...S.tdC, background: rowBg, color: r.req_con > 0 ? '#411980' : '#CCCCCC', fontWeight: r.req_con > 0 ? 600 : 400 }}>{fmt(r.req_con)}</td>
                    <td style={{ ...S.tdC, background: rowBg, color: r.req_con_fte > 0 ? '#33A85C' : '#CCCCCC', fontWeight: r.req_con_fte > 0 ? 600 : 400 }}>{fmt(r.req_con_fte)}</td>
                    <td style={{ ...S.tdBr, background: '#374151' }}>{total}</td>
                  </tr>
                );
              })}
              <tr style={S.totalR}>
                <td style={{ ...S.tdB, color: '#FFFFFF', background: '#2D2D2D' }}>TOTAL</td>
                <td style={S.tdBr}>{hbtTotal.snr}</td>
                <td style={S.tdBr}>{hbtTotal.fte}</td>
                <td style={S.tdBr}>{hbtTotal.con}</td>
                <td style={S.tdBr}>{hbtTotal.appr_fte}</td>
                <td style={S.tdBr}>{hbtTotal.req_fte}</td>
                <td style={S.tdBr}>{hbtTotal.req_con}</td>
                <td style={S.tdBr}>{hbtTotal.req_con_fte}</td>
                <td style={{ ...S.tdBr, background: '#1A1A2E' }}>
                  {hbtTotal.snr + hbtTotal.fte + hbtTotal.con + hbtTotal.appr_fte + hbtTotal.req_fte + hbtTotal.req_con + hbtTotal.req_con_fte}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Gearing Ratios ── */}
      <div style={S.section}>
        <SectionHeader title="Gearing Ratios" desc="Proposed headcount vs project-driven optimal requirements by region." />
        {/* Discipline selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {data.gearing.map(g => (
            <button
              key={g.discipline}
              onClick={() => setGearingDisc(g.discipline)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${gearingDisc === g.discipline ? '#1A1A2E' : '#E0E3E8'}`,
                background: gearingDisc === g.discipline ? '#1A1A2E' : '#F5F6F8',
                color: gearingDisc === g.discipline ? '#FFFFFF' : '#374151',
              }}
            >
              {g.discipline}
            </button>
          ))}
        </div>
        {activeGearing && (
          <div style={S.wrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Region</th>
                  <th style={S.thC}>Min</th>
                  <th style={S.thC}>Max</th>
                  <th style={{ ...S.thC, background: '#374151' }}>Proposed</th>
                  <th style={S.thC}>Optimal</th>
                  <th style={S.thC}>Variance</th>
                  <th style={S.thC}>Var %</th>
                </tr>
              </thead>
              <tbody>
                {activeGearing.regions.filter(r => r.min > 0 || r.max > 0 || r.proposed > 0).map((r, i) => (
                  <tr key={r.region} style={{ background: i % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                    <td style={{ ...S.tdB, background: 'inherit' }}>{r.region}</td>
                    <td style={{ ...S.tdC, color: '#8B93A3', background: 'inherit' }}>{r.min}</td>
                    <td style={{ ...S.tdC, color: '#8B93A3', background: 'inherit' }}>{r.max}</td>
                    <td style={{ ...S.tdC, fontWeight: 700, color: '#111827', background: 'inherit' }}>{r.proposed}</td>
                    <td style={{ ...S.tdC, background: 'inherit' }}>{r.optimal}</td>
                    <td style={{ ...S.tdC, fontWeight: 700, color: varColor(r.variance), background: 'inherit' }}>
                      {r.variance > 0 ? `+${r.variance}` : r.variance}
                    </td>
                    <td style={{ ...S.tdC, fontWeight: 700, color: varColor(r.variance_pct), background: 'inherit' }}>
                      {pct(r.variance_pct)}
                    </td>
                  </tr>
                ))}
                <tr style={S.totalR}>
                  <td style={{ ...S.tdB, color: '#FFFFFF', background: '#2D2D2D' }}>Grand Total</td>
                  <td style={S.tdBr}>{activeGearing.totals.min}</td>
                  <td style={S.tdBr}>{activeGearing.totals.max}</td>
                  <td style={{ ...S.tdBr, background: '#374151' }}>{activeGearing.totals.proposed}</td>
                  <td style={S.tdBr}>{activeGearing.totals.optimal}</td>
                  <td style={{ ...S.tdBr, color: varColor(activeGearing.totals.variance) }}>
                    {activeGearing.totals.variance > 0 ? `+${activeGearing.totals.variance}` : activeGearing.totals.variance}
                  </td>
                  <td style={{ ...S.tdBr, color: varColor(activeGearing.totals.variance_pct) }}>
                    {pct(activeGearing.totals.variance_pct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Project Pipeline ── */}
      <div style={S.section}>
        <SectionHeader title="Project Pipeline" desc="Live project pipeline by region and delivery status." />
        <div style={S.wrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Region</th>
                <th style={S.thC}>Approved</th>
                <th style={S.thC}>Seeded</th>
                <th style={S.thC}>Proposed</th>
                <th style={{ ...S.thC, background: '#374151' }}>Total Projects</th>
                <th style={S.thC}>Adj Weight</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((r, i) => {
                const adjW = (r.retail_weight + r.xscale_weight).toFixed(1);
                return (
                  <tr key={r.region} style={{ background: i % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                    <td style={{ ...S.tdB, background: 'inherit' }}>{r.region}</td>
                    <td style={{ ...S.tdC, background: 'inherit' }}>{r.Approved || 0}</td>
                    <td style={{ ...S.tdC, background: 'inherit' }}>{r.Seeded || 0}</td>
                    <td style={{ ...S.tdC, background: 'inherit' }}>{r.Proposed || 0}</td>
                    <td style={{ ...S.tdC, fontWeight: 700, color: '#111827', background: 'inherit' }}>{r.total || 0}</td>
                    <td style={{ ...S.tdC, color: '#8B93A3', background: 'inherit' }}>{adjW}</td>
                  </tr>
                );
              })}
              <tr style={S.totalR}>
                <td style={{ ...S.tdB, color: '#FFFFFF', background: '#2D2D2D' }}>TOTAL</td>
                <td style={S.tdBr}>{pipeTot.Approved}</td>
                <td style={S.tdBr}>{pipeTot.Seeded}</td>
                <td style={S.tdBr}>{pipeTot.Proposed}</td>
                <td style={{ ...S.tdBr, background: '#374151' }}>{pipeTot.total}</td>
                <td style={S.tdBr}>{pipeTot.weight.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Headcount Requests Detail ── */}
      {data.requests_detail.length > 0 && (
        <div style={S.section}>
          <SectionHeader title="Headcount Requests — Detail" desc={`${data.requests_detail.length} requested positions for this planning cycle.`} />
          <div style={S.wrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Name / Placeholder</th>
                  <th style={S.th}>Discipline</th>
                  <th style={S.th}>Region</th>
                  <th style={S.th}>Level</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Hiring Manager</th>
                  <th style={S.th}>Cycle</th>
                </tr>
              </thead>
              <tbody>
                {data.requests_detail.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.name || '—'}</td>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.discipline || '—'}</td>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.region || '—'}</td>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.level || '—'}</td>
                    <td style={{ ...S.td, background: 'inherit' }}>
                      <span style={S.badge(r.contract_code === 'R FTE' ? '#086AE3' : r.contract_code === 'R CON>FTE' ? '#33A85C' : '#411980')}>
                        {r.contract_code}
                      </span>
                    </td>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.hiring_manager || '—'}</td>
                    <td style={{ ...S.td, background: 'inherit' }}>{r.planning_cycle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Budget Report Tab ─────────────────────────────────────────────────────────

function BudgetReportTab({ data }: { data: BudgetData }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const activeCycle = data.planning_cycles.find(c => c.status === 'active') || data.planning_cycles[0];

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/headcount-budget/report`);
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${resp.status}`);
      }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = resp.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.href     = url;
      a.download = match ? match[1] : `GDC_Headcount_Budget.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <SectionHeader
        title="Headcount Budget Report"
        desc="Generate a PowerPoint presentation summarising the current planning cycle's headcount data, gearing ratios, and project pipeline."
      />

      {/* Summary card */}
      <div style={{ background: '#F9FAFB', border: '1px solid #E0E3E8', borderRadius: 8, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14 }}>Report will include:</div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
          <li>Title slide with planning cycle reference</li>
          <li>Executive summary — headcount KPI tiles</li>
          <li>Headcount summary by function (discipline × region matrix)</li>
          <li>Headcount summary by head type (FTE, contingent, approvals, requests)</li>
          <li>Gearing ratio tables for Construction, Design, Commercial and Commissioning</li>
          <li>Project pipeline overview by region</li>
        </ul>

        {activeCycle && (
          <div style={{ marginTop: 16, padding: '8px 12px', background: '#EFF6FF', borderRadius: 6, fontSize: 12, color: '#1E40AF' }}>
            <strong>Planning cycle:</strong> {activeCycle.name} &nbsp;·&nbsp; <strong>Status:</strong> {activeCycle.status} &nbsp;·&nbsp; <strong>Workforce:</strong> {data.kpis.total_existing} existing, {data.kpis.req_fte} FTE requests
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{ ...S.btn, opacity: generating ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {generating ? (
            <>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              Generating…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
              Download PowerPoint Report
            </>
          )}
        </button>
        <span style={{ fontSize: 11, color: '#8B93A3' }}>
          .pptx format · {data.gearing.length + 5} slides
        </span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* About the report */}
      <div style={{ marginTop: 32, padding: '16px 20px', border: '1px solid #E0E3E8', borderRadius: 8, background: '#FAFAFA' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Report structure</div>
        <div style={{ fontSize: 12, color: '#5A657B', lineHeight: 1.7 }}>
          <strong>Slide 1</strong> — Title (GDC Headcount Budget, Planning Cycle {activeCycle?.name})<br />
          <strong>Slide 2</strong> — Executive Summary KPIs<br />
          <strong>Slide 3</strong> — Section divider<br />
          <strong>Slide 4</strong> — Headcount by Function<br />
          <strong>Slide 5</strong> — Headcount by Head Type<br />
          <strong>Slide 6</strong> — Section divider<br />
          <strong>Slides 7–10</strong> — Gearing Ratios (Construction, Design, Commercial, Commissioning)<br />
          <strong>Slide 11</strong> — Section divider<br />
          <strong>Slide 12</strong> — Project Pipeline by Region
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'data' | 'report';

export default function HeadcountBudget() {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/headcount-budget/data`);
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const j = await resp.json();
      setData(j.data);
    } catch (e: any) {
      setError(e.message || 'Failed to load budget data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      <h1 style={S.title}>Headcount Budget</h1>
      <div style={S.bar} />

      <div style={S.tabs}>
        <button style={S.tab(activeTab === 'data')}   onClick={() => setActiveTab('data')}>Budget Data</button>
        <button style={S.tab(activeTab === 'report')} onClick={() => setActiveTab('report')}>Budget Report</button>
      </div>

      {loading && (
        <div style={{ padding: 40, color: '#8B93A3', fontSize: 13 }}>Loading budget data…</div>
      )}

      {!loading && error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 16px', color: '#B91C1C', fontSize: 13 }}>
          {error}
          <button onClick={load} style={{ marginLeft: 12, fontSize: 12, color: '#E91C24', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {activeTab === 'data'   && <BudgetDataTab   data={data} />}
          {activeTab === 'report' && <BudgetReportTab data={data} />}
        </div>
      )}
    </div>
  );
}
