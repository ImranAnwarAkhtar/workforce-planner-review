import { useEffect, useState, useCallback, useRef } from 'react';
import equinixFortressRed from '../assets/equinix-fortress-red.svg';
import PlanningCycleBanner from '../components/PlanningCycleBanner';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine,
  LineChart, Line,
  ComposedChart, Area,
} from 'recharts';
import {
  dashboardApi, refDataApi, tbhCodesApi,
  type HubIqResponse, type HubIqYearData, type Level, type Discipline, type HubIqTbhDiscRegion, type TbhCode,
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

const TABS = ['Projects', 'People', 'Requests', 'Gearing', 'Hire Status', 'Onboarding'] as const;
type Tab = typeof TABS[number];

const REGION_ORDER = ['APAC', 'AMER', 'AMER Matrix', 'EMEA-C', 'EMEA-N', 'EMEA-S', 'MEA', 'Global'];
function regionSortIdx(name: string): number {
  const n = name.toLowerCase().replace(/[-\s]/g, '');
  for (let i = 0; i < REGION_ORDER.length; i++) {
    if (REGION_ORDER[i].toLowerCase().replace(/[-\s]/g, '') === n) return i;
  }
  for (let i = 0; i < REGION_ORDER.length; i++) {
    const r = REGION_ORDER[i].toLowerCase().replace(/[-\s]/g, '');
    if (n.includes(r) || r.includes(n)) return i;
  }
  return REGION_ORDER.length;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined | null) { return n ?? 0; }

function DeltaBadge({ a, b, size = 11, isFloat, suffix = '' }: { a: number; b: number; size?: number; isFloat?: boolean; suffix?: string }) {
  const d = b - a;
  if (Math.abs(d) < (isFloat ? 0.001 : 0.5)) return <span style={{ fontSize: size, color: '#BDC1CA' }}>● {isFloat ? `0.0${suffix}` : '0'}</span>;
  const up = d > 0;
  const label = isFloat ? `${Math.abs(d).toFixed(1)}${suffix}` : Math.abs(Math.round(d));
  return <span style={{ fontSize: size, fontWeight: 700, color: up ? '#33A85C' : '#E91C24' }}>{up ? '▲' : '▼'} {label}</span>;
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

function gearVarOpt(data: HubIqYearData): number {
  const totals   = data.gearing.map(d => d.totals);
  const proposed = totals.reduce((s, t) => s + t.proposed, 0);
  const optimal  = totals.reduce((s, t) => s + t.optimal,  0);
  return optimal > 0 ? Math.round(((proposed - optimal) / optimal) * 1000) / 10 : 0;
}

function TopBanner({ yearA, yearB, dataA, dataB }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData }) {
  const sA = dataA.summary, sB = dataB.summary;
  const gVarA = gearVarOpt(dataA);
  const gVarB = gearVarOpt(dataB);

  const groups: { label: string; items: { name: string; dotColor?: string; vA: number; vB: number; isFloat?: boolean; suffix?: string }[] }[] = [
    {
      label: 'PROJECTS',
      items: [
        { name: 'TOTAL',    vA: sA.projects.total,  vB: sB.projects.total },
        { name: 'RETAIL',   dotColor: C.retail,  vA: sA.projects.retail,  vB: sB.projects.retail },
        { name: 'XSCALE',   dotColor: C.xscale,  vA: sA.projects.xscale,  vB: sB.projects.xscale },
        { name: 'MW', dotColor: '#00737A', vA: sA.projects.total_power_kw / 1000, vB: sB.projects.total_power_kw / 1000, isFloat: true },
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
    {
      label: 'GEARING',
      items: [
        { name: 'OPTIMAL', dotColor: '#33A85C', vA: gVarA, vB: gVarB, isFloat: true, suffix: '%' },
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
                {item.isFloat ? fmt(item.vA).toFixed(1) : fmt(item.vA)}{item.suffix ?? ''}
              </div>
              {/* Year B + delta row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#086AE3' }}>
                  {item.isFloat ? fmt(item.vB).toFixed(1) : fmt(item.vB)}{item.suffix ?? ''}
                </span>
                <DeltaBadge a={item.vA} b={item.vB} size={11} isFloat={item.isFloat} suffix={item.suffix} />
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

function TabBar({ active, onChange, availableYears, yearRange, onYearRangeChange, yearA, yearB, requestYear, onRequestYearChange, regionNamesAll, hireStatusRegions, onHireStatusRegionsChange, onboardingRegions, onOnboardingRegionsChange, onboardingYearRange, onOnboardingYearRangeChange }: {
  active: Tab; onChange: (t: Tab) => void;
  availableYears: number[];
  yearRange: [number, number] | null;
  onYearRangeChange: (r: [number, number] | null) => void;
  yearA: number | null; yearB: number | null;
  requestYear: number | null;
  onRequestYearChange: (y: number) => void;
  regionNamesAll: string[];
  hireStatusRegions: string[];
  onHireStatusRegionsChange: (r: string[]) => void;
  onboardingRegions: string[];
  onOnboardingRegionsChange: (r: string[]) => void;
  onboardingYearRange: [number, number] | null;
  onOnboardingYearRangeChange: (r: [number, number] | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const onbTrackRef = useRef<HTMLDivElement>(null);
  const [hireMenuOpen, setHireMenuOpen] = useState(false);
  const [onbMenuOpen,  setOnbMenuOpen]  = useState(false);
  const n = availableYears.length;
  const startIdx = yearRange ? Math.max(0, availableYears.indexOf(yearRange[0])) : 0;
  const endIdx   = yearRange ? Math.max(0, availableYears.indexOf(yearRange[1])) : Math.max(0, n - 1);
  const startPct = n > 1 ? (startIdx / (n - 1)) * 100 : 0;
  const endPct   = n > 1 ? (endIdx   / (n - 1)) * 100 : 100;
  const onbStartIdx = onboardingYearRange ? Math.max(0, availableYears.indexOf(onboardingYearRange[0])) : 0;
  const onbEndIdx   = onboardingYearRange ? Math.max(0, availableYears.indexOf(onboardingYearRange[1])) : Math.max(0, n - 1);
  const onbStartPct = n > 1 ? (onbStartIdx / (n - 1)) * 100 : 0;
  const onbEndPct   = n > 1 ? (onbEndIdx   / (n - 1)) * 100 : 100;

  function getIdx(clientX: number) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (n - 1));
  }

  function getOnbIdx(clientX: number) {
    const track = onbTrackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (n - 1));
  }

  function makeHandle(type: 'start' | 'end') {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const idx = getIdx(e.clientX);
        const newRange: [number, number] = type === 'start'
          ? [availableYears[Math.min(idx, endIdx)], availableYears[endIdx]]
          : [availableYears[startIdx], availableYears[Math.max(idx, startIdx)]];
        onYearRangeChange(newRange);
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  function makeOnbHandle(type: 'start' | 'end') {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const idx = getOnbIdx(e.clientX);
        const newRange: [number, number] = type === 'start'
          ? [availableYears[Math.min(idx, onbEndIdx)], availableYears[onbEndIdx]]
          : [availableYears[onbStartIdx], availableYears[Math.max(idx, onbStartIdx)]];
        onOnboardingYearRangeChange(newRange);
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  const HANDLE: React.CSSProperties = {
    position: 'absolute', width: 14, height: 14, borderRadius: '50%',
    background: C.accent, cursor: 'ew-resize', touchAction: 'none',
    zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    top: '50%', transform: 'translate(-50%, -50%)',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', borderBottom: `1px solid ${C.border}`, padding: '0 20px', flexShrink: 0 }}>
      {TABS.map(tab => (
        <button key={tab} onClick={() => onChange(tab)} style={{
          padding: '10px 18px', background: 'transparent', border: 'none',
          borderBottom: active === tab ? `2px solid ${C.accent}` : '2px solid transparent',
          color: active === tab ? '#111' : C.muted,
          fontSize: 13, fontWeight: active === tab ? 700 : 400,
          cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
        }}>{tab}</button>
      ))}
      {active === 'Requests' && yearA !== null && yearB !== null && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 12 }}>
          <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Year</span>
          {[yearA, yearB].map(y => (
            <button key={y} onClick={() => onRequestYearChange(y)} style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 4,
              border: `1px solid ${requestYear === y ? C.accent : C.border}`,
              background: requestYear === y ? C.accent : '#FFF',
              color: requestYear === y ? '#FFF' : '#555',
            }}>{y}</button>
          ))}
        </div>
      )}
      {active === 'Hire Status' && n > 0 && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 24, paddingLeft: 12, paddingRight: 0, paddingBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em', textTransform: 'uppercase', paddingBottom: 3 }}>Select year</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 320 }}>
            {/* Year labels — compact, sit above track */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 6, paddingRight: 6 }}>
              {availableYears.map((y) => (
                <span key={y} style={{ fontSize: 9, color: C.muted, fontWeight: 500, lineHeight: 1 }}>
                  {String(y).slice(2)}
                </span>
              ))}
            </div>
            {/* Dual-handle track */}
            <div ref={trackRef} style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: '#E0E3E8', borderRadius: 2 }} />
              <div style={{
                position: 'absolute',
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`,
                height: 3, background: C.accent, borderRadius: 2,
              }} />
              <div {...makeHandle('start')} style={{ ...HANDLE, left: `${startPct}%`, width: 12, height: 12 }} />
              <div {...makeHandle('end')}   style={{ ...HANDLE, left: `${endPct}%`, width: 12, height: 12 }} />
            </div>
          </div>
          <button onClick={() => onYearRangeChange(null)} style={{
            padding: '2px 9px', fontSize: 9, fontWeight: 700, flexShrink: 0, marginLeft: 6,
            background: yearRange === null ? C.accent : '#F3F4F6',
            color: yearRange === null ? '#FFF' : C.muted,
            border: 'none', borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
            textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 3,
          }}>All</button>
          {regionNamesAll.length > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 16, borderLeft: `1px solid ${C.border}`, paddingBottom: 3 }}>
              <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Region</span>
              <button onClick={() => setHireMenuOpen(o => !o)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#FFF', color: '#333', cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                {hireStatusRegions.length === 0 ? 'All' : hireStatusRegions.length === 1 ? hireStatusRegions[0] : `${hireStatusRegions.length} regions`}
                <span style={{ fontSize: 9, color: C.muted }}>▾</span>
              </button>
              {hireMenuOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, padding: '6px 0' }}
                  onMouseLeave={() => setHireMenuOpen(false)}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F6FA'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <input type="checkbox" checked={hireStatusRegions.length === 0} onChange={() => onHireStatusRegionsChange([])} style={{ cursor: 'pointer' }} />
                    All regions
                  </label>
                  <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                  {regionNamesAll.map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F6FA'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <input type="checkbox" checked={hireStatusRegions.includes(r)} onChange={() => onHireStatusRegionsChange(hireStatusRegions.includes(r) ? hireStatusRegions.filter(x => x !== r) : [...hireStatusRegions, r])} style={{ cursor: 'pointer' }} />
                      {r}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {active === 'Onboarding' && n > 0 && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 24, paddingLeft: 12, paddingRight: 0, paddingBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em', textTransform: 'uppercase', paddingBottom: 3 }}>Select year</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 6, paddingRight: 6 }}>
              {availableYears.map((y) => (
                <span key={y} style={{ fontSize: 9, color: C.muted, fontWeight: 500, lineHeight: 1 }}>
                  {String(y).slice(2)}
                </span>
              ))}
            </div>
            <div ref={onbTrackRef} style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: '#E0E3E8', borderRadius: 2 }} />
              <div style={{
                position: 'absolute',
                left: `${onbStartPct}%`,
                width: `${Math.max(0, onbEndPct - onbStartPct)}%`,
                height: 3, background: C.accent, borderRadius: 2,
              }} />
              <div {...makeOnbHandle('start')} style={{ ...HANDLE, left: `${onbStartPct}%`, width: 12, height: 12 }} />
              <div {...makeOnbHandle('end')}   style={{ ...HANDLE, left: `${onbEndPct}%`, width: 12, height: 12 }} />
            </div>
          </div>
          <button onClick={() => onOnboardingYearRangeChange(null)} style={{
            padding: '2px 9px', fontSize: 9, fontWeight: 700, flexShrink: 0, marginLeft: 6,
            background: onboardingYearRange === null ? C.accent : '#F3F4F6',
            color: onboardingYearRange === null ? '#FFF' : C.muted,
            border: 'none', borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
            textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 3,
          }}>All</button>
          {regionNamesAll.length > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 16, borderLeft: `1px solid ${C.border}`, paddingBottom: 3 }}>
              <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Region</span>
              <button onClick={() => setOnbMenuOpen(o => !o)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#FFF', color: '#333', cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                {onboardingRegions.length === 0 ? 'All' : onboardingRegions.length === 1 ? onboardingRegions[0] : `${onboardingRegions.length} regions`}
                <span style={{ fontSize: 9, color: C.muted }}>▾</span>
              </button>
              {onbMenuOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, padding: '6px 0' }}
                  onMouseLeave={() => setOnbMenuOpen(false)}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F6FA'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <input type="checkbox" checked={onboardingRegions.length === 0} onChange={() => onOnboardingRegionsChange([])} style={{ cursor: 'pointer' }} />
                    All regions
                  </label>
                  <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                  {regionNamesAll.map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F6FA'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <input type="checkbox" checked={onboardingRegions.includes(r)} onChange={() => onOnboardingRegionsChange(onboardingRegions.includes(r) ? onboardingRegions.filter(x => x !== r) : [...onboardingRegions, r])} style={{ cursor: 'pointer' }} />
                      {r}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
  projectTrend: { year: number; status: string; count: number; power_kw: number }[];
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

  // MW year-on-year by status
  const mwTrendData = TREND_YEARS.map(y => {
    const rows = projectTrend.filter(r => r.year === y);
    return {
      year:     String(y),
      Approved: +((rows.find(r => r.status === 'Approved')?.power_kw ?? 0) / 1000).toFixed(3),
      Seeded:   +((rows.find(r => r.status === 'Seeded')?.power_kw   ?? 0) / 1000).toFixed(3),
      Proposed: +((rows.find(r => r.status === 'Proposed')?.power_kw ?? 0) / 1000).toFixed(3),
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
        <ResponsiveContainer width="100%" height={pipView === 'country' ? 420 : 240}>
          <BarChart data={activeBarData} margin={{ top: 22, right: 8, bottom: pipView === 'country' ? 75 : 0, left: -30 }} barCategoryGap={pipView === 'country' ? '18%' : '28%'}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis dataKey="region" interval={0} tickLine={false}
              tick={{ fontSize: pipView === 'country' ? 11 : 9, fill: C.muted,
                      ...(pipView === 'country' ? { angle: -45, textAnchor: 'end' } : {}) }}
              height={pipView === 'country' ? 70 : 30} />
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

      {/* Pipeline table + MW trend — side by side */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>

      {/* Pipeline table */}
      <div style={{ ...cardStyle, overflow: 'hidden', flex: '0 0 58%', minWidth: 0 }}>
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
                    <th style={{ ...TH, minWidth: 110, textAlign: 'left' }}>Region</th>
                    {displayRegions.map(rn => (
                      <th key={rn} style={{ ...THR, minWidth: 54 }}>{rc(rn)}</th>
                    ))}
                    <th style={{ ...THR, fontWeight: 800, minWidth: 58 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rowDefs.map((rd, rowIdx) => {
                    const isType  = rd.level === 'type';
                    const isTotal = rd.level === 'total';
                    const rowTotal = data.pipeline.reduce((s, p) => s + rd.getValue(p), 0);
                    return (
                      <tr key={rowIdx} style={{
                        background: isTotal ? '#F5F5F5' : isType ? '#FAFAFA' : '#FFF',
                        borderTop: rd.borderTop || isTotal ? `2px solid ${C.border}` : undefined,
                      }}>
                        <td style={{ ...TD, fontWeight: isType || isTotal ? 700 : 400, color: rd.color, paddingLeft: rd.level === 'status' ? 24 : 10, fontSize: 11 }}>
                          {rd.label}
                        </td>
                        {displayRegions.map(rn => {
                          const pr  = data.pipeline.find(p => p.region_name === rn);
                          const val = rd.getValue(pr);
                          return (
                            <td key={rn} style={{ ...TDM, color: val > 0 ? rd.color : '#DDD', fontWeight: isTotal || isType ? 700 : 400, fontSize: 11 }}>
                              {fmtW(val)}
                            </td>
                          );
                        })}
                        <td style={{ ...TDR, color: rowTotal > 0 ? rd.color : '#DDD', fontWeight: isTotal ? 800 : isType ? 700 : 600, fontSize: 11 }}>
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

      {/* MW YoY by status line chart */}
      <div style={{ ...cardStyle, flex: 1, minWidth: 260, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
        <SectionTitle>Power MW YoY by Status</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={mwTrendData} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false}
              tickFormatter={(v: number) => v === 0 ? '0' : `${v.toFixed(1)}`} width={36} />
            <Tooltip
              formatter={(v: unknown, name: any) => [`${Number(v).toFixed(3)} MW`, name]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${C.border}` }}
            />
            <Line type="monotone" dataKey="Approved" stroke={C.approved} strokeWidth={2.5}
              dot={{ r: 4, fill: C.approved, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="Seeded"   stroke={C.seeded}   strokeWidth={2.5}
              dot={{ r: 4, fill: C.seeded,   strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="Proposed" stroke={C.proposed} strokeWidth={2.5}
              dot={{ r: 4, fill: C.proposed, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, justifyContent: 'center' }}>
          {([['Approved', C.approved], ['Seeded', C.seeded], ['Proposed', C.proposed]] as [string, string][]).map(([l, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 3, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      </div>{/* end pipeline + MW row */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
          {[
            { label: 'Exist VP/Dir',   vA: dataA.headcount.reduce((s,r)=>s+r.exist_vp_dir,0), vB: dataB.headcount.reduce((s,r)=>s+r.exist_vp_dir,0), color: C.vpDir   },
            { label: 'Exist FTE',      vA: dataA.headcount.reduce((s,r)=>s+r.exist_fte,0),     vB: dataB.headcount.reduce((s,r)=>s+r.exist_fte,0),     color: C.fte     },
            { label: 'Contingent',     vA: dataA.headcount.reduce((s,r)=>s+r.exist_con,0),     vB: dataB.headcount.reduce((s,r)=>s+r.exist_con,0),     color: C.con     },
            { label: 'Approved FTE',   vA: dataA.headcount.reduce((s,r)=>s+r.appr_fte,0),      vB: dataB.headcount.reduce((s,r)=>s+r.appr_fte,0),      color: C.apprFte },
            { label: 'Requested FTE',  vA: dataA.headcount.reduce((s,r)=>s+r.req_fte,0),       vB: dataB.headcount.reduce((s,r)=>s+r.req_fte,0),       color: C.reqFte  },
            { label: 'Req Contractor', vA: dataA.headcount.reduce((s,r)=>s+r.req_con,0),       vB: dataB.headcount.reduce((s,r)=>s+r.req_con,0),       color: C.reqCon  },
            { label: 'Total Heads',    vA: totalA,                                              vB: totalB,                                              color: '#111'    },
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

function RequestsTab({ yearA, yearB, dataA, dataB, regionCodeMap, activeYear }: { yearA: number; yearB: number; dataA: HubIqYearData; dataB: HubIqYearData; regionCodeMap: Record<string, string>; activeYear: number }) {
  const rc = (name: string) => regionCodeMap[name] || name;
  const data = activeYear === yearA ? dataA : dataB;
  const [levels, setLevels] = useState<Level[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  useEffect(() => { refDataApi.levels().then(setLevels).catch(() => {}); }, []);
  useEffect(() => { refDataApi.disciplines().then(setDisciplines).catch(() => {}); }, []);
  const discCodeMap = Object.fromEntries(disciplines.map(d => [d.name, d.code ?? d.name]));

  // Aggregate requests by discipline — pre-populate all known disciplines as zero placeholders
  const byDisc: Record<string, { rFte: number; rCon: number }> = {};
  for (const disc of Object.keys(C.discColors)) byDisc[disc] = { rFte: 0, rCon: 0 };
  for (const r of data.requests) {
    if (!byDisc[r.discipline_name]) byDisc[r.discipline_name] = { rFte: 0, rCon: 0 };
    if (r.contract_code === 'R FTE')     byDisc[r.discipline_name].rFte += r.contracted_fte;
    else if (['R CON', 'R CON>FTE'].includes(r.contract_code)) byDisc[r.discipline_name].rCon += r.contracted_fte;
  }
  const discBarData = Object.entries(byDisc).map(([disc, v]) => ({
    discipline: discCodeMap[disc] ?? disc,
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
  const DISC_PIE_FALLBACK = ['#086AE3','#33A85C','#FDB90D','#00737A','#8B93A3'];
  const discPieColor = (name: string, i: number) => C.discColors[name] ?? DISC_PIE_FALLBACK[i % DISC_PIE_FALLBACK.length];

  // Aggregate requests by level for both years — senior→junior order (level_number DESC)
  const CANONICAL_LEVELS = ['VP', 'Senior Director', 'Director', 'Senior Manager', 'Manager', 'Intern', 'Cons', 'Contingent'];
  const sortedLevels = [...levels]
    .filter(l => CANONICAL_LEVELS.some(c => l.level_name.toLowerCase() === c.toLowerCase()))
    .sort((a, b) => (b.level_number ?? -1) - (a.level_number ?? -1));
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

  // Aggregate requests by region — pre-populate all known regions as zero placeholders
  const regionReqAgg: Record<string, number> = {};
  for (const code of Array.from(new Set(Object.values(regionCodeMap))).sort()) regionReqAgg[code] = 0;
  for (const r of data.requests) {
    const code = rc(r.region_name) || r.region_name;
    regionReqAgg[code] = (regionReqAgg[code] ?? 0) + r.contracted_fte;
  }
  const regionReqData = Object.entries(regionReqAgg)
    .map(([region, count]) => ({ region, count: Math.round(count * 10) / 10 }))
    .sort((a, b) => regionSortIdx(a.region) - regionSortIdx(b.region));

  // ── YoY delta by discipline ──
  const aggDiscYear = (reqs: HubIqYearData['requests']) => {
    const m: Record<string, number> = {};
    for (const r of reqs) m[r.discipline_name] = (m[r.discipline_name] ?? 0) + r.contracted_fte;
    return m;
  };
  const discMapA = aggDiscYear(dataA.requests);
  const discMapB = aggDiscYear(dataB.requests);
  const deltaData = Array.from(new Set([...Object.keys(discMapA), ...Object.keys(discMapB)]))
    .map(disc => {
      const a = Math.round((discMapA[disc] ?? 0) * 10) / 10;
      const b = Math.round((discMapB[disc] ?? 0) * 10) / 10;
      const delta = Math.round((b - a) * 10) / 10;
      return { disc: discCodeMap[disc] ?? disc, fullName: disc, delta, ftePrior: a, fteCurrent: b };
    })
    .filter(d => d.ftePrior > 0 || d.fteCurrent > 0)
    .sort((a, b) => b.delta - a.delta);

  // ── Discipline × Level heatmap ──
  const hmLevels: string[] = sortedLevels.length > 0
    ? sortedLevels.map(l => l.short_code).filter(lc => data.requests.some(r => r.level_code === lc))
    : Array.from(new Set(data.requests.map(r => r.level_code).filter((l): l is string => !!l)));
  if (data.requests.some(r => !r.level_code) && !hmLevels.includes('Unknown')) hmLevels.push('Unknown');
  const hmDiscs = Object.keys(byDisc).filter(d => data.requests.some(r => r.discipline_name === d));
  const hmCells: Record<string, Record<string, number>> = {};
  for (const req of data.requests) {
    const d = req.discipline_name; const l = req.level_code ?? 'Unknown';
    if (!hmCells[d]) hmCells[d] = {};
    hmCells[d][l] = (hmCells[d][l] ?? 0) + req.contracted_fte;
  }
  const hmMax = Math.max(...hmDiscs.flatMap(d => hmLevels.map(l => hmCells[d]?.[l] ?? 0)), 1);
  const hmCellBg = (v: number) => {
    if (v === 0) return '#F3F4F6';
    const t = v / hmMax;
    if (t < 0.15) return '#EBF3FF';
    if (t < 0.35) return '#BFDBFE';
    if (t < 0.60) return '#60A5FA';
    if (t < 0.80) return '#086AE3';
    return '#00408C';
  };
  const hmCellFg = (v: number) => v / hmMax > 0.35 ? '#FFFFFF' : '#1E3A5F';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 14 }}>

        {/* Bar: by discipline */}
        <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 10 }}>
            <SectionTitle>Requests by Discipline</SectionTitle>
          </div>
          {totalRFte === 0 && totalRCon === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No requests</div>
          ) : (
            <div style={{ flex: 1, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={discBarData} margin={{ top: 4, right: 6, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="discipline" tickLine={false} tick={(props: any) => (
                  <text x={props.x} y={props.y + 10} textAnchor="middle" fontSize={9} fill={C.muted}>{props.payload.value}</text>
                )} />
                <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="R FTE" stackId="s" radius={[0, 0, 0, 0]}>
                  {discBarData.map((entry, i) => (
                    <Cell key={i} fill={C.discColors[entry.fullName] ?? DISC_PIE_FALLBACK[i % DISC_PIE_FALLBACK.length]} />
                  ))}
                  <LabelList dataKey="R FTE" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: unknown) => (typeof v === 'number' && v > 0) ? v : ''} />
                </Bar>
                <Bar dataKey="R CON/CON→FTE" stackId="s" radius={[2, 2, 0, 0]}>
                  {discBarData.map((entry, i) => (
                    <Cell key={i} fill={C.discColors[entry.fullName] ?? DISC_PIE_FALLBACK[i % DISC_PIE_FALLBACK.length]} fillOpacity={0.5} />
                  ))}
                  <LabelList dataKey="R CON/CON→FTE" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: unknown) => (typeof v === 'number' && v > 0) ? v : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Donut: distribution */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <SectionTitle>Distribution by Discipline</SectionTitle>
          {/* KPI chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, background: '#FFE4E6', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#111', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>R FTE</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111', lineHeight: 1 }}>{totalRFte.toFixed(1)}</div>
            </div>
            <div style={{ flex: 1, background: '#FFFDE7', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#111', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>R CON</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111', lineHeight: 1 }}>{totalRCon.toFixed(1)}</div>
            </div>
          </div>
          {donutData.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No requests</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={40} outerRadius={65} paddingAngle={2}
                    startAngle={45} endAngle={45 + 360}
                    label={((props: any) => (
                      <text x={props.x} y={props.y} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={800} fill={C.discColors[props.name] ?? '#333'}>
                        {`${Math.round((props.percent ?? 0) * 100)}%`}
                      </text>
                    )) as any}
                    labelLine={false}>
                    {donutData.map((d, i) => <Cell key={i} fill={discPieColor(d.name, i)} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)) + ' FTE'} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {donutData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: discPieColor(d.name, i), flexShrink: 0 }} />
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
          <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.border}` }}>
            <SectionTitle>Request Details by Discipline / Region / Level / Type</SectionTitle>
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

      {/* Bottom row: Requests by Level + Requests by Region */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14 }}>

        {/* Line chart: requests by level */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={sectionLabel}>Requests by Level</div>
          </div>
          {levelLineData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>Loading levels…</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={levelLineData} margin={{ top: 20, right: 24, bottom: 4, left: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="level" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis hide />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)) as any} />
                {activeYear === yearA && (
                  <Line type="monotone" dataKey={yearA} name={String(yearA)} stroke={C.seeded} strokeWidth={3} dot={false} activeDot={false}
                    label={((p: any) => {
                      if (typeof p.value !== 'number' || p.value < 1) return <g />;
                      return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill={C.seeded} fontWeight={700}>{p.value}</text>;
                    }) as any} />
                )}
                {activeYear === yearB && (
                  <Line type="monotone" dataKey={yearB} name={String(yearB)} stroke={C.retail} strokeWidth={3} dot={false} activeDot={false}
                    label={((p: any) => {
                      if (typeof p.value !== 'number' || p.value < 1) return <g />;
                      return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill={C.retail} fontWeight={700}>{p.value}</text>;
                    }) as any} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Horizontal bar: requests by region */}
        <div style={{ ...cardStyle, padding: '14px 10px 14px 16px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={sectionLabel}>Requests by Region</div>
          </div>
          {regionReqData.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No requests</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, regionReqData.length * 32)}>
              <BarChart data={regionReqData} layout="vertical" margin={{ top: 2, right: 14, bottom: 2, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="region" width={90} axisLine={false} tickLine={false}
                  tick={(props: any) => (
                    <text x={props.x - 4} y={props.y} dy={4} textAnchor="end" fill="#444" fontSize={10} fontWeight={600}>
                      {props.payload.value}
                    </text>
                  )} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v} FTE`, 'Requests']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} fill="#086AE3">
                  {regionReqData.map((entry, i) => {
                    const palette = ['#086AE3','#00408C','#411980','#00737A','#33A85C','#FDB90D','#E91C24','#841A5B'];
                    return <Cell key={i} fill={entry.count > 0 ? palette[i % palette.length] : '#EAECF0'} />;
                  })}
                  <LabelList dataKey="count" position="insideRight" style={{ fontSize: 10, fill: '#FFFFFF', fontWeight: 700 }} formatter={(v: any) => (v > 0 ? String(v) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

      {/* ── Row 3: Year-on-Year Change ── */}
      <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 8 }}>
          <SectionTitle>Year-on-Year Change by Discipline</SectionTitle>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{yearA} → {yearB} · FTE delta per discipline</div>
        </div>
        {deltaData.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No data for both years</div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deltaData} margin={{ top: 20, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="disc" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} axisLine={false} tickLine={false} width={26} />
                <ReferenceLine y={0} stroke="#CBD5E1" strokeWidth={1} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => [`${typeof v === 'number' && v > 0 ? '+' : ''}${v} FTE`, `${yearA} → ${yearB}`]} />
                <Bar dataKey="delta" radius={[2, 2, 0, 0]} maxBarSize={36}>
                  {deltaData.map((entry, i) => <Cell key={i} fill={entry.delta >= 0 ? '#33A85C' : '#E91C24'} />)}
                  <LabelList dataKey="delta" content={((props: any) => {
                    const { x, y, width, height, value } = props;
                    if (typeof value !== 'number' || value === 0) return <g />;
                    const isNeg = value < 0;
                    return (
                      <text x={x + (width ?? 0) / 2} y={isNeg ? y + Math.abs(height ?? 0) + 12 : y - 5} textAnchor="middle" fontSize={9} fontWeight={700} fill={isNeg ? '#E91C24' : '#059669'}>
                        {value > 0 ? '+' : ''}{value}
                      </text>
                    );
                  }) as any} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
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

function BulletBar({ x, y, width, height, payload, fill, labelColor }: any) {
  if (!payload || payload.Max <= 0 || height <= 0) return <g />;
  const bottom    = y + height;
  const ppu       = height / payload.Max;
  const minH      = Math.max((payload.Min ?? 0) * ppu, 0);
  const propY     = Math.min(bottom, Math.max(y, bottom - (payload.Proposed ?? 0) * ppu));
  const bw        = Math.max(width - 2, 6);
  const cx        = x + width / 2;
  const maxW      = Math.round(bw * 0.52);
  const markerW   = Math.round(bw * 0.62);
  const markerH   = 16;
  const darkColor = labelColor ?? fill;
  return (
    <g>
      {/* Min — wide, faded */}
      <rect x={cx - bw / 2}      y={bottom - minH}       width={bw}      height={Math.max(minH, 0)} fill={`${fill}35`} rx={2} />
      {/* Max — narrower */}
      <rect x={cx - maxW / 2}    y={y}                   width={maxW}    height={height}            fill={`${fill}80`} rx={2} />
      {/* Proposed — red marker */}
      <rect x={cx - markerW / 2} y={propY - markerH / 2} width={markerW} height={markerH}           fill="#E91C24"     rx={1} />

      {/* Min label — bottom-centre of min bar, white */}
      {payload.Min > 0 && minH > 16 && (
        <text x={cx} y={bottom - 5} textAnchor="middle" dominantBaseline="auto" fontSize={10} fill="#FFF" fontWeight={700}>
          {payload.Min}
        </text>
      )}

      {/* Proposed label — white, centred on marker */}
      {payload.Proposed > 0 && (
        <text x={cx} y={propY} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#FFF" fontWeight={700}>
          {payload.Proposed}
        </text>
      )}

      {/* Max label — inside max bar at the top, dark discipline colour */}
      {payload.Max > 0 && (
        <text x={cx} y={y + 13} textAnchor="middle" dominantBaseline="auto" fontSize={10} fill={darkColor} fontWeight={700}>
          {payload.Max}
        </text>
      )}
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

      {/* 4 discipline cards — table left, chart right */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              {/* Discipline header — full width */}
              <div style={{ padding: '10px 16px', borderTop: `3px solid ${color}`, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: labelColor }}>{disc.discipline}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.muted }}>Proposed: <strong style={{ color: '#111' }}>{disc.totals.proposed}</strong></span>
                  <span style={{ fontSize: 11, color: C.muted }}>Optimal: <strong style={{ color: '#111' }}>{disc.totals.optimal}</strong></span>
                  <span style={{ fontSize: 11, background: `${color}22`, color: labelColor, padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                    Var–Opt: <PctBadge pct={disc.totals.variance_pct} />
                  </span>
                </div>
              </div>

              {/* Body: table left + chart right */}
              <div style={{ display: 'flex', alignItems: 'stretch' }}>

                {/* Table — left panel, width aligned to end of 2nd KPI tile (2/5 = 40%) */}
                <div style={{ flex: '0 0 40%', overflowX: 'auto', borderRight: `1px solid ${C.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, minWidth: 88, fontSize: 9 }}>Region</th>
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

                {/* Chart — right panel, fills remaining width */}
                {allRegions.length > 0 && (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '12px 12px 6px' }}>
                    <div style={{ flex: 1, position: 'relative', minHeight: 220 }}>
                      <div style={{ position: 'absolute', inset: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barData} margin={{ top: 10, right: 8, bottom: 20, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                            <XAxis dataKey="region" tick={{ fontSize: 9, fill: C.muted }} angle={-20} textAnchor="end" interval={0} />
                            <YAxis hide width={0} domain={[0, 'auto']} />
                            <Tooltip content={<BulletTooltip />} />
                            <Bar dataKey="Max" fill={color} shape={(props: any) => <BulletBar {...props} labelColor={labelColor} />} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', paddingTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 9, borderRadius: 2, background: `${color}35` }} />
                        <span style={{ fontSize: 10, color: C.muted }}>Min</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 2, background: `${color}80` }} />
                        <span style={{ fontSize: 10, color: C.muted }}>Max</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 14, height: 3, borderRadius: 1, background: C.accent }} />
                        <span style={{ fontSize: 10, color: C.muted }}>Proposed</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: month / quarter toggle button
// ---------------------------------------------------------------------------

function ViewToggle({ view, onChange }: { view: 'month' | 'quarter'; onChange: (v: 'month' | 'quarter') => void }) {
  return (
    <div style={{ display: 'flex', background: '#F0F1F3', borderRadius: 6, padding: 2, gap: 1 }}>
      {(['month', 'quarter'] as const).map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '2px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700,
          background: view === v ? '#FFF' : 'transparent',
          color: view === v ? '#374151' : '#9CA3AF',
          boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.10)' : 'none',
          transition: 'background 0.15s',
        }}>
          {v === 'month' ? 'Month' : 'Qtr'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HIRE STATUS TAB
// ---------------------------------------------------------------------------

function HireStatusTab({ tbhStatus, tbhAvgHireDays, tbhQuarterlyAvgHireDays, tbhMonthlyAvgHireDays, tbhHireType, tbhOverdue, tbhMonthlyForecast, tbhJobProfile, tbhDiscRegion, yearRange, regionCodeMap, regionNamesAll, selectedRegions }: {
  yearA: number; yearB: number;
  tbhStatus: { req_status: string; count: number; funding_year: number; region_name?: string | null }[];
  tbhAvgHireDays: Record<string, Record<string, number>>;
  tbhQuarterlyAvgHireDays: { year: number; quarter: number; label: string; days: number; count: number }[];
  tbhMonthlyAvgHireDays: { year: number; month: number; label: string; days: number; count: number }[];
  tbhHireType: { hire_type: string; count: number; funding_year: number; region_name?: string | null }[];
  tbhOverdue: { tbh_id: string; req_status: string | null; hire_type: string | null; region_name: string | null; estimated_hire_date: string; days_overdue: number; funding_year: number | null; date_opened: string | null }[];
  tbhMonthlyForecast: { month: string; count: number; funding_year: number; hire_type: string; region_name?: string | null }[];
  tbhJobProfile: { job_profile: string; count: number; funding_year: number; region_name?: string | null }[];
  tbhDiscRegion: HubIqTbhDiscRegion[];
  yearRange: [number, number] | null;
  regionCodeMap: Record<string, string>;
  regionNamesAll: string[];
  selectedRegions: string[];
}) {
  const [hireView, setHireView] = useState<'month' | 'quarter'>('quarter');
  const [forecastView, setForecastView] = useState<'month' | 'quarter'>('month');

  const STAGE_COLORS: Record<string, string> = {
    'Filled': '#E91C24', 'Open': '#C71B36', 'In Progress': '#A61B49',
    'Offer Extended': '#841A5B', 'On Hold': '#631A6E', 'Cancelled': '#411980', 'Not Raised': '#8B93A3',
  };
  const HIRE_TYPE_COLORS: Record<string, string> = {
    'Net New': '#E91C24', 'Conversion': '#841A5B', 'Backfill': '#411980', 'Not Set': '#8B93A3',
  };
  const GRAD: string[] = ['#E91C24','#D4193B','#BF1852','#A61B49','#8E1A5A','#841A5B','#6E1A67','#631A6E','#4E1878','#411980'];

  const filterYear = (rows: { funding_year: number }[]) =>
    yearRange === null ? rows : rows.filter(r => r.funding_year >= yearRange[0] && r.funding_year <= yearRange[1]);

  const filterRegion = <T extends { region_name?: string | null }>(rows: T[]): T[] =>
    selectedRegions.length === 0 ? rows : rows.filter(r => selectedRegions.includes(r.region_name ?? 'Unknown'));

  const avgHireDays: Record<string, number> =
    yearRange === null ? (tbhAvgHireDays['all'] ?? {})
    : yearRange[0] === yearRange[1] ? (tbhAvgHireDays[String(yearRange[0])] ?? tbhAvgHireDays['all'] ?? {})
    : (tbhAvgHireDays['all'] ?? {});

  const filteredStatus   = filterYear(filterRegion(tbhStatus)       as typeof tbhStatus)       as typeof tbhStatus;
  const filteredHireType = filterYear(filterRegion(tbhHireType)     as typeof tbhHireType)     as typeof tbhHireType;
  // Overdue and forecast are time-based views — backend already scopes by date, don't filter by year range
  const filteredOverdue  = filterRegion(tbhOverdue)  as typeof tbhOverdue;
  const filteredForecast = filterRegion(tbhMonthlyForecast) as typeof tbhMonthlyForecast;
  const filteredJobProfileRaw = filterYear(filterRegion(tbhJobProfile) as typeof tbhJobProfile) as typeof tbhJobProfile;
  const filteredDiscRegion    = filterYear(filterRegion(tbhDiscRegion) as typeof tbhDiscRegion) as typeof tbhDiscRegion;

  // Re-aggregate after year filter (multiple rows per status/profile when all years)
  const statusAgg: Record<string, number> = {};
  for (const r of filteredStatus) statusAgg[r.req_status] = (statusAgg[r.req_status] ?? 0) + r.count;
  const hireTypeAgg: Record<string, number> = {};
  for (const r of filteredHireType) hireTypeAgg[r.hire_type] = (hireTypeAgg[r.hire_type] ?? 0) + r.count;
  const jobProfileAgg: Record<string, number> = {};
  for (const r of filteredJobProfileRaw) jobProfileAgg[r.job_profile] = (jobProfileAgg[r.job_profile] ?? 0) + r.count;
  const forecastByCategory: Record<string, { Growth: number; Conversion: number; Replacement: number }> = {};
  for (const r of filteredForecast) {
    if (!forecastByCategory[r.month]) forecastByCategory[r.month] = { Growth: 0, Conversion: 0, Replacement: 0 };
    if (r.hire_type === 'Net New') forecastByCategory[r.month].Growth += r.count;
    else if (r.hire_type === 'Conversion') forecastByCategory[r.month].Conversion += r.count;
    else if (r.hire_type === 'Backfill') forecastByCategory[r.month].Replacement += r.count;
  }

  // Region aggregation: use DB code map + all known regions as placeholders
  const regionAgg: Record<string, number> = {};
  for (const r of filteredDiscRegion) {
    regionAgg[r.region_name] = (regionAgg[r.region_name] ?? 0) + r.count;
  }
  const codeToCount: Record<string, number> = {};
  for (const name of regionNamesAll) {
    const code = regionCodeMap[name] ?? name;
    if (codeToCount[code] === undefined) codeToCount[code] = 0;
  }
  for (const [name, count] of Object.entries(regionAgg)) {
    const code = name === 'Unknown' ? 'N/A' : (regionCodeMap[name] ?? name);
    codeToCount[code] = (codeToCount[code] ?? 0) + count;
  }
  const regionBarData = Object.entries(codeToCount)
    .map(([region_name, count]) => ({ region_name, count }))
    .sort((a, b) => regionSortIdx(a.region_name) - regionSortIdx(b.region_name));

  const sorted = Object.entries(statusAgg).map(([req_status, count]) => ({ req_status, count })).sort((a, b) => b.count - a.count);
  const hireTypeSorted = Object.entries(hireTypeAgg).map(([hire_type, count]) => ({ hire_type, count })).sort((a, b) => b.count - a.count);
  const jobProfileSorted = Object.entries(jobProfileAgg).map(([job_profile, count]) => ({ job_profile, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  const forecastSorted = Object.entries(forecastByCategory)
    .map(([month, v]) => ({ month, label: fmtMonth(month), Growth: v.Growth, Conversion: v.Conversion, Replacement: v.Replacement, total: v.Growth + v.Conversion + v.Replacement, dummy: 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const total = sorted.reduce((s, r) => s + r.count, 0);
  const overdueCount = filteredOverdue.length;
  const todayYM = new Date().toISOString().slice(0, 7);

  const avgFilledDays = Math.round(avgHireDays['Filled'] ?? 0);
  const hireTrendData = tbhQuarterlyAvgHireDays
    .filter(d => d.days > 0)
    .filter(d => yearRange === null || (d.year >= yearRange[0] && d.year <= yearRange[1]));

  const hireMonthData = tbhMonthlyAvgHireDays
    .filter(d => d.days > 0)
    .filter(d => yearRange === null || (d.year >= yearRange[0] && d.year <= yearRange[1]));

  const activeHireData: { label: string; days: number; count: number }[] =
    hireView === 'quarter' ? hireTrendData : hireMonthData;

  // Quarterly aggregation for the forecast chart
  const forecastQuarterly = (() => {
    const qBuckets: Record<string, { Growth: number; Conversion: number; Replacement: number; yr: number; q: number }> = {};
    for (const [month, v] of Object.entries(forecastByCategory)) {
      const [yrStr, moStr] = month.split('-');
      const yr = parseInt(yrStr, 10), mo = parseInt(moStr, 10);
      const q = Math.floor((mo - 1) / 3) + 1;
      const key = `${yr}-Q${q}`;
      if (!qBuckets[key]) qBuckets[key] = { Growth: 0, Conversion: 0, Replacement: 0, yr, q };
      qBuckets[key].Growth += v.Growth;
      qBuckets[key].Conversion += v.Conversion;
      qBuckets[key].Replacement += v.Replacement;
    }
    return Object.entries(qBuckets)
      .map(([k, v]) => ({ month: k, label: `Q${v.q} '${String(v.yr).slice(2)}`, Growth: v.Growth, Conversion: v.Conversion, Replacement: v.Replacement, total: v.Growth + v.Conversion + v.Replacement, dummy: 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));
  })();

  const activeForecastData = forecastView === 'month' ? forecastSorted : forecastQuarterly;


  function fmtDays(days: number | undefined): string {
    if (days === undefined) return '—';
    if (days < 30) return `${days}d`;
    return `~${Math.round(days / 30.4)}m`;
  }
  function fmtMonth(ym: string): string {
    const [y, m] = ym.split('-');
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]} '${y.slice(2)}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Row 1: Status bars + Hire Type donut + Region bars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.7fr 1.6fr', gap: 14 }}>

        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={sectionLabel}>TBH Roles by Hire Status</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Sorted by volume</div>
          </div>
          {(() => {
            const ALL_STATUSES = ['Filled', 'Open', 'In Progress', 'Offer Extended', 'On Hold', 'Cancelled', 'Not Raised'];
            const statusMap = Object.fromEntries(sorted.map(r => [r.req_status, r.count]));
            const allRows = [
              ...sorted,
              ...ALL_STATUSES.filter(s => statusMap[s] === undefined).map(s => ({ req_status: s, count: 0 })),
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {allRows.map(row => {
                  const barPct = row.count === 0 ? 0 : Math.max((row.count / (sorted[0]?.count || 1)) * 100, 2);
                  const color = STAGE_COLORS[row.req_status] ?? '#8B93A3';
                  const isEmpty = row.count === 0;
                  return (
                    <div key={row.req_status}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 10px', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: isEmpty ? C.muted : '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block', opacity: isEmpty ? 0.35 : 1 }} />
                          {row.req_status}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isEmpty ? C.muted : color, textAlign: 'right' }}>{row.count}</span>
                      </div>
                      <div style={{ height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden', marginLeft: 14 }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 2, opacity: isEmpty ? 0 : 1, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Total TBH Codes</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{total}</span>
          </div>
        </div>

        {/* Hire Type breakdown donut — centered */}
        <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ ...sectionLabel, textAlign: 'center', marginBottom: 10 }}>Hire Type Breakdown</div>
          {hireTypeSorted.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={hireTypeSorted.map(r => ({ name: r.hire_type, value: r.count }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={76} paddingAngle={2}
                    startAngle={45} endAngle={405}
                    label={(props: any) => (
                      <text x={props.x} y={props.y} textAnchor="middle" dominantBaseline="central"
                        fontSize={11} fontWeight={700} fill={HIRE_TYPE_COLORS[props.name] ?? '#555'}>
                        {`${Math.round((props.percent ?? 0) * 100)}%`}
                      </text>
                    )}
                    labelLine={false}>
                    {hireTypeSorted.map((r, i) => <Cell key={i} fill={HIRE_TYPE_COLORS[r.hire_type] ?? GRAD[i % GRAD.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v} roles`} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px 14px', marginTop: 30 }}>
                {hireTypeSorted.map((r, i) => (
                  <div key={r.hire_type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: HIRE_TYPE_COLORS[r.hire_type] ?? GRAD[i % GRAD.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: '#444' }}>{r.hire_type}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#111', marginLeft: 2 }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* TBH Hires by Region — horizontal bar chart */}
        <div style={{ ...cardStyle, padding: '14px 10px 14px 10px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={sectionLabel}>TBH Hires by Region</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Total TBH roles by region</div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, regionBarData.length * 30)}>
            <BarChart data={regionBarData} layout="vertical" margin={{ top: 2, right: 14, bottom: 2, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="region_name" width={92} axisLine={false} tickLine={false}
                tick={(props: any) => (
                  <text x={props.x - 4} y={props.y} dy={4} textAnchor="end" fill="#444" fontSize={10} fontWeight={600}>
                    {props.payload.value}
                  </text>
                )} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v} roles`, 'Total']} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {regionBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.count > 0 ? GRAD[Math.round(i * (GRAD.length - 1) / Math.max(regionBarData.length - 1, 1))] : '#EAECF0'} />
                ))}
                <LabelList dataKey="count" position="insideRight" style={{ fontSize: 11, fill: '#FFFFFF', fontWeight: 700 }} formatter={(v: any) => (v > 0 ? String(v) : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── Row 2: Avg Hire Time + Overdue tile ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3.3fr', gap: 14 }}>

        {/* Avg Hire Time card */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={sectionLabel}>Avg Hire Time</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Filled roles · from open to accepted</div>
            </div>
            <ViewToggle view={hireView} onChange={setHireView} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: avgFilledDays > 0 ? '#086AE3' : '#8B93A3' }}>
              {avgFilledDays > 0 ? avgFilledDays : '—'}
            </span>
            {avgFilledDays > 0 && <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>days</span>}
          </div>
          {avgFilledDays > 0 && (
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>
              ≈ {(avgFilledDays / 7).toFixed(1)} weeks to fill a role
            </div>
          )}
          {activeHireData.length >= 2 ? (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Avg days to fill · by {hireView === 'quarter' ? 'quarter' : 'month'}
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={activeHireData} margin={{ top: 18, right: 8, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v} days`, 'Avg hire time']} />
                  <Line type="monotone" dataKey="days" stroke="#086AE3" strokeWidth={2}
                    dot={{ r: 3, fill: '#086AE3' }} activeDot={{ r: 4 }}
                    label={((p: any) => {
                      if (typeof p.value !== 'number' || p.value <= 0) return <g />;
                      return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="#086AE3" fontWeight={700}>{p.value}d</text>;
                    }) as any}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : avgFilledDays === 0 ? (
            <div style={{ fontSize: 11, color: C.muted, paddingTop: 8 }}>No filled role data yet</div>
          ) : activeHireData.length < 2 ? (
            <div style={{ fontSize: 11, color: C.muted, paddingTop: 8 }}>Not enough {hireView} data points yet — try Qtr view</div>
          ) : null}
        </div>

        {/* Overdue tile */}
        <div style={{ ...cardStyle, padding: '14px 16px', ...(overdueCount > 0 ? { background: 'rgba(233,28,36,0.03)', borderColor: 'rgba(233,28,36,0.25)' } : {}) }}>
          <div style={{ marginBottom: 10 }}>
            <div style={sectionLabel}>Roles Overdue</div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left: big number + label */}
            <div style={{ flexShrink: 0, minWidth: 80 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: overdueCount > 0 ? '#E91C24' : '#8B93A3', lineHeight: 1, marginBottom: 6 }}>{overdueCount}</div>
              <div style={{ fontSize: 10, color: overdueCount > 0 ? '#C71B36' : C.muted, lineHeight: 1.4 }}>
                {overdueCount === 0 ? 'No overdue roles' : `role${overdueCount !== 1 ? 's' : ''} past estimated hire date`}
              </div>
            </div>
            {/* Right: full scrollable overdue table */}
            {overdueCount > 0 && (
              <div style={{ flex: 1, borderLeft: '1px solid rgba(233,28,36,0.18)', paddingLeft: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Overdue roles</div>
                <div style={{ overflowY: 'auto', maxHeight: 180, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#F7F8FA', zIndex: 1 }}>
                      <tr style={{ borderBottom: '2px solid #E0E3E8' }}>
                        {['TBH ID','Date Opened','Est. Hire Date','Status','Hire Type','Region','Overdue'].map(h => (
                          <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOverdue.map((r, i) => (
                        <tr key={r.tbh_id} style={{ background: i % 2 === 0 ? '#FFF' : '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#E91C24', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.tbh_id}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>{r.date_opened ?? '—'}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#333', whiteSpace: 'nowrap' }}>{r.estimated_hire_date}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#333', whiteSpace: 'nowrap' }}>{r.req_status ?? '—'}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#333', whiteSpace: 'nowrap' }}>{r.hire_type ?? '—'}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, color: '#333', whiteSpace: 'nowrap' }}>{r.region_name ?? '—'}</td>
                          <td style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#E91C24', whiteSpace: 'nowrap' }}>{r.days_overdue}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Hire Forecast ── */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={sectionLabel}>{forecastView === 'month' ? 'Monthly' : 'Quarterly'} Hire Forecast</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Unfilled roles by estimated hire {forecastView} · Growth (Net New) · Conversion · Replacement (Backfill)</div>
          </div>
          <ViewToggle view={forecastView} onChange={setForecastView} />
        </div>
        {activeForecastData.length === 0 ? (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>No forecast data — add estimated hire dates in Talent Acquisition</div>
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={activeForecastData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any, name: any) => name === 'dummy' || v === 0 ? [null] : [`${v} roles`, name]} />
              <Bar dataKey="Growth"      stackId="s" fill="#E91C24" radius={[0, 0, 3, 3]}>
                <LabelList position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? String(v) : ''} />
              </Bar>
              <Bar dataKey="Conversion"  stackId="s" fill="#841A5B">
                <LabelList position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? String(v) : ''} />
              </Bar>
              <Bar dataKey="Replacement" stackId="s" fill="#411980" radius={[3, 3, 0, 0]}>
                <LabelList position="center" style={{ fontSize: 10, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? String(v) : ''} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// ONBOARDING TAB
// ---------------------------------------------------------------------------

function OnboardingTab({ regionNamesAll = [], selectedRegions = [], yearRange = null }: { regionNamesAll?: string[]; selectedRegions?: string[]; yearRange?: [number, number] | null }) {
  const [rows, setRows] = useState<TbhCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [startersView, setStartersView] = useState<'month' | 'quarter'>('month');

  useEffect(() => {
    tbhCodesApi.list({ limit: 500 }).then(data => { setRows(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); };

  // Only rows with a confirmed start date, filtered by year range and region
  const allStarters = rows.filter(r => {
    if (!r.confirmed_start_date) return false;
    if (yearRange) {
      const yr = parseInt(r.confirmed_start_date.slice(0, 4), 10);
      return yr >= yearRange[0] && yr <= yearRange[1];
    }
    return true;
  });
  const starters = selectedRegions.length === 0 ? allStarters : allStarters.filter(r => selectedRegions.includes(r.region_name ?? 'Unknown'));

  // KPIs
  const thisMonthKey = todayStr.slice(0, 7);
  const startingThisMonth = starters.filter(r => r.confirmed_start_date!.startsWith(thisMonthKey)).length;
  const next30End = addDays(today, 30);
  const next90End = addDays(today, 90);
  const startingNext30 = starters.filter(r => r.confirmed_start_date! >= todayStr && r.confirmed_start_date! <= next30End).length;
  const startingNext90 = starters.filter(r => r.confirmed_start_date! >= todayStr && r.confirmed_start_date! <= next90End).length;
  const externalCount    = starters.filter(r => r.hire_source === 'External').length;
  const internalCount    = starters.filter(r => r.hire_source === 'Internal').length;
  const conversionCount  = starters.filter(r => r.hire_type === 'Conversion').length;

  // Monthly bar chart — next 6 months
  const monthlyData: { month: string; External: number; Internal: number; Conversion: number; Other: number }[] = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-GB', { month: 'short', year: '2-digit' });
    const bucket = starters.filter(r => r.confirmed_start_date!.startsWith(key));
    monthlyData.push({
      month: label,
      External:   bucket.filter(r => r.hire_source === 'External').length,
      Internal:   bucket.filter(r => r.hire_source === 'Internal').length,
      Conversion: bucket.filter(r => r.hire_type === 'Conversion').length,
      Other:      bucket.filter(r => !r.hire_source && r.hire_type !== 'Conversion').length,
    });
  }

  // Quarterly aggregation: current quarter + next 4
  const quarterlyData = (() => {
    const currentQtr = Math.floor(today.getMonth() / 3);
    return Array.from({ length: 5 }, (_, i) => {
      const qtrIdx = (currentQtr + i) % 4;
      const yearOffset = Math.floor((currentQtr + i) / 4);
      const yr = today.getFullYear() + yearOffset;
      const startMonth = qtrIdx * 3;
      const months = [0, 1, 2].map(offset => {
        const d = new Date(yr, startMonth + offset, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });
      const bucket = starters.filter(r => months.some(m => r.confirmed_start_date!.startsWith(m)));
      return {
        month: `Q${qtrIdx + 1} '${String(yr).slice(2)}`,
        External:   bucket.filter(r => r.hire_source === 'External').length,
        Internal:   bucket.filter(r => r.hire_source === 'Internal').length,
        Conversion: bucket.filter(r => r.hire_type === 'Conversion').length,
        Other:      bucket.filter(r => !r.hire_source && r.hire_type !== 'Conversion').length,
      };
    });
  })();

  const activeStartersData = startersView === 'month' ? monthlyData : quarterlyData;

  // Table sorted: upcoming starters (lowest days remaining) first, then past starters (most recent first)
  const tableRows = [...starters].sort((a, b) => {
    const da = daysUntil(a.confirmed_start_date!);
    const db = daysUntil(b.confirmed_start_date!);
    const aFuture = da >= 0;
    const bFuture = db >= 0;
    if (aFuture !== bFuture) return aFuture ? -1 : 1; // upcoming before past
    return aFuture ? da - db : db - da;               // upcoming: smallest days first; past: most recent first
  });

  function daysUntil(dateStr: string): number {
    return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  }

  function DaysChip({ d }: { d: number }) {
    const bg = d <= 7 ? '#FEE2E2' : d <= 14 ? '#FEF3C7' : d <= 30 ? '#E0F2FE' : '#F3F4F6';
    const color = d <= 7 ? '#B91C1C' : d <= 14 ? '#B45309' : d <= 30 ? '#0369A1' : '#6B7280';
    const label = d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? 'Today' : `${d}d`;
    return <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{label}</span>;
  }

  const cardStyle: React.CSSProperties = { background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 8 };
  const sL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 };
  const TH: React.CSSProperties = { padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', textAlign: 'left', borderBottom: '2px solid #E0E3E8', background: '#F7F8FA' };
  const TD_S: React.CSSProperties = { padding: '5px 10px', fontSize: 10, color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #F3F4F6' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading onboarding data…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Row 1 — KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Starting This Month', value: startingThisMonth, color: '#086AE3' },
          { label: 'Starting Next 30 Days', value: startingNext30, color: '#00737A' },
          { label: 'Starting Next 90 Days', value: startingNext90, color: '#411980' },
          { label: 'Total Confirmed Starters', value: starters.length, color: '#333' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={sL}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Row 2 — Monthly chart + source split */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 14 }}>

        {/* Starters by month */}
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={sL}>Confirmed Starters by {startersView === 'month' ? 'Month' : 'Quarter'}</div>
            <ViewToggle view={startersView} onChange={setStartersView} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>
            {startersView === 'month' ? 'Next 6 months' : 'Current + next 4 quarters'} · by hire source &amp; type
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activeStartersData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="External" stackId="s" fill="#086AE3" radius={[0,0,0,0]}>
                <LabelList dataKey="External" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} />
              </Bar>
              <Bar dataKey="Internal" stackId="s" fill="#411980" radius={[0,0,0,0]}>
                <LabelList dataKey="Internal" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} />
              </Bar>
              <Bar dataKey="Conversion" stackId="s" fill="#841A5B" radius={[0,0,0,0]}>
                <LabelList dataKey="Conversion" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} />
              </Bar>
              <Bar dataKey="Other" stackId="s" fill="#8B93A3" radius={[2,2,0,0]}>
                <LabelList dataKey="Other" position="center" style={{ fontSize: 9, fill: '#FFF', fontWeight: 700 }} formatter={(v: any) => v > 0 ? v : ''} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[['#086AE3','External'],['#411980','Internal'],['#841A5B','Conversion'],['#8B93A3','Other']].map(([col, lbl]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#555' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: col, display: 'inline-block' }} />
                {lbl}
              </div>
            ))}
          </div>
        </div>

        {/* Talent acquisition split */}
        <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={sL}>Talent Acquisition</div>
          {([['External', externalCount, '#086AE3'], ['Internal', internalCount, '#411980'], ['Conversion', conversionCount, '#841A5B']] as [string, number, string][]).map(([lbl, cnt, col]) => (
            <div key={lbl}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                <span style={{ color: '#374151', fontWeight: 600 }}>{lbl}</span>
                <span style={{ color: col, fontWeight: 700 }}>{cnt}</span>
              </div>
              <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, background: col, width: starters.length > 0 ? `${(cnt / starters.length) * 100}%` : '0%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3 — Upcoming starters table */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={sL}>Upcoming Starters</div>
          <span style={{ fontSize: 10, color: C.muted }}>{tableRows.length} confirmed start{tableRows.length !== 1 ? 's' : ''}</span>
        </div>
        {tableRows.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: C.muted, fontSize: 12 }}>No confirmed start dates on record</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  {['TBH ID','Final Candidate','Confirmed Start','Days','Region','Job Profile','Hire Type','Hire Source','Hire Source Details','Manager'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#FFF' : '#FAFAFA' }}>
                    <td style={{ ...TD_S, color: C.accent, fontWeight: 600 }}>{r.tbh_id}</td>
                    <td style={{ ...TD_S, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.candidate_name || '—'}</td>
                    <td style={TD_S}>{r.confirmed_start_date ? new Date(r.confirmed_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style={{ ...TD_S }}><DaysChip d={daysUntil(r.confirmed_start_date!)} /></td>
                    <td style={TD_S}>{r.region_name || '—'}</td>
                    <td style={{ ...TD_S, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.job_profile || '—'}</td>
                    <td style={TD_S}>{r.hire_type || '—'}</td>
                    <td style={TD_S}>
                      {r.hire_source ? (
                        <span style={{ background: r.hire_source === 'External' ? '#EBF3FF' : '#F0EDFF', color: r.hire_source === 'External' ? '#086AE3' : '#411980', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 7px' }}>{r.hire_source}</span>
                      ) : '—'}
                    </td>
                    <td style={{ ...TD_S, color: C.muted }}>{r.hire_source_details || '—'}</td>
                    <td style={TD_S}>{r.manager_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  const [hireYearRange, setHireYearRange] = useState<[number, number] | null>(null);
  const [onboardingYearRange, setOnboardingYearRange] = useState<[number, number] | null>(null);
  const [requestYear, setRequestYear] = useState<number | null>(null);
  const [hireStatusRegions, setHireStatusRegions] = useState<string[]>([]);
  const [onboardingRegions, setOnboardingRegions] = useState<string[]>([]);

  useEffect(() => {
    dashboardApi.planningYears()
      .then(rows => {
        const years = rows.map(r => r.year);
        setAvailableYears(years);
        setYearA(years[0] ?? 2026);
        setYearB(years[1] ?? years[0] ?? 2027);
        setRequestYear(years[0] ?? 2026);
      })
      .catch(() => { setYearA(2026); setYearB(2027); setRequestYear(2026); });
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

      {/* Planning cycle banner */}
      <PlanningCycleBanner />

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} availableYears={Array.from(new Set([2022,2023,2024,2025,2026,2027,2028,...(hubData?.available_years??[])])).sort((a,b)=>a-b)} yearRange={hireYearRange} onYearRangeChange={setHireYearRange} yearA={yearA} yearB={yearB} requestYear={requestYear ?? yearA} onRequestYearChange={setRequestYear} regionNamesAll={hubData?.region_names ?? []} hireStatusRegions={hireStatusRegions} onHireStatusRegionsChange={setHireStatusRegions} onboardingRegions={onboardingRegions} onOnboardingRegionsChange={setOnboardingRegions} onboardingYearRange={onboardingYearRange} onOnboardingYearRangeChange={setOnboardingYearRange} />

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
            {activeTab === 'Requests'    && <RequestsTab    yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} regionCodeMap={hubData?.region_code_map ?? {}} activeYear={requestYear ?? yearA!} />}
            {activeTab === 'Gearing'     && <GearingTab     yearA={yearA!} yearB={yearB!} dataA={dataA!} dataB={dataB!} regionNames={hubData?.region_names ?? []} regionCodeMap={hubData?.region_code_map ?? {}} />}
            {activeTab === 'Hire Status' && <HireStatusTab yearA={yearA!} yearB={yearB!} tbhStatus={hubData!.tbh_status} tbhAvgHireDays={hubData!.tbh_avg_hire_days ?? {}} tbhQuarterlyAvgHireDays={hubData!.tbh_quarterly_hire_days ?? []} tbhMonthlyAvgHireDays={hubData!.tbh_monthly_hire_days ?? []} tbhHireType={hubData!.tbh_hire_type ?? []} tbhOverdue={hubData!.tbh_overdue ?? []} tbhMonthlyForecast={hubData!.tbh_monthly_forecast ?? []} tbhJobProfile={hubData!.tbh_job_profile ?? []} tbhDiscRegion={hubData!.tbh_disc_region ?? []} yearRange={hireYearRange} regionCodeMap={hubData!.region_code_map ?? {}} regionNamesAll={hubData!.region_names ?? []} selectedRegions={hireStatusRegions} />}
            {activeTab === 'Onboarding' && <OnboardingTab regionNamesAll={hubData?.region_names ?? []} selectedRegions={onboardingRegions} yearRange={onboardingYearRange} />}
          </>
        )}
      </div>
    </div>
  );
}
