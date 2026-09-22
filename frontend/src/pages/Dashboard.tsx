import { useEffect, useState, useCallback } from 'react';
import equinixFortressRed from '../assets/equinix-fortress-red.svg';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  LineChart, Line,
  ComposedChart, Area,
} from 'recharts';
import {
  dashboardApi, refDataApi,
  type HubIqResponse, type HubIqYearData, type Level,
} from '../services/api';

// ---------------------------------------------------------------------------
// Colour palette (matches Excel)
// ---------------------------------------------------------------------------
const C = {
  accent:   '#E91C24',
  retail:   '#00408C',
  xscale:   '#411980',
  vpDir:    '#2F3541',
  fte:      '#8B93A3',
  con:      '#FDB90D',
  apprFte:  '#33A85C',
  apprCon:  '#00737A',
  reqFte:   '#E91C24',
  reqCon:   '#086AE3',
  approved: '#E91C24',
  seeded:   '#7739D9',
  proposed: '#086AE3',
  border:   '#E0E3E8',
  muted:    '#5A657B',
  bg:       '#FFFFFF',
  discColors: { Construction: '#086AE3', Design: '#33A85C', Commercial: '#FDB90D', Commissioning: '#00737A', Other: '#8B93A3' } as Record<string,string>,
};

const TABS = ['Projects', 'People', 'Requests', 'Gearing', 'Hire Status'] as const;
type Tab = typeof TABS[number];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined | null) { return n ?? 0; }

function DeltaBadge({ a, b, size = 11 }: { a: number; b: number; size?: number }) {
  const d = b - a;
  if (d === 0) return <span style={{ fontSize: size, color: '#BDC1CA' }}>● 0</span>;
  const up = d > 0;
  return <span style={{ fontSize: size, fontWeight: 700, color: up ? '#33A85C' : '#E91C24' }}>{up ? '▲' : '▼'} {Math.abs(d)}</span>;
}

function PctBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span style={{ fontSize: 11, color: '#BDC1CA' }}>● 0%</span>;
  const color = pct > 0 ? '#33A85C' : '#E91C24';
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.09em',
};
const TH: React.CSSProperties = { padding: '6px 10px', fontSize: 10, fontWeight: 700, color: C.muted, background: '#F2F3F4', borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' };
const THR: React.CSSProperties = { ...TH, textAlign: 'right' };
const TD: React.CSSProperties  = { padding: '6px 10px', fontSize: 12, color: '#2F3541', borderBottom: `1px solid ${C.border}` };
const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontWeight: 600 };
const TDM: React.CSSProperties = { ...TD, textAlign: 'right', color: C.muted };

// ---------------------------------------------------------------------------
// Top dark KPI banner
// ---------------------------------------------------------------------------

function TopBanner({ yearA, yearB, dataA, dataB }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData }) {
  const sA = dataA.summary, sB = dataB.summary;

  const groups: { label: string; items: { name: string; dotColor?: string; vA: number; vB: number; isFloat?: boolean }[] }[] = [
    {
      label: 'PROJECTS',
      items: [
        { name: 'TOTAL',   vA: sA.projects.total,  vB: sB.projects.total },
        { name: 'RETAIL',  dotColor: C.retail,  vA: sA.projects.retail,  vB: sB.projects.retail },
        { name: 'XSCALE',  dotColor: C.xscale,  vA: sA.projects.xscale,  vB: sB.projects.xscale },
      ],
    },
    {
      label: 'EXIST HC',
      items: [
        { name: 'TOTAL',       vA: sA.exist_hc.total,       vB: sB.exist_hc.total },
        { name: 'PERM',        dotColor: C.fte,   vA: sA.exist_hc.perm,        vB: sB.exist_hc.perm },
        { name: 'CONTINGENT',  dotColor: C.con,   vA: sA.exist_hc.contingent,  vB: sB.exist_hc.contingent },
      ],
    },
    {
      label: 'APPROVED HC',
      items: [
        { name: 'TOTAL',      vA: sA.appr_hc.total, vB: sB.appr_hc.total },
        { name: 'PERM',       dotColor: C.apprFte, vA: sA.appr_hc.fte, vB: sB.appr_hc.fte },
        { name: 'CONVERSION', dotColor: C.apprCon, vA: sA.appr_hc.con, vB: sB.appr_hc.con },
      ],
    },
    {
      label: 'REQUESTS',
      items: [
        { name: 'TOTAL',      vA: sA.req_hc.total, vB: sB.req_hc.total },
        { name: 'PERM',       dotColor: C.reqFte,  vA: sA.req_hc.fte,   vB: sB.req_hc.fte },
        { name: 'CONVERSION', dotColor: C.reqCon,  vA: sA.req_hc.con,   vB: sB.req_hc.con, isFloat: true },
      ],
    },
  ];

  return (
    <div style={{
      background: '#FFFFFF',
      borderBottom: `3px solid ${C.accent}`,
      padding: '16px 28px',
      display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingRight: 20, borderRight: '1px solid #E0E3E8', marginRight: 16, flexShrink: 0 }}>
        <img src={equinixFortressRed} alt="Equinix" style={{ height: 20, width: 'auto', display: 'block' }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', letterSpacing: '0.15em', marginTop: 4 }}>HUB IQ</div>
        <div style={{ fontSize: 9, color: '#5A657B', marginTop: 2 }}>{yearA} vs {yearB}</div>
      </div>

      {/* KPI groups */}
      {groups.map((grp, gi) => (
        <div key={grp.label} style={{
          display: 'flex', alignItems: 'stretch', gap: 0,
          paddingRight: 24, marginRight: 24,
          borderRight: gi < groups.length - 1 ? '1px solid #E0E3E8' : 'none',
        }}>
          {/* Group label — vertical, rotated 180° anti-clockwise */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.12em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {grp.label}
            </span>
          </div>

          {/* Items */}
          {grp.items.map(item => (
            <div key={item.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 20, minWidth: 64 }}>
              {/* Sub-metric label row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                {item.dotColor && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.dotColor, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.name}</span>
              </div>
              {/* Year A value */}
              <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                {item.isFloat ? fmt(item.vA).toFixed(1) : fmt(item.vA)}
              </div>
              {/* Year B + delta row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#086AE3' }}>
                  {item.isFloat ? fmt(item.vB).toFixed(1) : fmt(item.vB)}
                </span>
                <DeltaBadge a={item.vA} b={item.vB} size={11} />
              </div>
              {/* Year labels */}
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: '#8B93A3' }}>{yearA}</span>
                <span style={{ fontSize: 9, color: '#086AE3' }}>{yearB}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', background: '#FFFFFF', borderBottom: `1px solid ${C.border}`, padding: '0 20px', flexShrink: 0 }}>
      {TABS.map(tab => (
        <button key={tab} onClick={() => onChange(tab)} style={{
          padding: '10px 18px', background: 'transparent', border: 'none',
          borderBottom: active === tab ? `2px solid ${C.accent}` : '2px solid transparent',
          color: active === tab ? '#111' : C.muted,
          fontSize: 13, fontWeight: active === tab ? 700 : 400,
          cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
        }}>{tab}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...sectionLabel, marginBottom: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// PROJECTS TAB — helpers
// ---------------------------------------------------------------------------

// Lipstick bar for the pipeline chart.
// Wide semi-opaque rects = project counts (background).
// Narrow solid rects     = FTE weight (foreground).
// Both stacked: Retail (blue) on the bottom, xScale (violet) on top.
function PipelineLipstickBar(props: any) {
  const { x, y, width, height, RetailCount, xScaleCount, RetailWeight, xScaleWeight, _barH } = props;
  const cx      = x + width / 2;
  const wideW   = Math.max(width * 0.82, 6);
  const narrowW = Math.max(width * 0.46, 3);
  const baseline = y + height;

  if (!_barH || height <= 0) {
    return <rect x={cx - narrowW / 2} y={baseline - 2} width={narrowW} height={2} fill="#E0E3E8" rx={1} />;
  }

  const ppu  = height / _barH;

  // Count background rectangles
  const rcH = ppu * RetailCount;
  const xcH = ppu * xScaleCount;
  const rcY = baseline - rcH;
  const xcY = rcY - xcH;

  // Weight foreground rectangles
  const rwH = ppu * RetailWeight;
  const xwH = ppu * xScaleWeight;
  const rwY = baseline - rwH;
  const xwY = rwY - xwH;

  // Totals for single combined labels
  const totalWeight    = RetailWeight + xScaleWeight;
  const totalCount     = RetailCount  + xScaleCount;
  const totalWeightBarH = rwH + xwH;
  const totalCountBarH  = rcH + xcH;
  const weightBarTopY  = xwH > 0.5 ? xwY : rwY;           // top of combined weight bar
  const countBarTopY   = xcH > 0.5 ? xcY : rcY;           // top of combined count bar
  const lblX           = cx - wideW / 2 + 6;

  return (
    <g>
      {/* Count backgrounds */}
      {rcH > 0.5 && <rect x={cx - wideW / 2}   y={rcY} width={wideW}   height={rcH} fill={C.retail} fillOpacity={0.20} rx={1} />}
      {xcH > 0.5 && <rect x={cx - wideW / 2}   y={xcY} width={wideW}   height={xcH} fill={C.xscale} fillOpacity={0.20} rx={1} />}
      {/* Weight foregrounds */}
      {rwH > 0.5 && <rect x={cx - narrowW / 2} y={rwY} width={narrowW} height={rwH} fill={C.retail} fillOpacity={1}    rx={1} />}
      {xwH > 0.5 && <rect x={cx - narrowW / 2} y={xwY} width={narrowW} height={xwH} fill={C.xscale} fillOpacity={1}    rx={1} />}

      {/* Total weight — above the combined narrow bar */}
      {totalWeight > 0 && (
        <text x={cx} y={weightBarTopY - 5} textAnchor="middle" dominantBaseline="auto"
          fontSize={16} fontWeight={700} fill="#2F3541">
          {totalWeight}
        </text>
      )}

      {/* Total count — rotated -90°, top-left of combined wide bar */}
      {totalCountBarH > 16 && totalCount > 0 && (
        <text transform={`translate(${lblX}, ${countBarTopY + 4}) rotate(-90)`}
          textAnchor="end" dominantBaseline="middle"
          fontSize={14} fontWeight={600} fill={C.muted} fillOpacity={0.85}>
          {totalCount}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// PROJECTS TAB
// ---------------------------------------------------------------------------

function ProjectsTab({ yearA, yearB, dataA, dataB, projectTrend, regionNames, regionCodeMap }: {
  yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData;
  projectTrend: { year: number; status: string; count: number }[];
  regionNames: string[];
  regionCodeMap: Record<string, string>;
}) {
  const rc = (name: string) => regionCodeMap[name] || name;
  const [activeYear, setActiveYear] = useState(yearA);
  const [tableMetric, setTableMetric] = useState<'count' | 'weight'>('count');
  const [pipView, setPipView] = useState<'region' | 'country'>('region');
  const data = activeYear === yearA ? dataA : dataB;

  // Build trend data — fixed 2026/2027/2028 placeholders always present
  const TREND_YEARS = [2026, 2027, 2028];
  const trendChartData = TREND_YEARS.map(y => {
    const rows = projectTrend.filter(r => r.year === y);
    const Approved = rows.find(r => r.status === 'Approved')?.count ?? 0;
    const Seeded   = rows.find(r => r.status === 'Seeded')?.count   ?? 0;
    const Proposed = rows.find(r => r.status === 'Proposed')?.count ?? 0;
    const total = Approved + Seeded + Proposed;
    return {
      year: String(y), Approved, Seeded, Proposed, _total: total,
      _propMid: total > 0 && Proposed > 0 ? Proposed / 2                     : null as number | null,
      _seedMid: total > 0 && Seeded   > 0 ? Proposed + Seeded / 2            : null as number | null,
      _apprMid: total > 0 && Approved > 0 ? Proposed + Seeded + Approved / 2 : null as number | null,
    };
  });

  // Donut chart data
  const donutData = [
    { name: 'Retail',  value: data.summary.projects.retail_weight  || data.summary.projects.retail  },
    { name: 'xScale',  value: data.summary.projects.xscale_weight  || data.summary.projects.xscale  },
  ].filter(d => d.value > 0);

  const otherYearData = activeYear === yearA ? dataB : dataA;
  const donutOther = [
    { name: 'Retail',  value: otherYearData.summary.projects.retail_weight  || otherYearData.summary.projects.retail  },
    { name: 'xScale',  value: otherYearData.summary.projects.xscale_weight  || otherYearData.summary.projects.xscale  },
  ];

  // Pipeline lipstick bar data — all non-Global regions as placeholders
  const allPipelineRegions = regionNames.length > 0
    ? regionNames
    : data.pipeline.map(r => r.region_name);
  const pipelineBarData = allPipelineRegions.map(regionName => {
    const r = data.pipeline.find(p => p.region_name === regionName);
    const RetailCount  = r ? r.retail.Approved  + r.retail.Seeded  + r.retail.Proposed  : 0;
    const xScaleCount  = r ? r.xscale.Approved  + r.xscale.Seeded  + r.xscale.Proposed  : 0;
    const RetailWeight = r ? Number(r.retail.weight.toFixed(2))  : 0;
    const xScaleWeight = r ? Number(r.xscale.weight.toFixed(2))  : 0;
    return {
      region: rc(regionName),
      RetailCount, xScaleCount, RetailWeight, xScaleWeight,
      _barH: Math.max(RetailCount + xScaleCount, RetailWeight + xScaleWeight),
    };
  });

  const pipelineCountryBarData = (data.pipeline_country ?? []).map(row => {
    const RetailCount  = row.retail.Approved + row.retail.Seeded + row.retail.Proposed;
    const xScaleCount  = row.xscale.Approved + row.xscale.Seeded + row.xscale.Proposed;
    const RetailWeight = Number(row.retail.weight.toFixed(2));
    const xScaleWeight = Number(row.xscale.weight.toFixed(2));
    return {
      region: rc(row.region_name),
      RetailCount, xScaleCount, RetailWeight, xScaleWeight,
      _barH: Math.max(RetailCount + xScaleCount, RetailWeight + xScaleWeight),
    };
  });

  const activeBarData = pipView === 'region' ? pipelineBarData : pipelineCountryBarData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top row: trend + donut + meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>

        {/* YoY trend */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>Project Count YoY by Status</SectionTitle>
          <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={trendChartData} margin={{ top: 58, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: C.muted }} tickMargin={8} />
              <YAxis width={0} tick={false} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label: lbl }) => {
                if (!active || !payload?.length) return null;
                const vis = (payload as any[]).filter(p => ['Approved','Seeded','Proposed'].includes(p.name));
                if (!vis.length) return null;
                return (
                  <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{lbl}</div>
                    {vis.map((p: any) => (
                      <div key={p.name} style={{ color: p.fill }}>{p.name}: <b>{p.value}</b></div>
                    ))}
                  </div>
                );
              }} />
              <Area type="linear" dataKey="Proposed" stackId="1" stroke={C.proposed} fill={C.proposed} fillOpacity={1} strokeWidth={2} legendType="none" />
              <Area type="linear" dataKey="Seeded"   stackId="1" stroke={C.seeded}   fill={C.seeded}   fillOpacity={1} strokeWidth={2} legendType="none" />
              <Area type="linear" dataKey="Approved" stackId="1" stroke={C.approved} fill={C.approved} fillOpacity={1} strokeWidth={2} legendType="none" />
              {/* Hidden label-only lines at section midpoints */}
              <Line type="linear" dataKey="_propMid" stroke="none" dot={false} legendType="none" isAnimationActive={false}
                label={(props: any) => {
                  const { x, y, index } = props;
                  const d = trendChartData[index];
                  if (!d?.Proposed) return <g key={`pm-${index}`} />;
                  const n = trendChartData.length;
                  const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle';
                  return <text key={`pm-${index}`} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={14} fontWeight={700} fill="#FFF">{d.Proposed}</text>;
                }} />
              <Line type="linear" dataKey="_seedMid" stroke="none" dot={false} legendType="none" isAnimationActive={false}
                label={(props: any) => {
                  const { x, y, index } = props;
                  const d = trendChartData[index];
                  if (!d?.Seeded) return <g key={`sm-${index}`} />;
                  const n = trendChartData.length;
                  const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle';
                  return <text key={`sm-${index}`} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={14} fontWeight={700} fill="#FFF">{d.Seeded}</text>;
                }} />
              <Line type="linear" dataKey="_apprMid" stroke="none" dot={false} legendType="none" isAnimationActive={false}
                label={(props: any) => {
                  const { x, y, index } = props;
                  const d = trendChartData[index];
                  if (!d?.Approved) return <g key={`am-${index}`} />;
                  const n = trendChartData.length;
                  const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle';
                  return <text key={`am-${index}`} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={14} fontWeight={700} fill="#FFF">{d.Approved}</text>;
                }} />
              {/* Hidden line at _total — total count + YoY variance above stack */}
              <Line type="linear" dataKey="_total" stroke="none" dot={false} legendType="none" isAnimationActive={false}
                label={(props: any) => {
                  const { x, y, value, index } = props;
                  if (value == null) return <g key={`tl-${index}`} />;
                  const prev = trendChartData[index - 1];
                  const variance = prev != null ? value - prev._total : null;
                  const n = trendChartData.length;
                  const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle';
                  return (
                    <g key={`tl-${index}`}>
                      <text x={x} y={y - 14} textAnchor={anchor} fontSize={18} fontWeight={800} fill="#2F3541">{value}</text>
                      {variance !== null && (
                        <text x={x} y={y - 34} textAnchor={anchor} fontSize={13} fontWeight={700}
                          fill={variance > 0 ? '#33A85C' : variance < 0 ? '#E91C24' : C.muted}>
                          {variance > 0 ? `▲ ${variance}` : variance < 0 ? `▼ ${Math.abs(variance)}` : '● 0'}
                        </text>
                      )}
                    </g>
                  );
                }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, justifyContent: 'center' }}>
            {[['Proposed', C.proposed], ['Seeded', C.seeded], ['Approved', C.approved]].map(([l, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 1, background: c }} />
                <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut: project type % */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>Project Type %</SectionTitle>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, justifyContent: 'center' }}>
            <div style={{ background: '#F0F5FF', borderRadius: 6, padding: '6px 22px', textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, letterSpacing: '0.06em' }}>COUNTRIES</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.retail }}>{data.meta.countries_count}</div>
            </div>
            <div style={{ background: '#F5F5F5', borderRadius: 6, padding: '6px 22px', textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, letterSpacing: '0.06em' }}>METROS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#333' }}>{data.meta.metros_count}</div>
            </div>
          </div>
          {donutData.length > 0 ? (
            <div style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart margin={{ top: 28, right: 64, bottom: 28, left: 64 }}>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={64} outerRadius={96} paddingAngle={2}
                    label={(props: any) => {
                      const { cx, cy, midAngle, innerRadius, outerRadius, name, percent } = props;
                      const RADIAN = Math.PI / 180;
                      const ringMidR = innerRadius + (outerRadius - innerRadius) / 2;
                      const ix = cx + ringMidR * Math.cos(-midAngle * RADIAN);
                      const iy = cy + ringMidR * Math.sin(-midAngle * RADIAN);
                      const outerLblR = outerRadius + 18;
                      const ox = cx + outerLblR * Math.cos(-midAngle * RADIAN);
                      const oy = cy + outerLblR * Math.sin(-midAngle * RADIAN);
                      const pct = Math.round((percent ?? 0) * 100);
                      const color = name === 'Retail' ? C.retail : C.xscale;
                      return (
                        <g key={name}>
                          <text x={ix} y={iy} textAnchor="middle" dominantBaseline="middle"
                            fill="#FFF" fontSize={10} fontWeight={400}>{name}</text>
                          <text x={ox} y={oy} textAnchor={ox > cx ? 'start' : 'end'}
                            dominantBaseline="middle" fill={color} fontSize={16} fontWeight={800}>{pct}%</text>
                        </g>
                      );
                    }}
                    labelLine={false}>
                    <Cell fill={C.retail} />
                    <Cell fill={C.xscale} />
                  </Pie>
                  <Tooltip formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(1) : String(v)} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre YoY overlay */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>YoY</div>
                  {([
                    { name: 'Retail',  vA: dataA.summary.projects.retail,  vB: dataB.summary.projects.retail,  color: C.retail  },
                    { name: 'xScale', vA: dataA.summary.projects.xscale, vB: dataB.summary.projects.xscale, color: C.xscale },
                  ]).map(({ name, vA, vB, color }) => {
                    const pct = vA > 0 ? ((vB - vA) / vA) * 100 : vB > 0 ? 100 : 0;
                    const rounded = Math.round(pct);
                    const deltaStr = rounded > 0 ? `▲ ${rounded}%`
                                   : rounded < 0 ? `▼ ${Math.abs(rounded)}%`
                                   : '● 0%';
                    return (
                      <div key={name} style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1.4 }}>{deltaStr}</div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No data</div>
          )}
        </div>

        {/* Year comparison table */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>Year Comparison — Project {tableMetric === 'count' ? 'Count' : 'Weight'}</SectionTitle>
          {/* Count / Weight toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['count', 'weight'] as const).map(m => (
              <button key={m} onClick={() => setTableMetric(m)} style={{
                flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${tableMetric === m ? C.accent : C.border}`,
                background: tableMetric === m ? C.accent : '#FFF',
                color: tableMetric === m ? '#FFF' : '#555',
                textTransform: 'capitalize',
              }}>{m}</button>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left',  padding: '4px 4px 6px', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}></th>
                <th style={{ textAlign: 'right', padding: '4px 4px 6px', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>{yearA}</th>
                <th style={{ textAlign: 'right', padding: '4px 4px 6px', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>{yearB}</th>
                <th style={{ textAlign: 'right', padding: '4px 4px 6px', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>Δ</th>
                <th style={{ textAlign: 'right', padding: '4px 4px 6px', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>Δ%</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const isWeight = tableMetric === 'weight';
                const fmt = (v: number) => isWeight ? v.toFixed(1) : String(v);

                type RowDef = { label: string; vA: number; vB: number; color: string; level: 'total' | 'type' | 'status'; borderTop?: boolean };

                const rows: RowDef[] = isWeight ? [
                  { label: 'Total',    vA: dataA.summary.projects.total_weight,  vB: dataB.summary.projects.total_weight,  color: '#111',    level: 'total' },
                  { label: 'Retail',   vA: dataA.summary.projects.retail_weight, vB: dataB.summary.projects.retail_weight, color: C.retail,  level: 'type', borderTop: true },
                  { label: 'Approved', vA: dataA.pipeline.reduce((s, r) => s + r.retail.Approved_weight, 0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Approved_weight, 0), color: C.approved, level: 'status' },
                  { label: 'Seeded',   vA: dataA.pipeline.reduce((s, r) => s + r.retail.Seeded_weight,   0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Seeded_weight,   0), color: C.seeded,   level: 'status' },
                  { label: 'Proposed', vA: dataA.pipeline.reduce((s, r) => s + r.retail.Proposed_weight, 0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Proposed_weight, 0), color: C.proposed, level: 'status' },
                  { label: 'xScale',   vA: dataA.summary.projects.xscale_weight, vB: dataB.summary.projects.xscale_weight, color: C.xscale,  level: 'type', borderTop: true },
                  { label: 'Approved', vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Approved_weight, 0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Approved_weight, 0), color: C.approved, level: 'status' },
                  { label: 'Seeded',   vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Seeded_weight,   0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Seeded_weight,   0), color: C.seeded,   level: 'status' },
                  { label: 'Proposed', vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Proposed_weight, 0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Proposed_weight, 0), color: C.proposed, level: 'status' },
                ] : [
                  { label: 'Total',    vA: dataA.summary.projects.total,  vB: dataB.summary.projects.total,  color: '#111',    level: 'total' },
                  { label: 'Retail',   vA: dataA.summary.projects.retail, vB: dataB.summary.projects.retail, color: C.retail,  level: 'type', borderTop: true },
                  { label: 'Approved', vA: dataA.pipeline.reduce((s, r) => s + r.retail.Approved, 0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Approved, 0), color: C.approved, level: 'status' },
                  { label: 'Seeded',   vA: dataA.pipeline.reduce((s, r) => s + r.retail.Seeded,   0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Seeded,   0), color: C.seeded,   level: 'status' },
                  { label: 'Proposed', vA: dataA.pipeline.reduce((s, r) => s + r.retail.Proposed, 0), vB: dataB.pipeline.reduce((s, r) => s + r.retail.Proposed, 0), color: C.proposed, level: 'status' },
                  { label: 'xScale',   vA: dataA.summary.projects.xscale, vB: dataB.summary.projects.xscale, color: C.xscale,  level: 'type', borderTop: true },
                  { label: 'Approved', vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Approved, 0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Approved, 0), color: C.approved, level: 'status' },
                  { label: 'Seeded',   vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Seeded,   0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Seeded,   0), color: C.seeded,   level: 'status' },
                  { label: 'Proposed', vA: dataA.pipeline.reduce((s, r) => s + r.xscale.Proposed, 0), vB: dataB.pipeline.reduce((s, r) => s + r.xscale.Proposed, 0), color: C.proposed, level: 'status' },
                ];

                return rows.map((row, i) => {
                  const delta = row.vB - row.vA;
                  const absDelta = isWeight ? Math.abs(delta).toFixed(1) : String(Math.abs(Math.round(delta)));
                  const pct = row.vA > 0 ? Math.round((delta / row.vA) * 100) : delta > 0 ? 100 : 0;
                  const vColor = delta > 0 ? '#33A85C' : delta < 0 ? '#E91C24' : C.muted;
                  const deltaStr = delta > 0 ? `▲ ${absDelta}` : delta < 0 ? `▼ ${absDelta}` : '—';
                  const pctStr   = delta === 0 ? '—' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
                  const isStatus = row.level === 'status';
                  const isTotal  = row.level === 'total';
                  const bg = isTotal ? '#F5F5F5' : isStatus ? '#FAFAFA' : '#FFF';
                  const borderTop = row.borderTop ? `1px solid ${C.border}` : undefined;
                  return (
                    <tr key={`${row.label}-${i}`} style={{ background: bg, borderTop }}>
                      <td style={{ padding: isStatus ? '4px 4px 4px 16px' : '5px 4px', color: row.color, fontWeight: isStatus ? 500 : 700, fontSize: isStatus ? 10 : 11 }}>{row.label}</td>
                      <td style={{ padding: isStatus ? '4px 4px' : '5px 4px', textAlign: 'right', fontWeight: isStatus ? 500 : 700, fontSize: isStatus ? 10 : 11, color: isTotal ? '#111' : undefined }}>{fmt(row.vA)}</td>
                      <td style={{ padding: isStatus ? '4px 4px' : '5px 4px', textAlign: 'right', fontWeight: isStatus ? 500 : 700, fontSize: isStatus ? 10 : 11, color: isTotal ? '#111' : undefined }}>{fmt(row.vB)}</td>
                      <td style={{ padding: isStatus ? '4px 4px' : '5px 4px', textAlign: 'right', fontWeight: isStatus ? 600 : 700, fontSize: isStatus ? 10 : 11, color: vColor }}>{deltaStr}</td>
                      <td style={{ padding: isStatus ? '4px 4px' : '5px 4px', textAlign: 'right', fontWeight: isStatus ? 600 : 700, fontSize: isStatus ? 10 : 11, color: vColor }}>{pctStr}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline lipstick bar chart */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ ...sectionLabel, marginBottom: 0 }}>Project Pipeline by {pipView === 'region' ? 'Region' : 'Country'} — Weight (front) · Count (behind) · {activeYear}</div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0, marginLeft: 12 }}>
            {(['region', 'country'] as const).map(v => (
              <button key={v} onClick={() => setPipView(v)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${pipView === v ? C.accent : C.border}`,
                background: pipView === v ? C.accent : '#FFF',
                color: pipView === v ? '#FFF' : '#555',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={pipView === 'country' ? 300 : 240}>
          <BarChart data={activeBarData} margin={{ top: 22, right: 8, bottom: pipView === 'country' ? 55 : 0, left: -30 }} barCategoryGap={pipView === 'country' ? '18%' : '28%'}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis dataKey="region" interval={0} tickLine={false}
              tick={{ fontSize: pipView === 'country' ? 8 : 9, fill: C.muted,
                      ...(pipView === 'country' ? { angle: -45, textAnchor: 'end' } : {}) }}
              height={pipView === 'country' ? 52 : 30} />
            <YAxis tick={false} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{d.region}</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ color: C.retail, fontWeight: 700, marginBottom: 2 }}>Retail</div>
                      <div style={{ color: C.muted }}>Weight: <b style={{ color: C.retail }}>{d.RetailWeight}</b></div>
                      <div style={{ color: C.muted }}>Count: <b>{d.RetailCount}</b></div>
                    </div>
                    <div>
                      <div style={{ color: C.xscale, fontWeight: 700, marginBottom: 2 }}>xScale</div>
                      <div style={{ color: C.muted }}>Weight: <b style={{ color: C.xscale }}>{d.xScaleWeight}</b></div>
                      <div style={{ color: C.muted }}>Count: <b>{d.xScaleCount}</b></div>
                    </div>
                  </div>
                </div>
              );
            }} />
            <Bar dataKey="_barH" shape={<PipelineLipstickBar />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 20, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {([['Retail Weight', C.retail, 1], ['Retail Count', C.retail, 0.22], ['xScale Weight', C.xscale, 1], ['xScale Count', C.xscale, 0.22]] as [string, string, number][]).map(([label, color, opacity]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity }} />
              <span style={{ fontSize: 10, color: C.muted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle>Pipeline Summary by Region (Weight)</SectionTitle>
          <div style={{ display: 'flex', gap: 4 }}>
            {[yearA, yearB].map(y => (
              <button key={y} onClick={() => setActiveYear(y)} style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${activeYear === y ? C.accent : C.border}`,
                background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
              }}>{y}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {(() => {
            const displayRegions = regionNames.length > 0 ? regionNames : data.pipeline.map(r => r.region_name);

            type PipelineRowDef = {
              label: string;
              level: 'type' | 'status' | 'total';
              color: string;
              getValue: (r: typeof data.pipeline[0] | undefined) => number;
              borderTop?: boolean;
            };

            const rowDefs: PipelineRowDef[] = [
              { label: 'Retail',   level: 'type',   color: C.retail,   getValue: r => r?.retail.weight           ?? 0 },
              { label: 'Approved', level: 'status', color: C.approved, getValue: r => r?.retail.Approved_weight  ?? 0 },
              { label: 'Seeded',   level: 'status', color: C.seeded,   getValue: r => r?.retail.Seeded_weight    ?? 0 },
              { label: 'Proposed', level: 'status', color: C.proposed, getValue: r => r?.retail.Proposed_weight  ?? 0 },
              { label: 'xScale',   level: 'type',   color: C.xscale,   getValue: r => r?.xscale.weight           ?? 0, borderTop: true },
              { label: 'Approved', level: 'status', color: C.approved, getValue: r => r?.xscale.Approved_weight  ?? 0 },
              { label: 'Seeded',   level: 'status', color: C.seeded,   getValue: r => r?.xscale.Seeded_weight    ?? 0 },
              { label: 'Proposed', level: 'status', color: C.proposed, getValue: r => r?.xscale.Proposed_weight  ?? 0 },
              { label: 'Total',    level: 'total',  color: '#111',     getValue: r => r?.total_weight            ?? 0, borderTop: true },
            ];

            const fmtW = (v: number) => v > 0 ? v.toFixed(1) : '—';

            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, minWidth: 90, textAlign: 'left' }}></th>
                    {displayRegions.map(rn => (
                      <th key={rn} style={{ ...THR, minWidth: 58 }}>{rc(rn)}</th>
                    ))}
                    <th style={{ ...THR, fontWeight: 800, minWidth: 58 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rowDefs.map((rowDef, i) => {
                    const isStatus = rowDef.level === 'status';
                    const isTotal  = rowDef.level === 'total';
                    const bg = isTotal ? '#F5F5F5' : isStatus ? '#FAFAFA' : '#FFF';
                    const rowTotal = data.pipeline.reduce((s, pr) => s + rowDef.getValue(pr), 0);
                    return (
                      <tr key={`${rowDef.label}-${i}`} style={{ background: bg, borderTop: rowDef.borderTop ? `1px solid ${C.border}` : undefined }}>
                        <td style={{
                          ...TD,
                          paddingLeft: isStatus ? 20 : 10,
                          color: rowDef.color,
                          fontWeight: isStatus ? 500 : 700,
                          fontSize: isStatus ? 11 : 12,
                        }}>{rowDef.label}</td>
                        {displayRegions.map(rn => {
                          const pr = data.pipeline.find(p => p.region_name === rn);
                          const val = rowDef.getValue(pr);
                          return (
                            <td key={rn} style={{ ...TDM, color: val > 0 ? rowDef.color : '#DDD', fontWeight: isStatus ? 400 : 600, fontSize: isStatus ? 11 : 12 }}>
                              {fmtW(val)}
                            </td>
                          );
                        })}
                        <td style={{ ...TDR, color: rowTotal > 0 ? rowDef.color : '#DDD', fontWeight: isTotal ? 800 : isStatus ? 400 : 700, fontSize: isStatus ? 11 : 12 }}>
                          {fmtW(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PEOPLE TAB
// ---------------------------------------------------------------------------

function PeopleTab({ yearA, yearB, dataA, dataB, allRegionNames, regionCodeMap }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData; allRegionNames: string[]; regionCodeMap: Record<string, string> }) {
  const rc = (name: string) => regionCodeMap[name] || name;
  const [activeYear, setActiveYear] = useState(yearA);
  const data = activeYear === yearA ? dataA : dataB;

  // Use all regions (incl. Global) as placeholders; regions with no data show zeros
  const displayRegions = allRegionNames.length > 0 ? allRegionNames : data.headcount.map(r => r.region_name);

  // Stacked horizontal bar data — one entry per region, zeros where no headcount
  const hcBarData = displayRegions.map(rn => {
    const r = data.headcount.find(h => h.region_name === rn);
    return {
      region: rc(rn),
      'VP/Dir':     r?.exist_vp_dir ?? 0,
      'FTE':        r?.exist_fte    ?? 0,
      'Contingent': r?.exist_con    ?? 0,
      'Appr FTE':   r?.appr_fte     ?? 0,
      'Req FTE':    r?.req_fte      ?? 0,
      'Req CON':    r?.req_con      ?? 0,
    };
  });

  // Area chart data — same headcount for both years currently (no year tagging yet)
  const areaData = [
    { year: String(yearA), ...Object.fromEntries(['VP/Dir','FTE','Contingent','Appr FTE','Req FTE'].map(k => [k, dataA.headcount.reduce((s, r) => s + ((r as any)[k.replace('/','_').replace(' ','_').toLowerCase()] ?? 0), 0)])) },
    { year: String(yearB), ...Object.fromEntries(['VP/Dir','FTE','Contingent','Appr FTE','Req FTE'].map(k => [k, dataB.headcount.reduce((s, r) => s + ((r as any)[k.replace('/','_').replace(' ','_').toLowerCase()] ?? 0), 0)])) },
  ];

  const totalA = dataA.headcount.reduce((s, r) => s + r.total_heads, 0);
  const totalB = dataB.headcount.reduce((s, r) => s + r.total_heads, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14 }}>

        {/* Stacked bar */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SectionTitle>Existing Team / Requests by Region</SectionTitle>
            <div style={{ display: 'flex', gap: 4 }}>
              {[yearA, yearB].map(y => (
                <button key={y} onClick={() => setActiveYear(y)} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeYear === y ? C.accent : C.border}`,
                  background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
                }}>{y}</button>
              ))}
            </div>
          </div>
          {hcBarData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, hcBarData.length * 38)}>
              <BarChart data={hcBarData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="region" width={90}
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    return (
                      <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#333">
                        {payload.value}
                      </text>
                    );
                  }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="VP/Dir"     stackId="a" fill={C.vpDir}  ><LabelList dataKey="VP/Dir"     position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
                <Bar dataKey="FTE"        stackId="a" fill={C.fte}    ><LabelList dataKey="FTE"        position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
                <Bar dataKey="Contingent" stackId="a" fill={C.con}    ><LabelList dataKey="Contingent" position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
                <Bar dataKey="Appr FTE"   stackId="a" fill={C.apprFte}><LabelList dataKey="Appr FTE"   position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
                <Bar dataKey="Req FTE"    stackId="a" fill={C.reqFte} ><LabelList dataKey="Req FTE"    position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
                <Bar dataKey="Req CON"    stackId="a" fill={C.reqCon}  radius={[0, 2, 2, 0]}><LabelList dataKey="Req CON" position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' }}>
            {[['VP/Dir',C.vpDir],['FTE',C.fte],['Contingent',C.con],['Appr FTE',C.apprFte],['Req FTE',C.reqFte],['Req CON',C.reqCon]].map(([l,c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: 1, background: c }} />
                <span style={{ fontSize: 9, color: C.muted }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Headcount matrix table */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionTitle>People Existing / Requests by Region</SectionTitle>
            <div style={{ display: 'flex', gap: 4 }}>
              {[yearA, yearB].map(y => (
                <button key={y} onClick={() => setActiveYear(y)} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeYear === y ? C.accent : C.border}`,
                  background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
                }}>{y}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, minWidth: 100 }}>Role Type</th>
                  {displayRegions.map(rn => <th key={rn} style={THR}>{rc(rn)}</th>)}
                  <th style={THR}>Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'exist_vp_dir',   label: 'Exist VP / Director', color: C.vpDir,   bold: false },
                  { key: 'exist_fte',      label: 'Exist FTE',           color: '#444',    bold: false },
                  { key: 'exist_con',      label: 'Exist Contingent',    color: C.con,     bold: false },
                  { key: 'appr_fte',       label: 'Approved TBH FTE',    color: C.apprFte, bold: false },
                  { key: 'appr_con_fte',   label: 'Appr CON → FTE',      color: C.apprCon, bold: false },
                  { key: 'existing_heads', label: 'Existing Heads',      color: '#111',    bold: true  },
                  { key: 'req_fte',        label: 'Requested TBH FTE',   color: C.reqFte,  bold: false },
                  { key: 'req_con_fte',    label: 'Convert to FTE',      color: C.reqCon,  bold: false },
                  { key: 'req_con',        label: 'Req TBH Contingent',  color: C.con,     bold: false },
                  { key: 'total_heads',    label: 'TOTAL HEADS',         color: '#111',    bold: true  },
                ].map(({ key, label, color, bold }) => {
                  const total = data.headcount.reduce((s, r) => s + ((r as any)[key] ?? 0), 0);
                  const isSubtotal = key === 'existing_heads' || key === 'total_heads';
                  return (
                    <tr key={key} style={{ background: isSubtotal ? '#F0F5FF' : 'transparent' }}>
                      <td style={{ ...TD, fontSize: 11, fontWeight: bold ? 700 : 400, color: bold ? '#111' : '#555', paddingLeft: isSubtotal ? 10 : 20 }}>
                        {!isSubtotal && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 5 }} />}
                        {label}
                      </td>
                      {displayRegions.map(rn => {
                        const r = data.headcount.find(h => h.region_name === rn);
                        const v = (r as any)?.[key] ?? 0;
                        return <td key={rn} style={{ ...TDM, fontSize: 11, color: v > 0 ? color : '#DDD', fontWeight: bold ? 700 : 400 }}>{v || '—'}</td>;
                      })}
                      <td style={{ ...TDR, fontSize: 11, color: bold ? '#111' : color, background: isSubtotal ? '#E8EEFB' : 'transparent' }}>{total || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Year comparison stacked area */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <SectionTitle>Total Headcount: {yearA} vs {yearB} Comparison</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Exist VP/Dir',  vA: dataA.headcount.reduce((s,r)=>s+r.exist_vp_dir,0),   vB: dataB.headcount.reduce((s,r)=>s+r.exist_vp_dir,0),   color: C.vpDir },
            { label: 'Exist FTE',     vA: dataA.headcount.reduce((s,r)=>s+r.exist_fte,0),       vB: dataB.headcount.reduce((s,r)=>s+r.exist_fte,0),       color: C.fte },
            { label: 'Contingent',    vA: dataA.headcount.reduce((s,r)=>s+r.exist_con,0),       vB: dataB.headcount.reduce((s,r)=>s+r.exist_con,0),       color: C.con },
            { label: 'Total Heads',   vA: totalA,                                               vB: totalB,                                               color: '#111' },
          ].map(row => (
            <div key={row.label} style={{ background: '#F8F9FA', borderRadius: 7, padding: '12px 14px', borderLeft: `3px solid ${row.color}` }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 8 }}>{row.label}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <span style={{ fontSize: 8, color: C.muted }}>YR A · {yearA}</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: row.color, lineHeight: 1 }}>{row.vA}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 8, color: '#086AE3' }}>YR B · {yearB}</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#086AE3', lineHeight: 1 }}>{row.vB}</div>
                </div>
              </div>
              <div style={{ marginTop: 6 }}><DeltaBadge a={row.vA} b={row.vB} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REQUESTS TAB
// ---------------------------------------------------------------------------

function RequestsTab({ yearA, yearB, dataA, dataB, regionCodeMap }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData; regionCodeMap: Record<string, string> }) {
  const rc = (name: string) => regionCodeMap[name] || name;
  const [activeYear, setActiveYear] = useState(yearA);
  const data = activeYear === yearA ? dataA : dataB;
  const [levels, setLevels] = useState<Level[]>([]);
  useEffect(() => { refDataApi.levels().then(setLevels).catch(() => {}); }, []);

  // Aggregate requests by discipline — pre-populate all known disciplines as zero placeholders
  const byDisc: Record<string, { rFte: number; rCon: number }> = {};
  for (const disc of Object.keys(C.discColors)) byDisc[disc] = { rFte: 0, rCon: 0 };
  for (const r of data.requests) {
    if (!byDisc[r.discipline_name]) byDisc[r.discipline_name] = { rFte: 0, rCon: 0 };
    if (r.contract_code === 'R FTE')     byDisc[r.discipline_name].rFte += r.contracted_fte;
    else if (['R CON', 'R CON>FTE'].includes(r.contract_code)) byDisc[r.discipline_name].rCon += r.contracted_fte;
  }
  const discBarData = Object.entries(byDisc).map(([disc, v]) => ({
    discipline: disc,
    fullName: disc,
    'R FTE':         Math.round(v.rFte * 10) / 10,
    'R CON/CON→FTE': Math.round(v.rCon * 10) / 10,
  }));

  const totalRFte = data.requests.filter(r => r.contract_code === 'R FTE').reduce((s, r) => s + r.contracted_fte, 0);
  const totalRCon = data.requests.filter(r => ['R CON','R CON>FTE'].includes(r.contract_code)).reduce((s, r) => s + r.contracted_fte, 0);

  // Donut by discipline
  const donutData = Object.entries(byDisc)
    .map(([disc, v]) => ({ name: disc, value: v.rFte + v.rCon }))
    .filter(d => d.value > 0);

  const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
    'R FTE':     { bg: '#FFF8E1', color: C.seeded },
    'R CON':     { bg: '#FEF3F2', color: C.accent },
    'R CON>FTE': { bg: '#EBF2FB', color: C.retail },
  };
  const DISC_PIE_COLORS = ['#086AE3','#33A85C','#FDB90D','#00737A','#8B93A3'];

  // Aggregate requests by level for both years — senior→junior order (level_number DESC)
  const sortedLevels = [...levels].sort((a, b) => (b.level_number ?? -1) - (a.level_number ?? -1));
  const aggByLevel = (reqs: HubIqYearData['requests']) => {
    const m: Record<string, number> = {};
    for (const r of reqs) {
      const k = r.level_code ?? 'Unknown';
      m[k] = (m[k] ?? 0) + r.contracted_fte;
    }
    return m;
  };
  const levelMapA = aggByLevel(dataA.requests);
  const levelMapB = aggByLevel(dataB.requests);
  const levelLineData = sortedLevels.map(l => ({
    level: l.short_code,
    [yearA]: Math.round((levelMapA[l.short_code] ?? 0) * 10) / 10,
    [yearB]: Math.round((levelMapB[l.short_code] ?? 0) * 10) / 10,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 14 }}>

        {/* Bar: by discipline */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SectionTitle>Requests by Discipline</SectionTitle>
            <div style={{ display: 'flex', gap: 4 }}>
              {[yearA, yearB].map(y => (
                <button key={y} onClick={() => setActiveYear(y)} style={{
                  padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeYear === y ? C.accent : C.border}`,
                  background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
                }}>{y}</button>
              ))}
            </div>
          </div>
          {/* KPI chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: '#FFF1CC', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.seeded }}>{totalRFte.toFixed(1)}</div>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>R FTE</div>
            </div>
            <div style={{ flex: 1, background: '#CCE3FF', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.retail }}>{totalRCon.toFixed(1)}</div>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>R CON</div>
            </div>
          </div>
          {totalRFte === 0 && totalRCon === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No requests</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={discBarData} margin={{ top: 4, right: 6, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="discipline" tick={{ fontSize: 9, fill: C.muted }} angle={-20} textAnchor="end" />
                <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="R FTE" fill={C.seeded} radius={[2, 2, 0, 0]}>
                  <LabelList dataKey="R FTE" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: unknown) => (typeof v === 'number' && v > 0) ? v : ''} />
                </Bar>
                <Bar dataKey="R CON/CON→FTE" fill={C.retail} radius={[2, 2, 0, 0]}>
                  <LabelList dataKey="R CON/CON→FTE" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: unknown) => (typeof v === 'number' && v > 0) ? v : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut: distribution */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>Distribution by Discipline</SectionTitle>
          {donutData.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No requests</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={40} outerRadius={65} paddingAngle={2}
                    startAngle={45} endAngle={45 + 360}
                    label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
                    labelLine={false}>
                    {donutData.map((_, i) => <Cell key={i} fill={DISC_PIE_COLORS[i % DISC_PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)) + ' FTE'} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {donutData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: DISC_PIE_COLORS[i % DISC_PIE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: '#444', flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#111' }}>{d.value.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Detail table */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionTitle>Request Details by Discipline / Region / Level / Type</SectionTitle>
            <div style={{ display: 'flex', gap: 4 }}>
              {[yearA, yearB].map(y => (
                <button key={y} onClick={() => setActiveYear(y)} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeYear === y ? C.accent : C.border}`,
                  background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
                }}>{y}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={TH}>Discipline</th>
                  <th style={TH}>Region</th>
                  <th style={TH}>Country</th>
                  <th style={TH}>Level</th>
                  <th style={TH}>Type</th>
                  <th style={THR}>FTE</th>
                  <th style={TH}>Name / TBH</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: C.muted, padding: '20px 0' }}>No requests</td></tr>
                ) : data.requests.map((r, i) => {
                  const tc = TYPE_COLOR[r.contract_code] ?? { bg: '#F5F5F5', color: '#555' };
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#FFF' : '#FAFAFA' }}>
                      <td style={{ ...TD, fontSize: 11, color: C.discColors[r.discipline_name] === '#FDB90D' ? '#C59000' : (C.discColors[r.discipline_name] ?? '#333'), fontWeight: 600 }}>{r.discipline_name}</td>
                      <td style={{ ...TD, fontSize: 11 }}>{rc(r.region_name)}</td>
                      <td style={{ ...TD, fontSize: 11 }}>{r.country_name ?? '—'}</td>
                      <td style={{ ...TD, fontSize: 11 }}>{r.level_code ?? '—'}</td>
                      <td style={{ ...TD, fontSize: 11 }}>
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: tc.bg, color: tc.color }}>{r.contract_code}</span>
                      </td>
                      <td style={{ ...TDR, fontSize: 11 }}>{r.contracted_fte}</td>
                      <td style={{ ...TD, fontSize: 11, color: C.muted }}>{r.person_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Line chart: requests by level */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <SectionTitle>Requests by Level</SectionTitle>
        {levelLineData.length === 0 ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>Loading levels…</div>
        ) : (
          <ResponsiveContainer width="100%" height={175}>
            <LineChart data={levelLineData} margin={{ top: 20, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
              <XAxis dataKey="level" tick={{ fontSize: 10, fill: C.muted }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)) as any} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
              <Line type="monotone" dataKey={yearA} name={String(yearA)} stroke={C.seeded} strokeWidth={2} dot={{ r: 4, fill: C.seeded }} activeDot={{ r: 5 }}
                label={((p: any) => {
                  if (typeof p.value !== 'number' || p.value < 1) return <g />;
                  return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill={C.seeded} fontWeight={700}>{p.value}</text>;
                }) as any} />
              <Line type="monotone" dataKey={yearB} name={String(yearB)} stroke={C.retail} strokeWidth={2} dot={{ r: 4, fill: C.retail }} activeDot={{ r: 5 }}
                label={((p: any) => {
                  if (typeof p.value !== 'number' || p.value < 1) return <g />;
                  return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill={C.retail} fontWeight={700}>{p.value}</text>;
                }) as any} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GEARING – lipstick (bullet) bar shape
// ---------------------------------------------------------------------------

function PlaceholderBackground({ x, y, width, height, payload }: any) {
  if (!payload || payload.Max > 0) return <g />;
  const cx = x + width / 2;
  const bw = Math.max(width - 2, 6);
  return <rect x={cx - bw * 0.26} y={y} width={bw * 0.52} height={height} fill="#E8E9EB" rx={2} />;
}

function BulletBar({ x, y, width, height, payload, fill }: any) {
  if (!payload || payload.Max <= 0 || height <= 0) return <g />;
  const bottom = y + height;                         // zero baseline in px
  const ppu    = height / payload.Max;               // pixels per headcount unit
  const minH   = Math.max((payload.Min ?? 0) * ppu, 0);
  const propY  = Math.min(bottom, Math.max(y, bottom - (payload.Proposed ?? 0) * ppu));
  const bw     = Math.max(width - 2, 6);
  const cx     = x + width / 2;
  const maxW   = Math.round(bw * 0.52);
  const markerW = Math.round(bw * 0.62);
  return (
    <g>
      {/* Min — wide, behind */}
      <rect x={cx - bw / 2}    y={bottom - minH}  width={bw}    height={Math.max(minH, 0)} fill={`${fill}35`} rx={2} />
      {/* Max — narrower, in front */}
      <rect x={cx - maxW / 2}  y={y}              width={maxW}  height={height}            fill={`${fill}80`} rx={2} />
      {/* Proposed — red horizontal marker */}
      <rect x={cx - markerW / 2} y={propY - 12}  width={markerW} height={24}              fill="#E91C24"     rx={1} />
    </g>
  );
}

function BulletTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#2F3541' }}>{label}</div>
      <div style={{ color: C.muted }}>Min: <b style={{ color: '#333' }}>{d.Min}</b></div>
      <div style={{ color: C.muted }}>Max: <b style={{ color: '#333' }}>{d.Max}</b></div>
      <div style={{ color: C.accent }}>Proposed: <b>{d.Proposed}</b></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GEARING TAB
// ---------------------------------------------------------------------------

function GearingTab({ yearA, yearB, dataA, dataB, regionNames, regionCodeMap }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData; regionNames: string[]; regionCodeMap: Record<string, string> }) {
  const rc = (name: string) => regionCodeMap[name] || name;
  const [activeYear, setActiveYear] = useState(yearA);
  const data = activeYear === yearA ? dataA : dataB;

  const overallTotals = data.gearing.map(d => d.totals);
  const totalProposed = overallTotals.reduce((s, t) => s + t.proposed, 0);
  const totalOptimal  = overallTotals.reduce((s, t) => s + t.optimal,  0);
  const totalVarOpt   = totalOptimal  > 0 ? Math.round(((totalProposed - totalOptimal)  / totalOptimal)  * 1000) / 10 : 0;
  const totalMin      = overallTotals.reduce((s, t) => s + t.min, 0);
  const totalMax      = overallTotals.reduce((s, t) => s + t.max, 0);
  const totalVarMin   = totalMin > 0 ? Math.round(((totalProposed - totalMin) / totalMin) * 1000) / 10 : 0;
  const totalVarMax   = totalMax > 0 ? Math.round(((totalProposed - totalMax) / totalMax) * 1000) / 10 : 0;

  function gColor(pct: number) {
    if (pct === 0) return C.muted;
    if (pct > 20)  return '#AD050C';
    if (pct > 5)   return '#E91C24';
    if (pct < -20) return '#086AE3';
    if (pct < -5)  return '#086AE3';
    return '#33A85C';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary KPI tiles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <span style={sectionLabel}>Department Headcount vs Gearing (Optimal / Min / Max)</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[yearA, yearB].map(y => (
            <button key={y} onClick={() => setActiveYear(y)} style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activeYear === y ? C.accent : C.border}`,
              background: activeYear === y ? C.accent : '#FFF', color: activeYear === y ? '#FFF' : '#555',
            }}>{y}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Proposed HC', value: totalProposed, bg: C.accent,    text: '#FFF' },
          { label: 'Total Optimal HC',  value: totalOptimal,  bg: '#2F3541',   text: '#FFF' },
          { label: 'Var vs Optimal',    value: `${totalVarOpt > 0 ? '+' : ''}${totalVarOpt}%`, bg: '#CCE3FF', text: gColor(totalVarOpt) },
          { label: 'Var vs Min (HC)',   value: `${totalVarMin > 0 ? '+' : ''}${totalVarMin}%`, bg: '#DFFBE5', text: gColor(totalVarMin) },
          { label: 'Var vs Max (HC)',   value: `${totalVarMax > 0 ? '+' : ''}${totalVarMax}%`, bg: '#FFF8F0', text: gColor(totalVarMax) },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 8, padding: '7px 12px', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: kpi.bg === '#F0F5FF' || kpi.bg === '#F5FFF5' || kpi.bg === '#FFF8F0' ? C.muted : kpi.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: kpi.text, lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* 4 discipline tables + bar charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {data.gearing.map(disc => {
          const color      = C.discColors[disc.discipline] ?? C.accent;
          const labelColor = color === '#FDB90D' ? '#C59000' : color;
          const allRegions = regionNames.length > 0 ? regionNames : disc.regions.map(r => r.region_name);
          const barData = allRegions.map(regionName => {
            const r = disc.regions.find(x => x.region_name === regionName);
            return {
              region: rc(regionName),
              Min: r?.min ?? 0, Max: r?.max ?? 0, Proposed: r?.proposed ?? 0,
            };
          });
          return (
            <div key={disc.discipline} style={{ ...cardStyle, overflow: 'hidden' }}>
              {/* Discipline header */}
              <div style={{ padding: '10px 14px', borderTop: `3px solid ${color}`, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: labelColor }}>{disc.discipline}</span>
                <span style={{ fontSize: 11, background: `${color}22`, color: labelColor, padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                  Var–Opt: <PctBadge pct={disc.totals.variance_pct} />
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, minWidth: 90, fontSize: 9 }}>Region</th>
                      <th style={{ ...THR, fontSize: 9 }}>Min</th>
                      <th style={{ ...THR, fontSize: 9 }}>Max</th>
                      <th style={{ ...THR, fontSize: 9, color }}>Proposed</th>
                      <th style={{ ...THR, fontSize: 9 }}>Optimal</th>
                      <th style={{ ...THR, fontSize: 9 }}>Var</th>
                      <th style={{ ...THR, fontSize: 9 }}>Var %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...disc.regions, { ...disc.totals, region_name: 'Grand Total', _isTotal: true } as any].map((row, i) => {
                      const isTotal = row._isTotal;
                      return (
                        <tr key={row.region_name} style={{ background: isTotal ? '#F5F5F5' : i % 2 === 0 ? '#FFF' : '#FAFAFA', borderTop: isTotal ? `2px solid ${C.border}` : 'none' }}>
                          <td style={{ ...TD, fontSize: 11, fontWeight: isTotal ? 700 : 400, color: isTotal ? '#555' : '#333' }}>{rc(row.region_name)}</td>
                          <td style={TDM}>{row.min || '—'}</td>
                          <td style={TDM}>{row.max || '—'}</td>
                          <td style={{ ...TDR, color, fontSize: 11 }}>{row.proposed || '—'}</td>
                          <td style={TDM}>{row.optimal || '—'}</td>
                          <td style={{ ...TDM, fontSize: 11, color: row.variance !== 0 ? gColor(row.variance_pct) : C.muted }}>{row.variance > 0 ? `+${row.variance}` : (row.variance || '—')}</td>
                          <td style={{ ...TDM, fontWeight: 700 }}><PctBadge pct={row.variance_pct} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bar chart — lipstick/bullet style */}
              {allRegions.length > 0 && (
                <div style={{ padding: '8px 4px 4px' }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 16, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                      <XAxis dataKey="region" tick={{ fontSize: 8, fill: C.muted }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fontSize: 8, fill: C.muted }} domain={[0, 'auto']} />
                      <Tooltip content={<BulletTooltip />} />
                      <Bar dataKey="Max" fill={color} shape={BulletBar} background={<PlaceholderBackground />} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: 10, height: 8, borderRadius: 1, background: `${color}35` }} />
                      <span style={{ fontSize: 9, color: C.muted }}>Min</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: 7, height: 8, borderRadius: 1, background: `${color}80` }} />
                      <span style={{ fontSize: 9, color: C.muted }}>Max</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: 12, height: 3, borderRadius: 1, background: C.accent, marginBottom: 1 }} />
                      <span style={{ fontSize: 9, color: C.muted }}>Proposed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HIRE STATUS TAB
// ---------------------------------------------------------------------------

function HireStatusTab({ tbhStatus }: { tbhStatus: { req_status: string; count: number }[] }) {
  const STAGE_ORDER = ['Req not raised', 'Not Raised', 'Screening', 'Screen', 'Interview', 'Offer Accepted', 'Hired', 'Closed'];
  const sorted = [...tbhStatus].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a.req_status), ib = STAGE_ORDER.indexOf(b.req_status);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const total = sorted.reduce((s, r) => s + r.count, 0);

  const STAGE_COLORS: Record<string, string> = {
    'Hired': '#33A85C', 'Closed': '#8B93A3', 'Offer Accepted': '#00737A',
    'Interview': '#086AE3', 'Screening': '#470063', 'Screen': '#470063',
    'Not Raised': '#E91C24', 'Req not raised': '#E91C24',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>

        {/* Horizontal bar chart */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>TBH Roles by Hiring Stage</SectionTitle>
          {sorted.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No TBH data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36)}>
              <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis type="category" dataKey="req_status" tick={{ fontSize: 11, fill: '#333' }} width={98} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#555' }}>
                  {sorted.map((entry, i) => (
                    <Cell key={i} fill={STAGE_COLORS[entry.req_status] ?? '#AAAAAA'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...cardStyle, padding: '14px 16px' }}>
            <SectionTitle>TBH Status Summary</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map(row => {
                const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                const color = STAGE_COLORS[row.req_status] ?? '#888';
                return (
                  <div key={row.req_status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#444' }}>{row.req_status}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color }}>{row.count} <span style={{ fontWeight: 400, color: C.muted }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Total TBH Codes</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{total}</span>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '14px 16px', background: '#F2F3F4', border: '1px solid #E0E3E8' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Hire Stage Note</div>
            <div style={{ fontSize: 12, color: '#5A657B', lineHeight: 1.6 }}>
              Hire stage data comes from TBH code records. Time-to-hire tracking and monthly hire volume charts will be available once <code style={{ background: '#E0E3E8', padding: '1px 4px', borderRadius: 2, fontSize: 10, color: '#2F3541' }}>hired_at</code> dates are recorded on person records.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearA, setYearA] = useState<number | null>(null);
  const [yearB, setYearB] = useState<number | null>(null);
  const [hubData, setHubData]   = useState<HubIqResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Projects');

  useEffect(() => {
    dashboardApi.planningYears()
      .then(rows => {
        const years = rows.map(r => r.year);
        setAvailableYears(years);
        setYearA(years[0] ?? 2026);
        setYearB(years[1] ?? years[0] ?? 2027);
      })
      .catch(() => { setYearA(2026); setYearB(2027); });
  }, []);

  const loadData = useCallback(async () => {
    if (yearA === null || yearB === null) return;
    setLoading(true); setError(null);
    try {
      const d = await dashboardApi.hubIq(yearA, yearB);
      setHubData(d);
      setBackendOk(true);
    } catch (e: unknown) {
      setError((e as Error).message);
      setBackendOk(false);
    } finally {
      setLoading(false);
    }
  }, [yearA, yearB]);

  useEffect(() => { loadData(); }, [loadData]);

  const dataA = hubData?.years[yearA ?? 0];
  const dataB = hubData?.years[yearB ?? 0];
  const ready = !loading && !!dataA && !!dataB && yearA !== null && yearB !== null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, color: '#111' }}>

      {/* Dark KPI banner */}
      {ready && <TopBanner yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} />}

      {/* Year selectors + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 20px', background: '#FFFFFF', borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>YEAR A</span>
            <select value={yearA ?? ''} onChange={e => setYearA(Number(e.target.value))} style={{ padding: '3px 8px', border: `1px solid ${C.accent}`, borderRadius: 4, fontSize: 12, color: C.accent, fontWeight: 700, background: '#FFF8F8', cursor: 'pointer' }}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span style={{ fontSize: 13, color: C.muted }}>vs</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#086AE3' }}>YEAR B</span>
            <select value={yearB ?? ''} onChange={e => setYearB(Number(e.target.value))} style={{ padding: '3px 8px', border: '1px solid #086AE3', borderRadius: 4, fontSize: 12, color: '#086AE3', fontWeight: 700, background: '#CCE3FF', cursor: 'pointer' }}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={loadData} disabled={loading} style={{ padding: '3px 12px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', background: '#FFF', color: '#555' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
        {backendOk === true && <span style={{ fontSize: 10, color: '#33A85C' }}>● Connected</span>}
        {backendOk === false && <span style={{ fontSize: 10, color: C.accent }}>⚠ Not connected</span>}
      </div>

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div style={{ fontSize: 14, color: C.muted }}>Loading dashboard…</div>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: '16px 20px', background: '#FEF3F2', border: `1px solid #FBBDBA`, borderRadius: 8, color: C.accent, fontSize: 13 }}>
            Failed to load: {error}
            <button onClick={loadData} style={{ marginLeft: 12, fontSize: 12, cursor: 'pointer', padding: '3px 10px', border: `1px solid #FBBDBA`, borderRadius: 4, background: '#FFF', color: C.accent }}>Retry</button>
          </div>
        )}
        {ready && (
          <>
            {activeTab === 'Projects'    && <ProjectsTab    yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} projectTrend={hubData!.project_trend} regionNames={hubData?.region_names ?? []} regionCodeMap={hubData?.region_code_map ?? {}} />}
            {activeTab === 'People'      && <PeopleTab      yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} allRegionNames={hubData?.all_region_names ?? []} regionCodeMap={hubData?.region_code_map ?? {}} />}
            {activeTab === 'Requests'    && <RequestsTab    yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} regionCodeMap={hubData?.region_code_map ?? {}} />}
            {activeTab === 'Gearing'     && <GearingTab     yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} regionNames={hubData?.region_names ?? []} regionCodeMap={hubData?.region_code_map ?? {}} />}
            {activeTab === 'Hire Status' && <HireStatusTab  tbhStatus={hubData!.tbh_status} />}
          </>
        )}
      </div>
    </div>
  );
}
