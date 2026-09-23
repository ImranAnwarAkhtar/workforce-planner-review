import React, { useEffect, useState, useMemo } from 'react';
import { peopleApi, projectsApi, gearingApi, refDataApi, Person, Region, Project, GearingConstant } from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';

const DISCIPLINES = ['Construction', 'Design', 'Commercial', 'Commissioning', 'Other'] as const;
type Disc = typeof DISCIPLINES[number];

const DISC_COLOUR: Record<string, { bg: string }> = {
  Construction:  { bg: '#1A4A7A' },
  Design:        { bg: '#6A2FA0' },
  Commercial:    { bg: '#0D7A4A' },
  Commissioning: { bg: '#C25A00' },
  Other:         { bg: '#3A3D42' },
};

interface Metrics {
  snr: number; fte: number; con: number;
  aFte: number; aCon: number;
  rFte: number; rCon: number;
}

const zero = (): Metrics => ({ snr: 0, fte: 0, con: 0, aFte: 0, aCon: 0, rFte: 0, rCon: 0 });

const addM = (a: Metrics, b: Metrics): Metrics => ({
  snr:  a.snr  + b.snr,  fte:  a.fte  + b.fte,  con:  a.con  + b.con,
  aFte: a.aFte + b.aFte, aCon: a.aCon + b.aCon,
  rFte: a.rFte + b.rFte, rCon: a.rCon + b.rCon,
});

function derive(m: Metrics) {
  const existing  = m.snr + m.fte + m.con + m.aFte + m.aCon;
  const requested = m.rFte + m.rCon;
  const total     = existing + requested;
  return {
    existing,
    requested,
    total,
    pctConExist: existing > 0 ? m.con / existing : 0,
    pctConTotal: total    > 0 ? m.con / total    : 0,
  };
}

function pct(v: number) { return v === 0 ? '—' : `${Math.round(v * 100)}%`; }

const TAG: React.CSSProperties = {
  display: 'inline-block', padding: '1px 6px', borderRadius: 3,
  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
  background: '#F0F0F0', color: '#555', border: '1px solid #DDD',
};

function classifyPerson(p: Person): keyof Metrics {
  const cc  = (p.contract_type_code ?? '').trim();
  const lc  = (p.level_code ?? '').trim();
  const isSeniorLevel = ['VP', 'S Dr', 'Dr'].includes(lc);

  if (cc === 'A FTE') return 'aFte';
  if (cc === 'A CON') return 'aCon';
  if (cc === 'R CON') return 'rCon';
  if (cc.startsWith('R ')) return 'rFte';
  if (cc === 'CON') return 'con';
  if (isSeniorLevel || cc === 'VP' || cc === 'Dr') return 'snr';
  return 'fte';
}

function discKey(disciplineName: string | null): Disc {
  const raw = (disciplineName ?? '').trim().toLowerCase();
  const match = DISCIPLINES.find(d => d.toLowerCase() === raw);
  return match ?? 'Other';
}

const GEARING_STATUS = {
  under:       { label: 'Under Target', dot: '#D97706', color: '#92530A', bg: '#FFF8E6', border: '#FEDC86' },
  'on-target': { label: 'On Target',    dot: '#2A8346', color: '#2A8346', bg: '#DFFBE5', border: '#6FCF97' },
  over:        { label: 'Over Target',  dot: '#B91C1C', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  'no-data':   { label: 'No Gearing',   dot: '#9CA3AF', color: '#5A657B', bg: '#F2F3F4', border: '#D1D5DB' },
} as const;
type GearingStatus = keyof typeof GEARING_STATUS;

export default function Summary() {
  const { cycles, selectedCycleId, setSelectedCycleId, selectedCycle } = usePlanningCycle();

  const [people,            setPeople]            = useState<Person[]>([]);
  const [regions,           setRegions]           = useState<Region[]>([]);
  const [projects,          setProjects]          = useState<Project[]>([]);
  const [gearingConstants,  setGearingConstants]  = useState<GearingConstant[]>([]);
  const [regionId,          setRegionId]          = useState<number | null>(null);
  const [regionsLoaded,     setRegionsLoaded]     = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<string | null>(null);

  // ── Load regions + gearing constants once ────────────────────────────────────
  useEffect(() => {
    Promise.all([
      refDataApi.regions().catch(() => [] as Region[]),
      gearingApi.list().catch(() => [] as GearingConstant[]),
    ]).then(([regionList, gearList]) => {
      setRegions(regionList);
      setGearingConstants(gearList);
      const apac = regionList.find(r =>
        r.code?.toUpperCase() === 'APAC' || r.name?.toLowerCase().includes('apac')
      );
      if (apac) setRegionId(apac.id);
    }).finally(() => setRegionsLoaded(true));
  }, []);

  // ── Load projects when cycle changes ─────────────────────────────────────────
  useEffect(() => {
    projectsApi.list({
      is_active: 'true', limit: 500,
      ...(selectedCycleId ? { planning_cycle_id: selectedCycleId } : {}),
    }).then(setProjects).catch(() => setProjects([]));
  }, [selectedCycleId]);

  // ── Load people whenever region changes (after regions resolved) ─────────────
  useEffect(() => {
    if (!regionsLoaded) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    peopleApi.list({
      limit: 5000,
      is_active: 'all',
      ...(regionId !== null ? { region_id: regionId } : {}),
    })
      .then(data => {
        if (cancelled) return;
        setPeople(data);
        setLoading(false);
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load people data');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [regionId, regionsLoaded]);

  // ── Aggregate people into discipline × metric matrix ─────────────────────────
  const byDisc = useMemo<Record<Disc, Metrics>>(() => {
    const map = Object.fromEntries(DISCIPLINES.map(d => [d, zero()])) as Record<Disc, Metrics>;
    for (const p of people) {
      const key    = discKey(p.discipline_name);
      const bucket = classifyPerson(p);
      map[key][bucket]++;
    }
    return map;
  }, [people]);

  const totals = useMemo(
    () => DISCIPLINES.reduce<Metrics>((acc, d) => addM(acc, byDisc[d]), zero()),
    [byDisc]
  );

  // ── Gearing status per discipline ─────────────────────────────────────────────
  const gearingStatus = useMemo(() => {
    const gcMap: Record<string, Record<string, { min: number; max: number }>> = {};
    for (const g of gearingConstants) {
      if (!gcMap[g.discipline_name]) gcMap[g.discipline_name] = {};
      gcMap[g.discipline_name][g.project_type] = {
        min: Number(g.min_divisor),
        max: Number(g.max_divisor),
      };
    }

    return DISCIPLINES.map(disc => {
      const discGc = gcMap[disc] ?? {};
      let minFte = 0, maxFte = 0, hasGearing = false;
      for (const proj of projects) {
        const g = discGc[proj.type ?? 'Retail'];
        if (g) {
          hasGearing = true;
          if (g.min > 0) minFte += Number(proj.weight) / g.min;
          if (g.max > 0) maxFte += Number(proj.weight) / g.max;
        }
      }
      const total = derive(byDisc[disc]).total;
      const lo    = Math.round(Math.min(minFte, maxFte));
      const hi    = Math.round(Math.max(minFte, maxFte));
      let status: GearingStatus = 'no-data';
      if (hasGearing) {
        if (total < lo)      status = 'under';
        else if (total > hi) status = 'over';
        else                 status = 'on-target';
      }
      return { disc, total, status, min: lo, max: hi, hasGearing };
    });
  }, [byDisc, projects, gearingConstants]);

  // ── Gearing ratio constants table (discipline × project type) ────────────────
  const gearingTable = useMemo(() => {
    // Project types present in gearing constants (not dependent on current portfolio)
    const TYPE_ORDER: Record<string, number> = { Retail: 0, xScale: 1 };
    const projectTypes = Array.from(new Set(gearingConstants.map(g => g.project_type)))
      .sort((a, b) => {
        const oa = TYPE_ORDER[a] ?? 99;
        const ob = TYPE_ORDER[b] ?? 99;
        return oa !== ob ? oa - ob : a.localeCompare(b);
      });

    // Lookup: discipline → project_type → { minDiv, maxDiv }
    const lookup: Record<string, Record<string, { minDiv: number; maxDiv: number }>> = {};
    for (const g of gearingConstants) {
      if (!lookup[g.discipline_name]) lookup[g.discipline_name] = {};
      lookup[g.discipline_name][g.project_type] = {
        minDiv: Number(g.min_divisor),
        maxDiv: Number(g.max_divisor),
      };
    }
    return { projectTypes, lookup };
  }, [gearingConstants]);

  // ── Styles ───────────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: '9px 10px', fontSize: 10, fontWeight: 700, textAlign: 'center',
    letterSpacing: '0.04em', borderRight: '1px solid rgba(255,255,255,0.15)',
    whiteSpace: 'nowrap', userSelect: 'none' as const, color: '#FFFFFF',
  };
  const TD: React.CSSProperties = {
    padding: '6px 10px', fontSize: 12, textAlign: 'center',
    borderRight: '1px solid #EEF0F3', borderBottom: '1px solid #EEF0F3', color: '#111111',
  };
  const TD_LABEL: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, textAlign: 'left', fontWeight: 400,
    borderRight: '1px solid #EEF0F3', borderBottom: '1px solid #EEF0F3',
    color: '#111111', whiteSpace: 'nowrap' as const,
  };
  const TD_MUTED: React.CSSProperties  = { ...TD, color: '#5A6270', fontSize: 11 };
  const TD_ZERO: React.CSSProperties   = { ...TD, color: '#C8C8C8', fontSize: 11 };
  const ROW_SECTION: React.CSSProperties = {
    background: '#F5F7FA', fontSize: 10, fontWeight: 700,
    color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
  };
  const ROW_ALT: React.CSSProperties   = { background: '#FAFBFC' };
  const ROW_SUM: React.CSSProperties   = { background: '#F0F4F8' };
  const ROW_TOTAL: React.CSSProperties = { background: '#1A1A2E' };

  const cols = [
    ...DISCIPLINES.map(d => ({ label: d, m: byDisc[d], colour: DISC_COLOUR[d].bg })),
    { label: 'Total', m: totals, colour: undefined as string | undefined },
  ];

  function numCell(v: number, key: string, opts?: { bold?: boolean; muted?: boolean; rowStyle?: React.CSSProperties }) {
    const rs = opts?.rowStyle ?? {};
    if (v === 0) return <td key={key} style={{ ...TD_ZERO, ...rs }}>—</td>;
    if (opts?.bold) return <td key={key} style={{ ...TD, ...rs, fontWeight: 700 }}>{v}</td>;
    if (opts?.muted) return <td key={key} style={{ ...TD_MUTED, ...rs }}>{v}</td>;
    return <td key={key} style={{ ...TD, ...rs }}>{v}</td>;
  }
  function pctCell(v: number, key: string, rowStyle?: React.CSSProperties) {
    return <td key={key} style={{ ...TD_MUTED, fontSize: 11, ...(rowStyle ?? {}) }}>{pct(v)}</td>;
  }

  const regionLabel = regionId
    ? (regions.find(r => r.id === regionId)?.name ?? 'Filtered')
    : 'All Regions';

  const SEL_SM: React.CSSProperties = {
    background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827',
    fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 5px',
    cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8F9FB', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Unified metrics banner ── */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '3px solid #33A85C', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>

        {/* Title */}
        <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1, whiteSpace: 'nowrap' }}>People Summary</div>
          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 3, whiteSpace: 'nowrap' }}>Headcount vs gearing targets</div>
        </div>

        {/* Total heads */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', borderRight: '1px solid #E0E3E8', minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
            {loading ? '—' : derive(totals).total || '—'}
          </span>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Total</span>
            <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
          </div>
        </div>

        {/* Per-discipline stats */}
        {gearingStatus.map(({ disc, total, status, min, max, hasGearing }) => {
          const meta     = GEARING_STATUS[status];
          const numColor = loading ? '#C8C8C8' : hasGearing ? meta.color : (DISC_COLOUR[disc]?.bg ?? '#5A657B');
          return (
            <div key={disc} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', borderRight: '1px solid #E0E3E8', minWidth: 0, flex: '1 1 auto' }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: numColor, lineHeight: 1 }}>
                {loading ? '—' : (total || '—')}
              </span>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{disc}</span>
                <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
              </div>
              {!loading && hasGearing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: '#8B93A3' }}>Min {min}</span>
                  <span style={{ fontSize: 9, color: '#C8C8C8' }}>·</span>
                  <span style={{ fontSize: 9, color: '#8B93A3' }}>Max {max}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 6,
                    background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
                    letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  }}>{meta.label}</span>
                </div>
              )}
              {!loading && !hasGearing && (
                <div style={{ fontSize: 9, color: '#C8C8C8', marginTop: 2 }}>no gearing</div>
              )}
            </div>
          );
        })}

        {/* Selectors pushed to right: Cycle → Region */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
          <div style={{ padding: '0 10px', borderLeft: '1px solid #E0E3E8', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Cycle</span>
            <select value={selectedCycleId ?? ''} onChange={e => setSelectedCycleId(e.target.value ? Number(e.target.value) : null)} style={SEL_SM}>
              <option value="">All cycles</option>
              {cycles.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ padding: '0 10px', borderLeft: '1px solid #E0E3E8', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Region</span>
            <select value={regionId ?? ''} onChange={e => setRegionId(e.target.value ? Number(e.target.value) : null)} style={{ ...SEL_SM, width: 82 }}>
              <option value="">All</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#9AA0AA', fontSize: 13 }}>Loading…</div>
        )}

        {error && !loading && (
          <div style={{ padding: 16, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, color: '#996600', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── People summary table ── */}
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'inline-block', minWidth: '100%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' as const }}>
                <colgroup>
                  <col style={{ width: 220 }} />
                  <col style={{ width: 68 }} />
                  {DISCIPLINES.map(d => <col key={d} style={{ width: 110 }} />)}
                  <col style={{ width: 90 }} />
                </colgroup>

                <thead>
                  <tr style={{ background: '#1A1A2E' }}>
                    <th style={{ ...TH, textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>Role Type / Totals</th>
                    <th style={{ ...TH, color: 'rgba(255,255,255,0.55)' }}>Code</th>
                    {cols.map((c, i) => (
                      <th key={c.label} style={{ ...TH, borderRight: i === cols.length - 1 ? 'none' : TH.borderRight }}>
                        {c.colour && (
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c.colour, marginRight: 5, verticalAlign: 'middle' }} />
                        )}
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td colSpan={2 + cols.length} style={{ ...ROW_SECTION, padding: '5px 12px', borderBottom: '1px solid #E5E7EB' }}>
                      Existing Staff
                    </td>
                  </tr>

                  <tr>
                    <td style={TD_LABEL}>VP / Director</td>
                    <td style={{ ...TD, textAlign: 'left', paddingLeft: 8 }}><span style={TAG}>SNR</span></td>
                    {cols.map(c => numCell(c.m.snr, `snr-${c.label}`))}
                  </tr>

                  <tr style={ROW_ALT}>
                    <td style={{ ...TD_LABEL, ...ROW_ALT }}>Exist FTE</td>
                    <td style={{ ...TD, ...ROW_ALT, textAlign: 'left', paddingLeft: 8 }}><span style={TAG}>FTE</span></td>
                    {cols.map(c => numCell(c.m.fte, `fte-${c.label}`, { rowStyle: ROW_ALT }))}
                  </tr>

                  <tr>
                    <td style={TD_LABEL}>Exist Contingent</td>
                    <td style={{ ...TD, textAlign: 'left', paddingLeft: 8 }}>
                      <span style={{ ...TAG, background: '#FFF8E1', color: '#E65100', border: '1px solid #FDB90D' }}>CON</span>
                    </td>
                    {cols.map(c => numCell(c.m.con, `con-${c.label}`))}
                  </tr>

                  <tr style={ROW_ALT}>
                    <td style={{ ...TD_LABEL, ...ROW_ALT }}>Approved TBH FTE</td>
                    <td style={{ ...TD, ...ROW_ALT, textAlign: 'left', paddingLeft: 8 }}>
                      <span style={{ ...TAG, background: '#FFF0F0', color: '#AD050C', border: '1px solid #E91C24' }}>A FTE</span>
                    </td>
                    {cols.map(c => numCell(c.m.aFte, `afte-${c.label}`, { rowStyle: ROW_ALT }))}
                  </tr>

                  <tr>
                    <td style={TD_LABEL}>Approved TBH Contingent</td>
                    <td style={{ ...TD, textAlign: 'left', paddingLeft: 8 }}>
                      <span style={{ ...TAG, background: '#FFF0F0', color: '#AD050C', border: '1px solid #E91C24' }}>A CON</span>
                    </td>
                    {cols.map(c => numCell(c.m.aCon, `acon-${c.label}`))}
                  </tr>

                  <tr style={ROW_SUM}>
                    <td style={{ ...TD_LABEL, ...ROW_SUM, color: '#5A6270', fontStyle: 'italic' }}>% Contingent (existing)</td>
                    <td style={{ ...TD, ...ROW_SUM }} />
                    {cols.map(c => pctCell(derive(c.m).pctConExist, `pce-${c.label}`, ROW_SUM))}
                  </tr>

                  <tr style={ROW_SUM}>
                    <td style={{ ...TD_LABEL, ...ROW_SUM, fontWeight: 700, fontSize: 13 }}>Existing Heads</td>
                    <td style={{ ...TD, ...ROW_SUM }} />
                    {cols.map(c => {
                      const d = derive(c.m);
                      return d.existing === 0
                        ? <td key={`eh-${c.label}`} style={{ ...TD_ZERO, ...ROW_SUM }}>—</td>
                        : <td key={`eh-${c.label}`} style={{ ...TD, ...ROW_SUM, fontWeight: 700, fontSize: 13 }}>{d.existing}</td>;
                    })}
                  </tr>

                  <tr>
                    <td colSpan={2 + cols.length} style={{ ...ROW_SECTION, padding: '5px 12px', borderBottom: '1px solid #E5E7EB', borderTop: '2px solid #D0D4DA' }}>
                      Pipeline / Requested
                    </td>
                  </tr>

                  <tr>
                    <td style={TD_LABEL}>Requested TBH FTE</td>
                    <td style={{ ...TD, textAlign: 'left', paddingLeft: 8 }}>
                      <span style={{ ...TAG, background: '#FDE8F6', color: '#AD1457', border: '1px solid #E91E8C' }}>R FTE</span>
                    </td>
                    {cols.map(c => numCell(c.m.rFte, `rfte-${c.label}`))}
                  </tr>

                  <tr style={ROW_ALT}>
                    <td style={{ ...TD_LABEL, ...ROW_ALT }}>Requested TBH Contingent</td>
                    <td style={{ ...TD, ...ROW_ALT, textAlign: 'left', paddingLeft: 8 }}>
                      <span style={{ ...TAG, background: '#FDE8F6', color: '#AD1457', border: '1px solid #E91E8C' }}>R CON</span>
                    </td>
                    {cols.map(c => numCell(c.m.rCon, `rcon-${c.label}`, { rowStyle: ROW_ALT }))}
                  </tr>

                  <tr style={ROW_SUM}>
                    <td style={{ ...TD_LABEL, ...ROW_SUM, color: '#5A6270', fontStyle: 'italic' }}>% Contingent (w/ Requested)</td>
                    <td style={{ ...TD, ...ROW_SUM }} />
                    {cols.map(c => pctCell(derive(c.m).pctConTotal, `pct-${c.label}`, ROW_SUM))}
                  </tr>

                  <tr style={ROW_SUM}>
                    <td style={{ ...TD_LABEL, ...ROW_SUM, fontWeight: 600 }}>Total Requested Heads</td>
                    <td style={{ ...TD, ...ROW_SUM }} />
                    {cols.map(c => {
                      const d = derive(c.m);
                      return d.requested === 0
                        ? <td key={`tr-${c.label}`} style={{ ...TD_ZERO, ...ROW_SUM }}>—</td>
                        : <td key={`tr-${c.label}`} style={{ ...TD, ...ROW_SUM, fontWeight: 600 }}>{d.requested}</td>;
                    })}
                  </tr>

                  <tr style={ROW_TOTAL}>
                    <td style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#FFFFFF', borderRight: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' as const }}>
                      TOTAL HEADS
                    </td>
                    <td style={{ padding: '9px 10px', borderRight: '1px solid rgba(255,255,255,0.12)' }} />
                    {cols.map((c, i) => {
                      const d = derive(c.m);
                      return (
                        <td key={`th-${c.label}`} style={{
                          padding: '9px 10px', textAlign: 'center', fontSize: 13, fontWeight: 700,
                          color: '#FFFFFF', borderRight: i < cols.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                        }}>
                          {d.total > 0 ? d.total : '—'}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: '#9AA0AA' }}>
              {people.length} people · {regionLabel}{selectedCycle ? ` · ${selectedCycle.name}` : ''}
            </div>

            {/* ── Gearing Ratios Table ── */}
            {gearingTable.projectTypes.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111111' }}>Gearing Ratios</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                    Required headcount = Total weighted project count ÷ Gearing Ratio
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'inline-block', minWidth: '100%' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' as const }}>
                    <colgroup>
                      <col style={{ width: 180 }} />
                      {DISCIPLINES.map(d => <col key={d} style={{ width: 110 }} />)}
                    </colgroup>

                    <thead>
                      <tr style={{ background: '#2F3541' }}>
                        <th style={{ ...TH, textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>Project Type</th>
                        {DISCIPLINES.map((d, i) => (
                          <th key={d} style={{ ...TH, borderRight: i === DISCIPLINES.length - 1 ? 'none' : TH.borderRight }}>
                            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: DISC_COLOUR[d].bg, marginRight: 5, verticalAlign: 'middle' }} />
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {gearingTable.projectTypes.map((ptype, ri) => (
                        <tr key={ptype} style={ri % 2 === 1 ? ROW_ALT : {}}>
                          <td style={{ ...TD_LABEL, ...(ri % 2 === 1 ? ROW_ALT : {}), fontWeight: 600 }}>{ptype}</td>
                          {DISCIPLINES.map((disc, di) => {
                            const entry  = gearingTable.lookup[disc]?.[ptype];
                            const isLast = di === DISCIPLINES.length - 1;
                            const rowBg  = ri % 2 === 1 ? ROW_ALT : {};
                            if (!entry) {
                              return <td key={disc} style={{ ...TD_ZERO, ...rowBg, borderRight: isLast ? 'none' : undefined }}>—</td>;
                            }
                            return (
                              <td key={disc} style={{ ...TD, ...rowBg, borderRight: isLast ? 'none' : undefined, fontWeight: 700, fontSize: 14 }}>
                                {entry.minDiv}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
