import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  peopleApi, projectsApi, refDataApi, gearingApi, countryAllocationsApi, personCommentsApi,
  type Person, type Project, type Region, type GearingConstant,
  type CountryAllocation,
} from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';
import { useTabDirty } from '../context/TabContext';
import PersonEditPanel from '../components/PersonEditPanel';

const DISCIPLINES = ['Construction', 'Design', 'Commercial', 'Commissioning', 'Other'];

const DISCIPLINE_COLOURS: Record<string, { bg: string; text: string; light: string }> = {
  'Construction': { bg: '#086AE3', text: '#FFFFFF', light: '#EEF4FD' },
  'Design':       { bg: '#33A85C', text: '#FFFFFF', light: '#EEF8F2' },
  'Commercial':   { bg: '#C59000', text: '#FFFFFF', light: '#FFF9E6' },
  'Commissioning':{ bg: '#00737A', text: '#FFFFFF', light: '#E6F5F6' },
  'Other':        { bg: '#5A657B', text: '#FFFFFF', light: '#F0F2F5' },
};

const CONTRACT_PILL: Record<string, { bg: string; color: string; border: string }> = {
  'FTE':      { bg: '#F0F0F0', color: '#333333', border: '#C8C8C8' },
  'SNR':      { bg: '#F0F0F0', color: '#333333', border: '#C8C8C8' },
  'VP':       { bg: '#E8EAF6', color: '#3949AB', border: '#9FA8DA' },
  'Dr':       { bg: '#EDE7F6', color: '#512DA8', border: '#B39DDB' },
  'CON':      { bg: '#FFF8E1', color: '#E65100', border: '#FDB90D' },
  'A FTE':    { bg: '#FFF0F0', color: '#AD050C', border: '#E91C24' },
  'A CON':    { bg: '#FFF8E1', color: '#E65100', border: '#FDB90D' },
  'R FTE':    { bg: '#FDE8F6', color: '#AD1457', border: '#E91E8C' },
  'R CON':    { bg: '#FDE8F6', color: '#AD1457', border: '#E91E8C' },
  'R FTE 26': { bg: '#FDE8F6', color: '#AD1457', border: '#E91E8C' },
};

const LEVEL_ORDER: Record<string, number> = {
  'VP': 1, 'S Dr': 2, 'Dr': 3, 'S M': 4, 'M': 5,
  'St': 6, 'Sc': 7, 'Ex': 8, 'Sp': 9, 'In': 10,
  'En': 11, 'Ca': 12, 'Te': 13, 'Cons': 14,
};

const STATUS_COLOURS: Record<string, string> = {
  'Approved': '#E91C24', 'Seeded': '#7739D9', 'Proposed': '#086AE3',
};

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia': 'au', 'Austria': 'at', 'Bahrain': 'bh', 'Belgium': 'be',
  'Brazil': 'br', 'Canada': 'ca', 'Chile': 'cl', 'China': 'cn',
  'Colombia': 'co', 'Czech Republic': 'cz', 'Denmark': 'dk', 'Egypt': 'eg',
  'Finland': 'fi', 'France': 'fr', 'Germany': 'de', 'Greece': 'gr',
  'Hong Kong': 'hk', 'Hungary': 'hu', 'India': 'in', 'Indonesia': 'id',
  'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it', 'Japan': 'jp',
  'Jordan': 'jo', 'Kenya': 'ke', 'Kuwait': 'kw', 'Luxembourg': 'lu',
  'Malaysia': 'my', 'Mexico': 'mx', 'Morocco': 'ma', 'Netherlands': 'nl',
  'New Zealand': 'nz', 'Nigeria': 'ng', 'Norway': 'no', 'Oman': 'om',
  'Panama': 'pa', 'Peru': 'pe', 'Philippines': 'ph', 'Poland': 'pl',
  'Portugal': 'pt', 'Qatar': 'qa', 'Romania': 'ro', 'Saudi Arabia': 'sa',
  'Singapore': 'sg', 'Slovakia': 'sk', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Sweden': 'se', 'Switzerland': 'ch', 'Taiwan': 'tw',
  'Thailand': 'th', 'Turkey': 'tr', 'United Arab Emirates': 'ae',
  'United Kingdom': 'gb', 'United States': 'us', 'Vietnam': 'vn',
  'UK': 'gb', 'USA': 'us', 'UAE': 'ae', 'Korea': 'kr', 'Serbia': 'rs',
};

function flagUrl(country: string): string | null {
  const code = COUNTRY_FLAGS[country];
  return code ? `https://flagcdn.com/w20/${code}.png` : null;
}

type ContractGroup = 'employee' | 'contingent' | 'approved' | 'request';

function contractGroup(p: Person): ContractGroup {
  const code = p.contract_type_code ?? '';
  const cat  = p.contract_category  ?? '';
  if (cat === 'requested' || code.startsWith('R ')) return 'request';
  if (cat === 'approved'  || code.startsWith('A ')) return 'approved';
  if (code === 'CON')                                return 'contingent';
  return 'employee';
}



const COL_W   = 100;
const LABEL_W = 90;
const COUNTRY_ORDER = ['Japan','Australia','Singapore','Indonesia','Malaysia','China','South Korea','India','Philippines','Thailand'];

function DeltaBadge({ a, b, size = 10, isFloat = false }: { a: number; b: number; size?: number; isFloat?: boolean }) {
  const d = b - a;
  if (Math.abs(d) < 0.05) return <span style={{ fontSize: size, color: '#BDC1CA' }}>● 0</span>;
  const up = d > 0;
  const dStr = isFloat ? Math.abs(d).toFixed(1) : String(Math.round(Math.abs(d)));
  return <span style={{ fontSize: size, fontWeight: 700, color: up ? '#33A85C' : '#E91C24' }}>{up ? '▲' : '▼'} {dStr}</span>;
}

export default function Allocations({ tabId }: { tabId?: string } = {}) {
  const { cycles, selectedCycleId, setSelectedCycleId, selectedCycle, selectedRegionId, setSelectedRegionId } = usePlanningCycle();
  const canEdit = !selectedCycle || (['active', 'under_review'].includes(selectedCycle.status));

  // ── Data ──────────────────────────────────────────────────────────────────
  const [regions, setRegions]           = useState<Region[]>([]);
  const [allPeople, setAllPeople]       = useState<Person[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [countryAllocs, setCountryAllocs] = useState<CountryAllocation[]>([]);
  const [gearingConstants, setGearingConstants] = useState<GearingConstant[]>([]);
  const [loading, setLoading]           = useState(false);
  const [backendError, setBackendError] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]         = useState('');
  const [countryFilter, setCountryFilter]       = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('');

  // ── Collapse ──────────────────────────────────────────────────────────────
  const [collapsedDisciplines, setCollapsedDisciplines] = useState<Set<string>>(new Set(DISCIPLINES));
  const [collapsedCountries, setCollapsedCountries]     = useState<Set<string>>(new Set());

  // ── UI state ──────────────────────────────────────────────────────────────
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [addModal, setAddModal]     = useState<{ preDisciplineId?: number } | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<{ name: string; x: number; y: number } | null>(null);

  // Add allocation modal state
  const [modalPersonId, setModalPersonId]   = useState<number | ''>('');
  const [modalAllocs, setModalAllocs]       = useState<Record<number, string>>({});
  const [modalSaving, setModalSaving]       = useState(false);
  const [allocMode, setAllocMode]           = useState<'equal' | 'custom'>('equal');
  const [equalCountries, setEqualCountries] = useState<Set<number>>(new Set());
  const [lockedPerson, setLockedPerson]     = useState<Person | null>(null);
  const [hoveredPill, setHoveredPill]       = useState<{ personId: number; x: number; y: number } | null>(null);
  const [commentCache, setCommentCache]     = useState<Record<number, string>>({});

  const [compCycleId,       setCompCycleId]       = useState<number | null>(null);
  const [compCountryAllocs, setCompCountryAllocs] = useState<CountryAllocation[]>([]);

  useTabDirty(tabId, false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    refDataApi.regions().then(setRegions).catch(() => setBackendError(true));
  }, []);

  useEffect(() => { setCollapsedCountries(new Set()); setCountryFilter(''); }, [selectedRegionId]);

  const loadData = useCallback(async () => {
    setLoading(true); setBackendError(false);
    try {
      const [ppl, projs, allocs, gc] = await Promise.all([
        peopleApi.list({ is_active: 'true', limit: 500,
          ...(selectedRegionId ? { region_id: selectedRegionId } : {}) }).catch(() => [] as Person[]),
        projectsApi.list({ is_active: 'true', limit: 500,
          ...(selectedCycleId ? { planning_cycle_id: selectedCycleId } : {}) }).catch(() => [] as Project[]),
        countryAllocationsApi.list({
          ...(selectedCycleId  ? { planning_cycle_id: selectedCycleId }  : {}),
          ...(selectedRegionId ? { region_id: selectedRegionId } : {}),
        }).catch(() => [] as CountryAllocation[]),
        gearingApi.list().catch(() => [] as GearingConstant[]),
      ]);
      setAllPeople(ppl);
      setProjects(projs);
      setCountryAllocs(allocs);
      setGearingConstants(gc);
    } catch { setBackendError(true); }
    finally   { setLoading(false); }
  }, [selectedCycleId, selectedRegionId]);

  useEffect(() => { loadData(); }, [loadData]);

useEffect(() => {
    if (!compCycleId) { setCompCountryAllocs([]); return; }
    countryAllocationsApi.list({
      planning_cycle_id: compCycleId,
      ...(selectedRegionId ? { region_id: selectedRegionId } : {}),
    }).then(setCompCountryAllocs).catch(() => setCompCountryAllocs([]));
  }, [compCycleId, selectedRegionId]);

  // ── Derived: countries from projects ──────────────────────────────────────
  const countryGroups = useMemo(() => {
    // When no region is selected include all projects; otherwise filter to the chosen region.
    // (null === null would only match region-less projects, so we skip the filter entirely.)
    let filtered = selectedRegionId !== null
      ? projects.filter(p => p.region_id === selectedRegionId)
      : projects;
    if (statusFilter) filtered = filtered.filter(p => p.status === statusFilter);
    const map: Record<string, { id: number; projects: Project[] }> = {};
    for (const p of filtered) {
      const c = p.country_name ?? 'Unassigned';
      if (!map[c]) map[c] = { id: p.country_id ?? 0, projects: [] };
      map[c].projects.push(p);
    }
    // Also include countries from allocations that might not have projects
    for (const a of countryAllocs) {
      if (!map[a.country_name]) map[a.country_name] = { id: a.country_id, projects: [] };
    }
    const groups = Object.entries(map)
      .sort(([a], [b]) => {
        const ia = COUNTRY_ORDER.indexOf(a), ib = COUNTRY_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map(([country, { id, projects: projs }]) => ({
        country,
        countryId: id,
        projects: projs,
        totalWeight: projs.reduce((s, p) => s + (Number(p.weight) || 1), 0),
        isEmergingMarket: projs[0]?.is_emerging_market ?? false,
      }));
    return countryFilter ? groups.filter(g => g.country === countryFilter) : groups;
  }, [projects, countryAllocs, selectedRegionId, statusFilter, countryFilter]);

  // ── Derived: alloc map ────────────────────────────────────────────────────
  const allocMap = useMemo(() => {
    const m: Record<number, Record<number, number>> = {};
    for (const a of countryAllocs) {
      if (!m[a.person_id]) m[a.person_id] = {};
      m[a.person_id][a.country_id] = Number(a.fte_value);
    }
    return m;
  }, [countryAllocs]);

  // ── Derived: people in grid (those with allocations) ──────────────────────
  const allocatedPersonIds = useMemo(
    () => new Set(countryAllocs.map(a => a.person_id)),
    [countryAllocs]
  );

  const allocatedPeople = useMemo(
    () => allPeople.filter(p => allocatedPersonIds.has(p.id)),
    [allPeople, allocatedPersonIds]
  );

  // ── Derived: hierarchy ────────────────────────────────────────────────────
  type HierarchyEntry = {
    discipline: string;
    disciplineId?: number | null;
    groups: { group: ContractGroup; people: Person[] }[];
    allPeople: Person[];
  };

  const hierarchy = useMemo((): HierarchyEntry[] => {
    const discMap: Record<string, Person[]> = {};
    for (const d of DISCIPLINES) discMap[d] = [];
    for (const p of allocatedPeople) {
      const disc = p.discipline_name ?? 'Other';
      (discMap[DISCIPLINES.includes(disc) ? disc : 'Other'] ??= []).push(p);
    }
    return DISCIPLINES.map(disc => {
      const ppl = discMap[disc] ?? [];
      const discId = ppl[0]?.discipline_id ?? undefined;

      if (ppl.length === 0) {
        return { discipline: disc, disciplineId: discId, groups: [], allPeople: [] };
      }

      const byGroup: Record<ContractGroup, Person[]> = {
        employee: [], contingent: [], approved: [], request: [],
      };
      for (const p of ppl) byGroup[contractGroup(p)].push(p);

      // Flatten: people sorted by level order within each contract group (no level sub-headers)
      const groups = (['employee', 'contingent', 'approved', 'request'] as ContractGroup[])
        .filter(g => byGroup[g].length > 0)
        .map(g => {
          const sortedPeople = [...byGroup[g]].sort((a, b) => {
            const la = LEVEL_ORDER[a.level_code ?? ''] ?? 99;
            const lb = LEVEL_ORDER[b.level_code ?? ''] ?? 99;
            return la !== lb ? la - lb : a.name.localeCompare(b.name);
          });
          return { group: g, people: sortedPeople };
        });

      return { discipline: disc, disciplineId: discId, groups, allPeople: ppl };
    });
  }, [allocatedPeople]);

  const displayedHierarchy = useMemo(
    () => disciplineFilter ? hierarchy.filter(h => h.discipline === disciplineFilter) : hierarchy,
    [hierarchy, disciplineFilter]
  );

  // ── Collapse toggles ──────────────────────────────────────────────────────
  const allDeptsCollapsed = displayedHierarchy.length > 0 &&
    displayedHierarchy.every(h => collapsedDisciplines.has(h.discipline));


  function toggleDisc(d: string) {
    setCollapsedDisciplines(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  }
  function toggleCountryCol(c: string) {
    setCollapsedCountries(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  }

  // ── Banner metrics ────────────────────────────────────────────────────────
  const bannerMetrics = useMemo(() => {
    const totalAvailable = allPeople.reduce((s, p) => s + (parseFloat(String(p.contracted_fte ?? 1)) || 1), 0);
    const totalAllocated = countryAllocs.reduce((s, a) => s + Number(a.fte_value), 0);
    const byDisc = DISCIPLINES.map(d => ({
      discipline: d,
      allocated: countryAllocs
        .filter(a => allPeople.find(p => p.id === a.person_id)?.discipline_name === d)
        .reduce((s, a) => s + Number(a.fte_value), 0),
    })).filter(d => d.allocated > 0);
    return { totalAvailable, totalAllocated, byDisc };
  }, [allPeople, countryAllocs]);

  const compAllocatedPersonIds = useMemo(
    () => new Set(compCountryAllocs.map(a => a.person_id)),
    [compCountryAllocs]
  );

  const compBannerMetrics = useMemo(() => {
    const totalAllocated = compCountryAllocs.reduce((s, a) => s + Number(a.fte_value), 0);
    const byDisc = DISCIPLINES.map(d => ({
      discipline: d,
      allocated: compCountryAllocs
        .filter(a => allPeople.find(p => p.id === a.person_id)?.discipline_name === d)
        .reduce((s, a) => s + Number(a.fte_value), 0),
    }));
    return { totalAllocated, byDisc };
  }, [allPeople, compCountryAllocs]);

  // ── Footer totals: Proposed/Min/Max per discipline per country ───────────
  const disciplineFooterTotals = useMemo(() => {
    // Build gearing lookup: discipline_name → project_type → min_divisor (only min_divisor is used)
    const gearingByDisc: Record<string, Record<string, number>> = {};
    for (const g of gearingConstants) {
      if (!gearingByDisc[g.discipline_name]) gearingByDisc[g.discipline_name] = {};
      gearingByDisc[g.discipline_name][g.project_type] = Number(g.min_divisor);
    }
    return displayedHierarchy.map(h => {
      const discGearing = gearingByDisc[h.discipline] ?? {};
      const retailDivisor = discGearing['Retail'];
      const xScaleDivisor = discGearing['xScale'];
      const emDivisor = discGearing['EM'];

      const countries = countryGroups.map(g => {
        const proposed = h.allPeople.reduce(
          (s, p) => s + (allocMap[p.id]?.[g.countryId] ?? 0), 0
        );

        if (!retailDivisor && !xScaleDivisor) {
          return { countryId: g.countryId, proposed, min: 0, max: 0 };
        }

        // Accumulate weight sums (for Min) and project counts (for Max)
        let xScaleWeight = 0, nonXScaleWeight = 0;
        let xScaleCount = 0, nonXScaleCount = 0;
        for (const proj of g.projects) {
          const w = Number(proj.weight) || 1;
          if (proj.type === 'xScale') {
            xScaleWeight += w;
            xScaleCount += 1;
          } else {
            nonXScaleWeight += w;
            nonXScaleCount += 1;
          }
        }

        // Min: weight-based; ALL countries (including EM) use Retail min_divisor for non-xScale
        let minFte = 0;
        if (retailDivisor && retailDivisor > 0) minFte += nonXScaleWeight / retailDivisor;
        if (xScaleDivisor && xScaleDivisor > 0) minFte += xScaleWeight / xScaleDivisor;

        // Max: count-based; EM countries use EM min_divisor for non-xScale, non-EM use Retail
        const maxNonXScaleDivisor = g.isEmergingMarket ? (emDivisor ?? retailDivisor) : retailDivisor;
        let maxFte = 0;
        if (maxNonXScaleDivisor && maxNonXScaleDivisor > 0) maxFte += nonXScaleCount / maxNonXScaleDivisor;
        if (xScaleDivisor && xScaleDivisor > 0) maxFte += xScaleCount / xScaleDivisor;

        return { countryId: g.countryId, proposed, min: minFte, max: maxFte };
      });
      return { discipline: h.discipline, countries };
    });
  }, [displayedHierarchy, allocMap, countryGroups, gearingConstants]);

  // ── Lazy comment fetch for pill tooltip ──────────────────────────────────
  const fetchLatestComment = useCallback(async (personId: number) => {
    if (commentCache[personId] !== undefined) return;
    setCommentCache(prev => ({ ...prev, [personId]: '…' }));
    try {
      const comments = await personCommentsApi.list(personId);
      const latest = comments[comments.length - 1];
      setCommentCache(prev => ({ ...prev, [personId]: latest?.body ?? '' }));
    } catch {
      setCommentCache(prev => ({ ...prev, [personId]: '' }));
    }
  }, [commentCache]);

  // ── Add / Edit allocation modal helpers ──────────────────────────────────
  function closeModal() {
    setAddModal(null);
    setLockedPerson(null);
    setModalPersonId('');
    setModalAllocs({});
    setAllocMode('equal');
    setEqualCountries(new Set());
  }

  function openAddModal(preDisciplineId?: number) {
    setLockedPerson(null);
    setModalPersonId('');
    setModalAllocs({});
    setAllocMode('equal');
    setEqualCountries(new Set());
    setAddModal({ preDisciplineId });
  }

  function openEditModal(p: Person) {
    const existing: Record<number, string> = {};
    for (const a of countryAllocs.filter(a => a.person_id === p.id)) {
      existing[a.country_id] = String(a.fte_value);
    }
    setModalPersonId(p.id);
    setLockedPerson(p);
    setModalAllocs(existing);
    setAllocMode(Object.keys(existing).length > 0 ? 'custom' : 'equal');
    setEqualCountries(new Set());
    setAddModal({});
  }

  async function saveModalAllocs() {
    if (!modalPersonId) return;
    let allocs: { country_id: number; fte_value: number }[];
    if (allocMode === 'equal') {
      if (equalCountries.size === 0) { toast.error('Select at least one country'); return; }
      const fte = parseFloat((1.0 / equalCountries.size).toFixed(4));
      allocs = Array.from(equalCountries).map(cid => ({ country_id: cid, fte_value: fte }));
    } else {
      allocs = countryGroups
        .map(g => ({ country_id: g.countryId, fte_value: parseFloat(modalAllocs[g.countryId] ?? '0') || 0 }))
        .filter(a => a.fte_value > 0);
      const total = allocs.reduce((s, a) => s + a.fte_value, 0);
      if (total > 1.001) { toast.error(`Total FTE ${total.toFixed(2)} exceeds 1.0`); return; }
    }
    setModalSaving(true);
    try {
      await countryAllocationsApi.save(Number(modalPersonId), selectedCycleId ?? null, allocs);
      toast.success('Allocations saved');
      closeModal();
      await loadData();
    } catch { toast.error('Failed to save'); }
    finally { setModalSaving(false); }
  }

  const modalTotal = allocMode === 'equal'
    ? equalCountries.size > 0 ? 1.0 : 0
    : countryGroups.reduce((s, g) => s + (parseFloat(modalAllocs[g.countryId] ?? '0') || 0), 0);

  // People available in the add modal (filtered by region, optionally by discipline)
  const modalPeople = useMemo(() => {
    let ppl = allPeople;
    if (addModal?.preDisciplineId) ppl = ppl.filter(p => p.discipline_id === addModal.preDisciplineId);
    return ppl.sort((a, b) => a.name.localeCompare(b.name));
  }, [allPeople, addModal]);

  const selectedRegionName = regions.find(r => r.id === selectedRegionId)?.name ?? '';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ color: '#111111', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Banner ── */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '3px solid #086AE3' }}>

        {/* ── Row 1: title · core metrics · selectors ── */}
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', borderBottom: '1px solid #E0E3E8' }}>
          {/* Title */}
          <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1, whiteSpace: 'nowrap' }}>Resources</div>
          </div>
          {!loading && (
            <>
              {/* People allocated */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '7px 13px', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{allocatedPeople.length}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>People</span>
                </div>
                {compCycleId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#8B93A3' }}>{compAllocatedPersonIds.size}</span>
                    <DeltaBadge a={compAllocatedPersonIds.size} b={allocatedPeople.length} />
                  </div>
                )}
              </div>
              {/* Available FTE */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '7px 13px', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{bannerMetrics.totalAvailable.toFixed(1)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Available FTE</span>
                </div>
              </div>
              {/* Allocated FTE */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '7px 13px', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#33A85C', lineHeight: 1 }}>{bannerMetrics.totalAllocated.toFixed(1)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Allocated FTE</span>
                </div>
                {compCycleId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#8B93A3' }}>{compBannerMetrics.totalAllocated.toFixed(1)}</span>
                    <DeltaBadge a={compBannerMetrics.totalAllocated} b={bannerMetrics.totalAllocated} isFloat />
                  </div>
                )}
              </div>
              {/* Utilisation */}
              {bannerMetrics.totalAvailable > 0 && (() => {
                const u  = bannerMetrics.totalAllocated  / bannerMetrics.totalAvailable;
                const cu = compBannerMetrics.totalAllocated / bannerMetrics.totalAvailable;
                const c  = u > 1.05 ? '#E91C24' : u >= 0.85 ? '#33A85C' : '#FDB90D';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '7px 13px', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: c, lineHeight: 1 }}>{Math.round(u * 100)}%</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Utilisation</span>
                    </div>
                    {compCycleId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: '#8B93A3' }}>{Math.round(cu * 100)}%</span>
                        <DeltaBadge a={Math.round(cu * 100)} b={Math.round(u * 100)} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
          {/* Region + Cycle + vs selectors */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ padding: '0 10px', borderLeft: '1px solid #E0E3E8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Region</span>
              <select value={selectedRegionId ?? ''} onChange={e => setSelectedRegionId(e.target.value ? Number(e.target.value) : null)}
                style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 12, fontWeight: 500, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', outline: 'none', width: 90 }}>
                <option value="">All</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
            </div>
            <div style={{ padding: '0 10px', borderLeft: '1px solid #E0E3E8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Cycle</span>
              <select value={selectedCycleId ?? ''} onChange={e => setSelectedCycleId(e.target.value ? Number(e.target.value) : null)}
                style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 12, fontWeight: 500, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', outline: 'none' }}>
                <option value="">All Cycles</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ padding: '0 10px', borderLeft: '1px solid #E0E3E8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>vs</span>
              <select value={compCycleId ?? ''} onChange={e => setCompCycleId(e.target.value ? Number(e.target.value) : null)}
                style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 12, fontWeight: 500, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', outline: 'none' }}>
                <option value="">None</option>
                {cycles.filter(c => c.is_active && c.id !== selectedCycleId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Row 2: per-discipline metrics ── */}
        {!loading && DISCIPLINES.some(disc => {
          const curr = bannerMetrics.byDisc.find(d => d.discipline === disc)?.allocated ?? 0;
          const comp = compBannerMetrics.byDisc.find(d => d.discipline === disc)?.allocated ?? 0;
          return curr > 0 || (!!compCycleId && comp > 0);
        }) && (
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#FAFBFC' }}>
            <div style={{ padding: '5px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>By Discipline</div>
            </div>
            {DISCIPLINES.map(disc => {
              const curr = bannerMetrics.byDisc.find(d => d.discipline === disc)?.allocated ?? 0;
              const comp = compBannerMetrics.byDisc.find(d => d.discipline === disc)?.allocated ?? 0;
              if (curr === 0 && (!compCycleId || comp === 0)) return null;
              const dc = DISCIPLINE_COLOURS[disc] ?? DISCIPLINE_COLOURS['Other'];
              return (
                <div key={disc} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5px 13px', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: dc.bg, lineHeight: 1 }}>{curr.toFixed(1)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{disc}</span>
                  </div>
                  {compCycleId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: '#8B93A3' }}>{comp.toFixed(1)}</span>
                      <DeltaBadge a={comp} b={curr} isFloat />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Filter / action row ── */}
      <div style={{ flexShrink: 0, padding: '8px 16px', background: '#FFFFFF', borderBottom: '1px solid #E5E5E5', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '5px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#111111', fontSize: 12 }}>
          <option value="">All statuses</option>
          <option>Approved</option><option>Seeded</option><option>Proposed</option>
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          style={{ padding: '5px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#111111', fontSize: 12 }}>
          <option value="">All countries</option>
          {countryGroups.map(g => <option key={g.country} value={g.country}>{g.country}</option>)}
        </select>
        <select value={disciplineFilter} onChange={e => setDisciplineFilter(e.target.value)}
          style={{ padding: '5px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#111111', fontSize: 12 }}>
          <option value="">All disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#999999' }}>
          {countryGroups.length} countr{countryGroups.length !== 1 ? 'ies' : 'y'} · {allocatedPeople.length} people
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {!canEdit && selectedCycle && (
            <span style={{ fontSize: 11, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>
              🔒 Read only
            </span>
          )}
          <button onClick={() => allDeptsCollapsed ? setCollapsedDisciplines(new Set()) : setCollapsedDisciplines(new Set(hierarchy.map(h => h.discipline)))}
            style={{ padding: '4px 10px', background: '#086AE3', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">{allDeptsCollapsed ? <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/> : <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>}</svg>
            Discipline
          </button>
          {canEdit && (
            <button onClick={() => openAddModal()}
              style={{ padding: '4px 12px', background: '#FFFFFF', border: '1px solid #086AE3', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#086AE3', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              + Person
            </button>
          )}
        </div>
      </div>

      {/* ── Error / loading ── */}
      {backendError && (
        <div style={{ padding: '8px 16px', background: '#FFFBEB', borderBottom: '1px solid #F5DFA0', color: '#996600', fontSize: 13, flexShrink: 0 }}>
          ⚠ Cannot reach backend.
          <button onClick={loadData} style={{ marginLeft: 10, padding: '2px 10px', background: 'transparent', border: '1px solid #D4870A', color: '#996600', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Retry</button>
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div className="spinner" />
        </div>
      )}
      {!loading && countryGroups.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 8, color: '#666666' }}>
          <div style={{ fontSize: 16 }}>No projects found for {selectedRegionName || 'this region'}</div>
          <div style={{ fontSize: 13 }}>Add projects in the Projects screen, then assign them to this region and planning cycle.</div>
        </div>
      )}

      {/* ── Main table ── */}
      {!loading && countryGroups.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: LABEL_W }} />
              {countryGroups.map(g =>
                collapsedCountries.has(g.country)
                  ? <col key={g.country} style={{ width: 50 }} />
                  : <col key={g.country} style={{ width: COL_W }} />
              )}
            </colgroup>

            {/* ── Country header ── */}
            <thead>
              <tr>
                {/* Narrow label column header */}
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 4,
                  background: '#1A1A2E',
                  borderRight: '1px solid #333355', borderBottom: '2px solid #333355',
                  width: LABEL_W, minWidth: LABEL_W,
                }} />

                {/* Country columns */}
                {countryGroups.map(g => {
                  const collapsed = collapsedCountries.has(g.country);
                  const flag = flagUrl(g.country);
                  return (
                    <th
                      key={g.country}
                      onMouseEnter={e => !collapsed && setHoveredCountry({ name: g.country, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoveredCountry(null)}
                      onMouseMove={e => !collapsed && setHoveredCountry(prev => prev && prev.name === g.country ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                      onClick={() => toggleCountryCol(g.country)}
                      style={{
                        position: 'sticky', top: 0, zIndex: 3,
                        background: '#111111', color: '#FFFFFF',
                        padding: collapsed ? '8px 4px' : '7px 10px',
                        textAlign: 'center', cursor: 'pointer',
                        borderRight: '1px solid #333333', borderBottom: '2px solid #444444',
                        minWidth: collapsed ? 50 : COL_W, maxWidth: collapsed ? 50 : COL_W,
                        whiteSpace: 'nowrap' as const, overflow: 'hidden',
                      }}
                    >
                      {collapsed ? (
                        <span style={{ fontSize: 9, writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)', display: 'inline-block', color: '#AAAAAA', letterSpacing: '0.05em' }}>
                          {g.country}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', overflow: 'hidden' }}>
                          {flag && <img src={flag} alt="" width={16} height={12} style={{ borderRadius: 2, flexShrink: 0, objectFit: 'cover' }} />}
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{g.country}</span>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 500, flexShrink: 0 }}>Wt {g.totalWeight.toFixed(1)}</span>
                        </div>
                      )}
                    </th>
                  );
                })}

              </tr>
            </thead>

            <tbody>
              {displayedHierarchy.map(h => {
                const dc = DISCIPLINE_COLOURS[h.discipline] ?? DISCIPLINE_COLOURS['Other'];
                const discCollapsed = collapsedDisciplines.has(h.discipline);
                const discTotal = h.allPeople.reduce((s, p) =>
                  s + countryGroups.reduce((cs, g) => cs + (allocMap[p.id]?.[g.countryId] ?? 0), 0), 0);
                const dft = disciplineFooterTotals.find(d => d.discipline === h.discipline);

                return (
                  <React.Fragment key={h.discipline}>
                    {/* White gap row before each discipline section */}
                    <tr>
                      <td colSpan={countryGroups.length + 1} style={{ padding: 0, height: 8, background: '#FFFFFF', borderBottom: '1px solid #E8EAED' }} />
                    </tr>

                    {/* Discipline header row */}
                    <tr>
                      <td colSpan={countryGroups.length + 1} style={{ padding: 0 }}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px',
                            background: dc.bg, color: dc.text,
                            cursor: 'pointer', userSelect: 'none' as const,
                          }}
                          onClick={() => toggleDisc(h.discipline)}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 900, color: dc.text,
                            transform: discCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s',
                            display: 'inline-block', width: 10, textAlign: 'center' as const, flexShrink: 0,
                          }}>▼</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>
                            {h.discipline}
                          </span>
                          <span style={{ fontSize: 10, opacity: 0.75 }}>
                            {h.allPeople.length} people · {discTotal.toFixed(1)} FTE
                          </span>
                          {canEdit && (
                            <button
                              onClick={e => { e.stopPropagation(); openAddModal(h.disciplineId ?? undefined); }}
                              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#FFFFFF', fontSize: 10, fontWeight: 700, padding: '2px 8px', cursor: 'pointer' }}
                            >
                              + Person
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* People: seniors span consecutive alloc runs; non-seniors fill empty cols; multi-country non-seniors at bottom */}
                    {!discCollapsed && (() => {
                      const isSenior = (p: Person) => p.level_code === 'VP' || p.level_code === 'S Dr' || p.level_code === 'Dr';
                      const DARK_PILL = { bg: '#3A3D42', color: '#FFFFFF', border: '#2A2D32' };
                      const getPillStyle = (p: Person) => {
                        const lc = p.level_code ?? '';
                        return (lc === 'VP' || lc === 'S Dr' || lc === 'Dr')
                          ? DARK_PILL
                          : (CONTRACT_PILL[p.contract_type_code ?? ''] ?? CONTRACT_PILL['FTE']);
                      };

                      // Returns runs of consecutive allocated column indices (no first-to-last spanning across gaps)
                      const getRuns = (p: Person) => {
                        const idxs = countryGroups.reduce<number[]>((acc, cg, idx) => {
                          if ((allocMap[p.id]?.[cg.countryId] ?? 0) > 0) acc.push(idx);
                          return acc;
                        }, []);
                        const runs: Array<{ first: number; last: number }> = [];
                        for (const idx of idxs) {
                          if (runs.length === 0 || idx !== runs[runs.length - 1].last + 1) {
                            runs.push({ first: idx, last: idx });
                          } else {
                            runs[runs.length - 1].last = idx;
                          }
                        }
                        return runs;
                      };

                      const claimedSet = (runs: Array<{ first: number; last: number }>) => {
                        const s = new Set<number>();
                        runs.forEach(r => { for (let i = r.first; i <= r.last; i++) s.add(i); });
                        return s;
                      };

                      const contractOrder = (p: Person) => {
                        const code = p.contract_type_code ?? '';
                        if (code.startsWith('A ')) return 1;
                        if (code === 'CON')         return 2;
                        if (code.startsWith('R '))  return 3;
                        return 0;
                      };

                      const seniorPeople = h.allPeople
                        .filter(isSenior)
                        .sort((a, b) => (LEVEL_ORDER[a.level_code ?? ''] ?? 99) - (LEVEL_ORDER[b.level_code ?? ''] ?? 99));

                      const nonSeniorPeople = h.allPeople
                        .filter(p => !isSenior(p))
                        .sort((a, b) => {
                          const ca = contractOrder(a), cb = contractOrder(b);
                          if (ca !== cb) return ca - cb;
                          return (LEVEL_ORDER[a.level_code ?? ''] ?? 99) - (LEVEL_ORDER[b.level_code ?? ''] ?? 99);
                        });

                      const allocColCount = (p: Person) => countryGroups.filter(g => (allocMap[p.id]?.[g.countryId] ?? 0) > 0).length;
                      const regularPeople = nonSeniorPeople.filter(p => allocColCount(p) < 3);
                      const spannerPeople = nonSeniorPeople.filter(p => allocColCount(p) >= 3);

                      type GridRow = {
                        occupied: Set<number>;
                        spans: Array<{ person: Person; runs: Array<{ first: number; last: number }> }>;
                        pills: Map<number, Person>;
                      };
                      const mkRow = (): GridRow => ({ occupied: new Set(), spans: [], pills: new Map() });
                      const fits = (row: GridRow, cols: Set<number>) => !Array.from(cols).some(c => row.occupied.has(c));

                      const rows: GridRow[] = [];

                      // 1. Seniors — first-fit so non-seniors can fill their empty cols
                      for (const p of seniorPeople) {
                        const runs = getRuns(p);
                        if (runs.length === 0) continue;
                        const claimed = claimedSet(runs);
                        const found = rows.find(r => fits(r, claimed));
                        const row = found ?? (() => { const nr = mkRow(); rows.push(nr); return nr; })();
                        claimed.forEach(c => row.occupied.add(c));
                        row.spans.push({ person: p, runs });
                      }

                      // 2. Regular non-senior — first-fit (fills empty cols in senior rows or creates new rows)
                      for (const p of regularPeople) {
                        const runs = getRuns(p);
                        if (runs.length === 0) continue;
                        const claimed = claimedSet(runs);
                        const found = rows.find(r => fits(r, claimed));
                        const row = found ?? (() => { const nr = mkRow(); rows.push(nr); return nr; })();
                        claimed.forEach(c => row.occupied.add(c));
                        runs.forEach(run => { for (let i = run.first; i <= run.last; i++) row.pills.set(i, p); });
                      }

                      // 3. Non-senior spanners (3+ countries) — always at the bottom in their own rows
                      for (const p of spannerPeople) {
                        const runs = getRuns(p);
                        if (runs.length === 0) continue;
                        const claimed = claimedSet(runs);
                        const nr = mkRow();
                        claimed.forEach(c => nr.occupied.add(c));
                        nr.spans.push({ person: p, runs });
                        rows.push(nr);
                      }

                      return rows.map((row, ri) => {
                        const rowBg = ri % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                        const cells: React.ReactElement[] = [];
                        let ci = 0;
                        while (ci < countryGroups.length) {
                          const g = countryGroups[ci];
                          let handled = false;
                          for (const se of row.spans) {
                            const run = se.runs.find(r => r.first === ci);
                            if (run) {
                              const ps = getPillStyle(se.person);
                              const w = run.last - run.first + 1;
                              cells.push(
                                <td key={`s${se.person.id}-${ci}`} colSpan={w} style={{ padding: '3px 4px', borderRight: '1px solid #E0E3E8', borderBottom: '1px solid #EEF0F3', background: rowBg }}>
                                  <div
                                    onClick={() => openEditModal(se.person)}
                                    onMouseEnter={e => { setHoveredPill({ personId: se.person.id, x: e.clientX, y: e.clientY }); fetchLatestComment(se.person.id); }}
                                    onMouseMove={e => setHoveredPill(prev => prev?.personId === se.person.id ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                                    onMouseLeave={() => setHoveredPill(null)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', borderRadius: 6, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' as const, width: '100%', boxSizing: 'border-box' as const }}
                                  >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' as const }}>{se.person.name}</span>
                                  </div>
                                </td>
                              );
                              ci = run.last + 1;
                              handled = true;
                              break;
                            }
                          }
                          if (!handled) {
                            const pill = row.pills.get(ci);
                            const collapsed = collapsedCountries.has(g.country);
                            if (pill) {
                              const ps = getPillStyle(pill);
                              cells.push(
                                <td key={`p${g.countryId}`} style={{ padding: collapsed ? '4px 2px' : '3px 4px', borderRight: '1px solid #E0E3E8', borderBottom: '1px solid #EEF0F3', background: rowBg }}>
                                  {!collapsed && (
                                    <div
                                      onClick={() => openEditModal(pill)}
                                      onMouseEnter={e => { setHoveredPill({ personId: pill.id, x: e.clientX, y: e.clientY }); fetchLatestComment(pill.id); }}
                                      onMouseMove={e => setHoveredPill(prev => prev?.personId === pill.id ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                                      onMouseLeave={() => setHoveredPill(null)}
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', borderRadius: 6, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' as const, width: '100%', boxSizing: 'border-box' as const }}
                                    >
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' as const }}>{pill.name}</span>
                                    </div>
                                  )}
                                </td>
                              );
                            } else {
                              cells.push(
                                <td key={`e${g.countryId}`} style={{ padding: '4px 2px', borderRight: '1px solid #E0E3E8', borderBottom: '1px solid #EEF0F3', background: rowBg }} />
                              );
                            }
                            ci++;
                          }
                        }
                        return (
                          <tr key={ri} style={{ background: rowBg }}>
                            <td style={{ position: 'sticky', left: 0, zIndex: 2, background: rowBg, width: LABEL_W, minWidth: LABEL_W, borderRight: '1px solid #E0E3E8', borderBottom: '1px solid #EEF0F3' }} />
                            {cells}
                          </tr>
                        );
                      });
                    })()}

                    {/* ── Per-discipline Proposed / Min / Max rows ── */}
                    {!discCollapsed && dft && (
                      [
                        { label: 'Proposed',   key: 'proposed' as const, isProposed: true  },
                        { label: 'Min Target', key: 'min'      as const, isProposed: false },
                        { label: 'Max Target', key: 'max'      as const, isProposed: false },
                      ].map(({ label, key, isProposed }) => {
                        const rowTotal = dft.countries.reduce((s, c) => s + c[key], 0);
                        const rowBg = isProposed ? '#FFFFFF' : '#F8F9FB';
                        return (
                          <tr key={label} style={{ background: rowBg }}>
                            <td style={{ position: 'sticky', left: 0, zIndex: 2, background: rowBg, padding: '4px 8px', borderTop: isProposed ? '2px solid #D0D4DA' : '1px solid #ECEEF2', borderRight: '1px solid #DEE2E8', borderBottom: '1px solid #ECEEF2' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                <span style={{ fontSize: 10, fontWeight: isProposed ? 700 : 400, color: isProposed ? '#111111' : '#5A6270', whiteSpace: 'nowrap' as const }}>{label}</span>
                                {rowTotal > 0 && <span style={{ fontSize: 10, fontWeight: isProposed ? 700 : 400, color: isProposed ? '#111111' : '#5A6270' }}>{rowTotal.toFixed(1)}</span>}
                              </div>
                            </td>
                            {countryGroups.map(g => {
                              const ft = dft.countries.find(c => c.countryId === g.countryId);
                              const val = ft ? ft[key] : 0;
                              const collapsed = collapsedCountries.has(g.country);
                              return (
                                <td key={g.country} style={{ padding: collapsed ? '4px 2px' : '4px 6px', textAlign: 'center', background: rowBg, borderTop: isProposed ? '2px solid #D0D4DA' : '1px solid #ECEEF2', borderRight: '1px solid #ECEEF2', borderBottom: '1px solid #ECEEF2' }}>
                                  {!collapsed && (val > 0
                                    ? <span style={{ fontSize: 10, fontWeight: isProposed ? 700 : 400, color: isProposed ? '#111111' : '#5A6270' }}>{val.toFixed(1)}</span>
                                    : <span style={{ fontSize: 9, color: '#D0D4DA' }}>—</span>)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

          </table>

          {allocatedPeople.length === 0 && !loading && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#888888', fontSize: 13 }}>
              No people allocated yet — use <strong>+ Person</strong> to add allocations.
            </div>
          )}
        </div>
      )}

      {/* ── Country hover tooltip ── */}
      {hoveredCountry && (() => {
        const group = countryGroups.find(g => g.country === hoveredCountry.name);
        if (!group) return null;

        const sortedProjects = [...group.projects].sort((a, b) => {
          const order = ['Approved', 'Seeded', 'Proposed'];
          return (order.indexOf(a.status) === -1 ? 99 : order.indexOf(a.status)) -
                 (order.indexOf(b.status) === -1 ? 99 : order.indexOf(b.status));
        });

        const allocatedPeople = allPeople
          .filter(p => (allocMap[p.id]?.[group.countryId] ?? 0) > 0)
          .sort((a, b) => {
            const lo = (c: string) => LEVEL_ORDER[c] ?? 99;
            return lo(a.level_code ?? '') - lo(b.level_code ?? '');
          });

        const totalFte = allocatedPeople.reduce((s, p) => s + (allocMap[p.id]?.[group.countryId] ?? 0), 0);

        if (sortedProjects.length === 0 && allocatedPeople.length === 0) return null;

        return (
          <div style={{
            position: 'fixed', zIndex: 999,
            left: Math.min(hoveredCountry.x + 12, window.innerWidth - 280),
            top: Math.min(hoveredCountry.y + 12, window.innerHeight - 300),
            background: '#1A1A2E', color: '#FFFFFF',
            border: '1px solid #333355', borderRadius: 8,
            padding: '10px 12px', minWidth: 240, maxWidth: 300,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none' as const,
          }}>

            {/* Projects section */}
            {sortedProjects.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>
                  {group.country} — {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
                </div>
                {sortedProjects.map(proj => (
                  <div key={proj.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOURS[proj.status] ?? '#888' }} />
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{proj.name}</span>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: STATUS_COLOURS[proj.status] ?? '#888', color: '#FFF', fontWeight: 700, flexShrink: 0 }}>{proj.status}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>Wt {proj.weight}</span>
                  </div>
                ))}
              </>
            )}

            {/* People section */}
            {allocatedPeople.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: sortedProjects.length > 0 ? 10 : 0, marginBottom: 6, borderTop: sortedProjects.length > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingTop: sortedProjects.length > 0 ? 8 : 0 }}>
                  {sortedProjects.length === 0 ? `${group.country} — ` : ''}{allocatedPeople.length} person{allocatedPeople.length !== 1 ? 's' : ''} · {totalFte.toFixed(2)} FTE
                </div>
                {allocatedPeople.slice(0, 8).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</span>
                    {p.level_code && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', fontWeight: 600, flexShrink: 0 }}>{p.level_code}</span>
                    )}
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', flexShrink: 0, minWidth: 34, textAlign: 'right' }}>
                      {(allocMap[p.id]?.[group.countryId] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
                {allocatedPeople.length > 8 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>+{allocatedPeople.length - 8} more</div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── Person pill hover tooltip ── */}
      {hoveredPill && (() => {
        const hovP = allPeople.find(p => p.id === hoveredPill.personId);
        if (!hovP) return null;
        const cachedComment = commentCache[hoveredPill.personId];
        return (
          <div style={{
            position: 'fixed', zIndex: 1000,
            left: Math.min(hoveredPill.x + 14, window.innerWidth - 270),
            top: hoveredPill.y + 14,
            background: '#1A1A2E', color: '#FFFFFF',
            border: '1px solid #333355', borderRadius: 8,
            padding: '10px 14px', minWidth: 200, maxWidth: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none' as const,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{hovP.name}</span>
              {hovP.level_code && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.15)', fontWeight: 700 }}>{hovP.level_code}</span>
              )}
            </div>
            {hovP.discipline_name && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>{hovP.discipline_name}{hovP.contract_type_code ? ` · ${hovP.contract_type_code}` : ''}</div>
            )}
            {/* Country allocations */}
            {(() => {
              const personAllocs = countryGroups
                .map(g => ({ country: g.country, countryId: g.countryId, val: allocMap[hovP.id]?.[g.countryId] ?? 0 }))
                .filter(a => a.val > 0);
              if (personAllocs.length === 0) return null;
              return (
                <div style={{ borderTop: '1px solid #2E2E50', paddingTop: 8, marginBottom: 6 }}>
                  {personAllocs.map(a => {
                    const f = flagUrl(a.country);
                    return (
                      <div key={a.countryId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {f && <img src={f} alt="" width={14} height={10} style={{ borderRadius: 1, objectFit: 'cover', flexShrink: 0 }} />}
                        <span style={{ fontSize: 11, flex: 1, color: 'rgba(255,255,255,0.85)' }}>{a.country}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#7BC8FF', flexShrink: 0 }}>
                          {a.val % 1 === 0 ? a.val.toFixed(0) : a.val.toFixed(2)} FTE
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {cachedComment === undefined && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', borderTop: '1px solid #2E2E50', paddingTop: 6 }}>Loading…</div>
            )}
            {cachedComment === '…' && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', borderTop: '1px solid #2E2E50', paddingTop: 6 }}>Loading…</div>
            )}
            {cachedComment !== undefined && cachedComment !== '…' && cachedComment.length > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', borderTop: '1px solid #2E2E50', paddingTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                {cachedComment}
              </div>
            )}
            {cachedComment !== undefined && cachedComment !== '…' && cachedComment.length === 0 && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', borderTop: '1px solid #2E2E50', paddingTop: 6 }}>No comments</div>
            )}
          </div>
        );
      })()}

      {/* ── Add / Edit Person Modal ── */}
      {addModal !== null && (() => {
        const saveDisabled = !modalPersonId || modalSaving ||
          (allocMode === 'equal' ? equalCountries.size === 0 : modalTotal > 1.001);
        const selPerson = lockedPerson ?? allPeople.find(p => p.id === Number(modalPersonId));

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <div style={{
              background: '#FFFFFF', borderRadius: 10, width: '100%', maxWidth: 500,
              maxHeight: '88vh', overflowY: 'auto',
              padding: '24px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              border: '1px solid #E0E0E0',
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111111' }}>
                Add / Edit Person
              </h2>

              {/* Person selector — dropdown when new, locked display when editing */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Person
                </label>
                {lockedPerson ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F5F7FA', border: '1px solid #E0E0E0', borderRadius: 4 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#111111' }}>{lockedPerson.name}</span>
                    {lockedPerson.level_code && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#E8EAF6', color: '#3949AB', fontWeight: 700 }}>{lockedPerson.level_code}</span>}
                    {lockedPerson.discipline_name && <span style={{ fontSize: 10, color: '#5A657B' }}>{lockedPerson.discipline_name}</span>}
                  </div>
                ) : (
                  <select
                    value={modalPersonId}
                    onChange={e => {
                      const pid = Number(e.target.value);
                      setModalPersonId(pid || '');
                      if (pid) {
                        const existing: Record<number, string> = {};
                        for (const a of countryAllocs.filter(a => a.person_id === pid)) {
                          existing[a.country_id] = String(a.fte_value);
                        }
                        setModalAllocs(existing);
                        setAllocMode(Object.keys(existing).length > 0 ? 'custom' : 'equal');
                        setEqualCountries(new Set());
                      } else {
                        setModalAllocs({});
                        setAllocMode('equal');
                        setEqualCountries(new Set());
                      }
                    }}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 13, color: '#111111', background: '#FFFFFF', outline: 'none' }}
                  >
                    <option value="">— Select a person —</option>
                    {modalPeople.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.level_code ? `(${p.level_code})` : ''} {p.discipline_name ? `· ${p.discipline_name}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {/* Quick link to full person details */}
                {selPerson && (
                  <button
                    type="button"
                    onClick={() => { closeModal(); setEditPerson(selPerson); }}
                    style={{ marginTop: 6, width: '100%', padding: '6px 0', background: '#F0F4FF', border: '1px solid #BFD0FF', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#086AE3', cursor: 'pointer', textAlign: 'center' as const }}
                  >
                    ✏ Edit Full Details (Role type, TBH Code, Notes…)
                  </button>
                )}
              </div>

              {/* Allocation mode toggle */}
              {countryGroups.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    Allocation mode
                  </label>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 6, border: '1px solid #D5D5D5', overflow: 'hidden', width: 'fit-content' }}>
                    {(['equal', 'custom'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setAllocMode(mode)}
                        style={{
                          padding: '6px 18px', border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                          background: allocMode === mode ? '#E91C24' : '#FFFFFF',
                          color: allocMode === mode ? '#FFFFFF' : '#555555',
                          borderRight: mode === 'equal' ? '1px solid #D5D5D5' : 'none',
                          transition: 'background 0.1s, color 0.1s',
                        }}
                      >
                        {mode === 'equal' ? 'Equal' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Equal mode — country checkboxes */}
              {countryGroups.length > 0 && allocMode === 'equal' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600, marginBottom: 8 }}>
                    Select countries (1.0 FTE split equally)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {countryGroups.map(g => {
                      const flag = flagUrl(g.country);
                      const checked = equalCountries.has(g.countryId);
                      const perFte = equalCountries.size > 0 ? 1.0 / equalCountries.size : 0;
                      return (
                        <label key={g.country} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '5px 8px', borderRadius: 4, background: checked ? '#FEF2F2' : '#F9F9F9', border: `1px solid ${checked ? '#E91C24' : '#E8E8E8'}` }}>
                          <input
                            type="checkbox" checked={checked}
                            onChange={() => setEqualCountries(prev => { const n = new Set(prev); n.has(g.countryId) ? n.delete(g.countryId) : n.add(g.countryId); return n; })}
                            style={{ accentColor: '#E91C24', width: 14, height: 14, flexShrink: 0 }}
                          />
                          {flag && <img src={flag} alt="" width={16} height={12} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />}
                          <span style={{ fontSize: 13, color: '#111111', flex: 1 }}>{g.country}</span>
                          {checked && <span style={{ fontSize: 11, fontWeight: 700, color: '#E91C24', flexShrink: 0 }}>{perFte.toFixed(2)} FTE</span>}
                        </label>
                      );
                    })}
                  </div>
                  {equalCountries.size > 0 && (
                    <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 5, background: '#F0FFF4', border: '1px solid #33A85C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#444444' }}>{equalCountries.size} countr{equalCountries.size !== 1 ? 'ies' : 'y'} · Total FTE</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1A7A40' }}>1.00</span>
                    </div>
                  )}
                </div>
              )}

              {/* Custom mode — per-country number inputs */}
              {countryGroups.length > 0 && allocMode === 'custom' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600, marginBottom: 8 }}>
                    Country allocations (total must be ≤ 1.0)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {countryGroups.map(g => {
                      const flag = flagUrl(g.country);
                      const val = modalAllocs[g.countryId] ?? '';
                      return (
                        <div key={g.country} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                            {flag && <img src={flag} alt="" width={16} height={12} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />}
                            <span style={{ fontSize: 13, color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{g.country}</span>
                            <span style={{ fontSize: 10, color: '#888', marginLeft: 4, flexShrink: 0 }}>Wt {g.totalWeight.toFixed(1)}</span>
                          </div>
                          <input
                            type="number" min="0" max="1" step="0.1"
                            value={val}
                            onChange={e => setModalAllocs(prev => ({ ...prev, [g.countryId]: e.target.value }))}
                            placeholder="0.0"
                            style={{ width: 70, padding: '5px 8px', border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 13, textAlign: 'center' as const, outline: 'none' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{
                    marginTop: 10, padding: '6px 10px', borderRadius: 5,
                    background: modalTotal > 1.001 ? '#FFF0F0' : modalTotal > 0 ? '#F0FFF4' : '#F5F5F5',
                    border: `1px solid ${modalTotal > 1.001 ? '#E91C24' : modalTotal > 0 ? '#33A85C' : '#E0E0E0'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#444444' }}>Total FTE</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: modalTotal > 1.001 ? '#AD050C' : modalTotal > 0 ? '#1A7A40' : '#888888' }}>
                      {modalTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={closeModal} style={{ flex: 1, padding: '9px 0', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 5, fontSize: 13, color: '#555555', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={saveModalAllocs}
                  disabled={saveDisabled}
                  style={{
                    flex: 2, padding: '9px 0', background: '#E91C24', border: 'none', borderRadius: 5,
                    fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                    cursor: saveDisabled ? 'default' : 'pointer',
                    opacity: saveDisabled ? 0.5 : 1,
                  }}
                >
                  {modalSaving ? 'Saving…' : 'Save Allocations'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Person edit panel (with country allocs + comments) ── */}
      {editPerson && (
        <PersonEditPanel
          person={editPerson}
          onClose={() => setEditPerson(null)}
          onSaved={updated => {
            setAllPeople(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditPerson(null);
          }}
          countryAllocs={countryAllocs.filter(a => a.person_id === editPerson.id)}
          countryGroups={countryGroups.map(g => ({ countryId: g.countryId, countryName: g.country }))}
          selectedCycleId={selectedCycleId ?? null}
          onAllocsSaved={loadData}
        />
      )}
    </div>
  );
}
