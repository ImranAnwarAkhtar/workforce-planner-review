import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  projectsApi, projectCommentsApi, refDataApi, STAGE_EDIT_ROLES,
  type Project, type Region, type Country,
  type CreateProjectBody, type ProjectComment,
} from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';

// Role assumed in dev-bypass auth — update when real auth is added
const CURRENT_USER_ROLE = 'Workforce Planning';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_TYPES    = ['Retail', 'xScale', 'Matrix'] as const;
const PROJECT_STATUSES = ['Approved', 'Seeded', 'Proposed'] as const;
const WEIGHT_OPTIONS   = [0.5, 1.0, 1.5, 2.0] as const;
const STATUS_ORDER     = { Approved: 0, Seeded: 1, Proposed: 2 } as const;
const COUNTRY_ORDER    = ['Japan','Australia','Singapore','Indonesia','Malaysia','China','South Korea','India','Philippines','Thailand'];
const COL_W            = 185; // column / card width in px

type ProjectType   = typeof PROJECT_TYPES[number];
type ProjectStatus = typeof PROJECT_STATUSES[number];

const STATUS_META: Record<string, { color: string; bg: string; border: string; dot: string; barBg: string; pill: string }> = {
  'Approved': { color: '#FFFFFF', bg: '#FAC3C5', border: '#E91C24', dot: '#E91C24', barBg: '#AD050C', pill: '#E91C24' },
  'Seeded':   { color: '#FFFFFF', bg: '#E9DBFF', border: '#7739D9', dot: '#7739D9', barBg: '#411980', pill: '#7739D9' },
  'Proposed': { color: '#FFFFFF', bg: '#CCE3FF', border: '#086AE3', dot: '#086AE3', barBg: '#00408C', pill: '#086AE3' },
};

const TYPE_META: Record<ProjectType, { color: string; bg: string; border: string }> = {
  Retail:  { color: '#086AE3', bg: '#CCE3FF', border: '#086AE3' },
  xScale:  { color: '#7739D9', bg: '#E9DBFF', border: '#7739D9' },
  Matrix:  { color: '#411980', bg: '#EDCCFF', border: '#411980' },
};

function statusMeta(s: string) {
  return STATUS_META[s] ?? { color: '#FFFFFF', bg: '#F5F5F5', border: '#DDDDDD', dot: '#AAAAAA', barBg: '#333333', pill: '#666666' };
}
function typeMeta(t: string) {
  return TYPE_META[t as ProjectType] ?? { color: '#555555', bg: '#F0F0F0', border: '#D5D5D5' };
}

// ISO 3166-1 alpha-2 codes for flagcdn.com — covers all Equinix-present countries
const COUNTRY_FLAGS: Record<string, string> = {
  'Australia':              'au', 'Austria':             'at', 'Bahrain':         'bh',
  'Belgium':                'be', 'Brazil':              'br', 'Bulgaria':        'bg',
  'Canada':                 'ca', 'Chile':               'cl', 'China':           'cn',
  'Colombia':               'co', 'Costa Rica':         'cr', 'Croatia':         'hr',
  'Czech Republic':         'cz', 'Denmark':            'dk', 'Egypt':           'eg',
  'Finland':                'fi', 'France':             'fr', 'Germany':         'de',
  'Greece':                 'gr', 'Hong Kong':          'hk', 'Hungary':         'hu',
  'India':                  'in', 'Indonesia':          'id', 'Ireland':         'ie',
  'Israel':                 'il', 'Italy':              'it', 'Japan':           'jp',
  'Jordan':                 'jo', 'Kazakhstan':         'kz', 'Kenya':           'ke',
  'Kuwait':                 'kw', 'Luxembourg':         'lu', 'Malaysia':        'my',
  'Mexico':                 'mx', 'Morocco':            'ma', 'Netherlands':     'nl',
  'New Zealand':            'nz', 'Nigeria':            'ng', 'Norway':          'no',
  'Oman':                   'om', 'Panama':             'pa', 'Peru':            'pe',
  'Philippines':            'ph', 'Poland':             'pl', 'Portugal':        'pt',
  'Qatar':                  'qa', 'Romania':            'ro', 'Russia':          'ru',
  'Saudi Arabia':           'sa', 'Serbia':             'rs', 'Singapore':       'sg',
  'Slovakia':               'sk', 'South Africa':       'za', 'South Korea':     'kr',
  'Spain':                  'es', 'Sweden':             'se', 'Switzerland':     'ch',
  'Taiwan':                 'tw', 'Thailand':           'th', 'Turkey':          'tr',
  'Ukraine':                'ua', 'United Arab Emirates':'ae', 'United Kingdom':  'gb',
  'United States':          'us', 'Vietnam':            'vn',
  // common abbreviations / alternates
  'UK': 'gb', 'USA': 'us', 'UAE': 'ae', 'Korea': 'kr',
};

function flagUrl(country: string, w: 20 | 40 = 20): string | null {
  const code = COUNTRY_FLAGS[country];
  return code ? `https://flagcdn.com/w${w}/${code}.png` : null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  page:        { color: '#111111', height: '100%', display: 'flex', flexDirection: 'column' } as React.CSSProperties,
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 } as React.CSSProperties,
  title:       { fontSize: 24, fontWeight: 700, margin: 0, color: '#111111' } as React.CSSProperties,
  accent:      { width: 40, height: 3, background: '#E91C24', borderRadius: 2, marginTop: 6 } as React.CSSProperties,
  btnPrimary:  { padding: '9px 18px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 } as React.CSSProperties,
  btnCompact:  { padding: '4px 10px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 } as React.CSSProperties,
  btnSecondary:{ padding: '9px 18px', background: 'transparent', color: '#555555', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 14, cursor: 'pointer' } as React.CSSProperties,

  statsRow:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 20 } as React.CSSProperties,
  statCard:    (accent: string) => ({ background: '#FFFFFF', border: '1px solid #E5E5E5', borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as React.CSSProperties),
  statNum:     { fontSize: 22, fontWeight: 700, color: '#111111', lineHeight: 1 } as React.CSSProperties,
  statLabel:   { fontSize: 10, color: '#888888', marginTop: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' } as React.CSSProperties,

  toolbar:     { display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' as const, alignItems: 'center' } as React.CSSProperties,
  searchWrap:  { position: 'relative' as const, flex: '1 1 160px', maxWidth: 220 } as React.CSSProperties,
  searchInput: { width: '100%', padding: '6px 10px 6px 28px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, outline: 'none' } as React.CSSProperties,
  searchIcon:  { position: 'absolute' as const, left: 8, top: '50%', transform: 'translateY(-50%)', color: '#999', pointerEvents: 'none' as const },
  filterSel:   { padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' } as React.CSSProperties,

  centerBox:   { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#999' } as React.CSSProperties,

  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal:       (wide?: boolean) => ({ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 10, width: '100%', maxWidth: wide ? 620 : 540, maxHeight: '90vh', overflowY: 'auto' as const, padding: '28px 32px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' } as React.CSSProperties),
  modalTitle:  { fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#111111' } as React.CSSProperties,
  fg:          { marginBottom: 16 } as React.CSSProperties,
  lbl:         { display: 'block', fontSize: 11, fontWeight: 700, color: '#666666', marginBottom: 5, letterSpacing: '0.08em', textTransform: 'uppercase' as const } as React.CSSProperties,
  inp:         { width: '100%', padding: '9px 12px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  sel:         { width: '100%', padding: '9px 12px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' as const } as React.CSSProperties,
  row2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
  row3:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } as React.CSSProperties,
  mFooter:     { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid #EEEEEE' } as React.CSSProperties,

  badge: (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
    letterSpacing: '0.03em', background: bg, color, border: `1px solid ${border}`,
    whiteSpace: 'nowrap' as const,
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DeltaBadge({ a, b, size = 10, isFloat = false }: { a: number; b: number; size?: number; isFloat?: boolean }) {
  const d = b - a;
  if (Math.abs(d) < 0.05) return <span style={{ fontSize: size, color: '#BDC1CA' }}>● 0</span>;
  const up = d > 0;
  const dStr = isFloat ? Math.abs(d).toFixed(1) : String(Math.round(Math.abs(d)));
  return <span style={{ fontSize: size, fontWeight: 700, color: up ? '#33A85C' : '#E91C24' }}>{up ? '▲' : '▼'} {dStr}</span>;
}

function groupByCountry(projects: Project[]): [string, Project[]][] {
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.country_name ?? 'Unassigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  map.forEach(list => {
    list.sort((a, b) => {
      const sd = (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 9)
               - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 9);
      return sd !== 0 ? sd : a.name.localeCompare(b.name);
    });
  });
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    const ia = COUNTRY_ORDER.indexOf(a), ib = COUNTRY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  name: string; type: string; status: string; weight: string;
  year: string; region_id: string; country_id: string; metro: string; phase_code: string;
}

const emptyForm: FormState = {
  name: '', type: 'Retail', status: 'Proposed', weight: '1.0',
  year: String(new Date().getFullYear()),
  region_id: '', country_id: '', metro: '', phase_code: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Projects() {
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [regions,   setRegions]   = useState<Region[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<Country[]>([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const { cycles, selectedCycleId, setSelectedCycleId, selectedRegionId, setSelectedRegionId } = usePlanningCycle();

  const selectedCycle = cycles.find(c => c.id === selectedCycleId);
  const canEdit = !selectedCycle || (STAGE_EDIT_ROLES[selectedCycle.status]?.includes(CURRENT_USER_ROLE) ?? true);

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [typeFilter,     setTypeFilter]     = useState('');
  const [countryFilter,  setCountryFilter]  = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState<'true' | 'false' | 'all'>('true');

  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set(PROJECT_STATUSES));

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<Project | null>(null);
  const [form,         setForm]         = useState<FormState>(emptyForm);
  const [nameError,    setNameError]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const [comments,        setComments]        = useState<ProjectComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError,   setCommentsError]   = useState(false);
  const [newComment,      setNewComment]      = useState('');
  const [postingComment,  setPostingComment]  = useState(false);

  const [hoveredCell, setHoveredCell] = useState<{ country: string; status: string } | null>(null);

  const [compCycleId,  setCompCycleId]  = useState<number | null>(null);
  const [compProjects, setCompProjects] = useState<Project[]>([]);

  useEffect(() => {
    Promise.all([
      refDataApi.regions().catch(() => [] as Region[]),
      refDataApi.countries().catch(() => [] as Country[]),
    ]).then(([r, c]) => { setRegions(r); setCountries(c); });
  }, []);

  useEffect(() => {
    setFilteredCountries(
      form.region_id
        ? countries.filter(c => String(c.region_id) === form.region_id)
        : countries
    );
  }, [form.region_id, countries]);

  const loadProjects = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setProjects(await projectsApi.list({
        is_active: isActiveFilter,
        limit: 500,
        ...(selectedCycleId ? { planning_cycle_id: selectedCycleId } : {}),
      }));
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [isActiveFilter, selectedCycleId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

useEffect(() => {
    if (!compCycleId) { setCompProjects([]); return; }
    projectsApi.list({ is_active: isActiveFilter, limit: 500, planning_cycle_id: compCycleId })
      .then(setCompProjects).catch(() => setCompProjects([]));
  }, [compCycleId, isActiveFilter]);

  const allCountries = useMemo(() => {
    const source = selectedRegionId
      ? projects.filter(p => p.region_id === selectedRegionId)
      : projects;
    const names = Array.from(new Set(source.map(p => p.country_name ?? 'Unassigned')));
    return names.sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [projects, selectedRegionId]);

  const filtered = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.region_name   ?? '').toLowerCase().includes(q) ||
        (p.country_name  ?? '').toLowerCase().includes(q) ||
        (p.phase_code    ?? '').toLowerCase().includes(q) ||
        (p.metro         ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter)    list = list.filter(p => p.status === statusFilter);
    if (typeFilter)      list = list.filter(p => p.type   === typeFilter);
    if (selectedRegionId) list = list.filter(p => p.region_id === selectedRegionId);
    if (countryFilter)   list = list.filter(p => (p.country_name ?? 'Unassigned') === countryFilter);
    return list;
  }, [projects, search, statusFilter, typeFilter, selectedRegionId, countryFilter]);

  // Country groups and derived matrix for the aligned-row layout
  const countryGroups = useMemo(() => groupByCountry(filtered), [filtered]);
  const countriesList = useMemo(() => countryGroups.map(([c]) => c), [countryGroups]);

  // projectMatrix[country][status] = sorted Project[]
  const projectMatrix = useMemo(() => {
    const m: Record<string, Record<string, Project[]>> = {};
    for (const [country, projs] of countryGroups) {
      m[country] = {
        Approved: projs.filter(p => p.status === 'Approved'),
        Seeded:   projs.filter(p => p.status === 'Seeded'),
        Proposed: projs.filter(p => p.status === 'Proposed'),
      };
    }
    return m;
  }, [countryGroups]);

  // Per-country summary stats (includes per-status breakdown for totals row)
  const countryStats = useMemo(() => {
    const s: Record<string, {
      total: number; retail: number; xscale: number; matrix: number; weight: number;
      approved: number; seeded: number; proposed: number;
    }> = {};
    for (const [country, projs] of countryGroups) {
      s[country] = {
        total:    projs.length,
        retail:   projs.filter(p => p.type === 'Retail').length,
        xscale:   projs.filter(p => p.type === 'xScale').length,
        matrix:   projs.filter(p => p.type === 'Matrix').length,
        weight:   projs.reduce((sum, p) => sum + (Number(p.weight) || 1), 0),
        approved: projs.filter(p => p.status === 'Approved').length,
        seeded:   projs.filter(p => p.status === 'Seeded').length,
        proposed: projs.filter(p => p.status === 'Proposed').length,
      };
    }
    return s;
  }, [countryGroups]);

  const stats = useMemo(() => {
    const all = projects;
    return {
      total:       all.length,
      approved:    all.filter(p => p.status === 'Approved').length,
      seeded:      all.filter(p => p.status === 'Seeded').length,
      proposed:    all.filter(p => p.status === 'Proposed').length,
      retail:      all.filter(p => p.type === 'Retail').length,
      xscale:      all.filter(p => p.type === 'xScale').length,
      totalWeight: all.reduce((s, p) => s + (Number(p.weight) || 1), 0),
    };
  }, [projects]);

  const compStats = useMemo(() => {
    const all = compProjects;
    return {
      total:       all.length,
      approved:    all.filter(p => p.status === 'Approved').length,
      seeded:      all.filter(p => p.status === 'Seeded').length,
      proposed:    all.filter(p => p.status === 'Proposed').length,
      retail:      all.filter(p => p.type === 'Retail').length,
      xscale:      all.filter(p => p.type === 'xScale').length,
      totalWeight: all.reduce((s, p) => s + (Number(p.weight) || 1), 0),
    };
  }, [compProjects]);

  function toggleStatus(status: string) {
    setCollapsedStatuses(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  }

  function openAdd() {
    setEditTarget(null); setForm(emptyForm); setNameError(''); setModalOpen(true);
  }

  function openAddPreset(country: string, status: string) {
    const countryObj = countries.find(c => c.name === country);
    const cycle      = cycles.find(c => c.id === selectedCycleId);
    const year       = (cycle && /^\d{4}$/.test(cycle.name)) ? cycle.name : String(new Date().getFullYear());
    setEditTarget(null);
    setForm({ ...emptyForm, status, year,
      country_id: countryObj ? String(countryObj.id) : '',
      region_id:  countryObj ? String(countryObj.region_id) : '',
    });
    setNameError(''); setModalOpen(true);
  }

  function openEdit(p: Project) {
    setEditTarget(p);
    setForm({
      name:       p.name,
      type:       PROJECT_TYPES.includes(p.type as ProjectType) ? p.type : 'Retail',
      status:     PROJECT_STATUSES.includes(p.status as ProjectStatus) ? p.status : 'Proposed',
      weight:     String(p.weight),
      year:       p.year ? String(p.year) : '',
      region_id:  p.region_id  ? String(p.region_id)  : '',
      country_id: p.country_id ? String(p.country_id) : '',
      metro:      p.metro      ?? '',
      phase_code: p.phase_code ?? '',
    });
    setNameError(''); setNewComment('');
    setComments([]); setCommentsError(false); setModalOpen(true);
  }

  // Fetch comments whenever the edit modal opens for a specific project
  const [commentsFetchTick, setCommentsFetchTick] = useState(0);
  useEffect(() => {
    if (!editTarget || !modalOpen) return;
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError(false);
    projectCommentsApi.list(editTarget.id)
      .then(data => { if (!cancelled) { setComments(data); setCommentsError(false); } })
      .catch(() => { if (!cancelled) { setComments([]); setCommentsError(true); } })
      .finally(() => { if (!cancelled) setCommentsLoading(false); });
    return () => { cancelled = true; };
  }, [editTarget?.id, modalOpen, commentsFetchTick]);

  function setField(key: keyof FormState, value: string) {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === 'region_id') next.country_id = '';
      return next;
    });
    if (key === 'name') setNameError('');
  }

  async function handleSave() {
    if (!form.name.trim()) { setNameError('Name is required'); return; }
    setSaving(true);
    try {
      const body: CreateProjectBody = {
        name:              form.name.trim(),
        type:              form.type,
        status:            form.status,
        weight:            parseFloat(form.weight) || 1.0,
        year:              form.year ? parseInt(form.year, 10) : null,
        region_id:         form.region_id  ? parseInt(form.region_id,  10) : null,
        country_id:        form.country_id ? parseInt(form.country_id, 10) : null,
        metro:             form.metro.trim()      || null,
        phase_code:        form.phase_code.trim() || null,
        planning_cycle_id: selectedCycleId ?? null,
      };
      if (editTarget) { await projectsApi.update(editTarget.id, body); }
      else            { await projectsApi.create(body); }
      setModalOpen(false);
      loadProjects();
    } finally { setSaving(false); }
  }

  async function postComment() {
    if (!newComment.trim() || !editTarget) return;
    setPostingComment(true);
    try {
      const created = await projectCommentsApi.create(editTarget.id, newComment.trim());
      setComments(prev => [...prev, created]);
      setNewComment('');
    } finally { setPostingComment(false); }
  }

  async function handleDeactivate() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await projectsApi.deactivate(deleteTarget.id);
      setDeleteTarget(null);
      loadProjects();
    } finally { setDeleting(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const statItems: { label: string; metric: string; curr: number; comp: number; color: string; isFloat?: boolean }[] = [
    { label: 'Total',    metric: 'count', curr: stats.total,       comp: compStats.total,       color: '#2F3541' },
    { label: 'Approved', metric: 'count', curr: stats.approved,    comp: compStats.approved,    color: '#E91C24' },
    { label: 'Seeded',   metric: 'count', curr: stats.seeded,      comp: compStats.seeded,      color: '#7739D9' },
    { label: 'Proposed', metric: 'count', curr: stats.proposed,    comp: compStats.proposed,    color: '#086AE3' },
    { label: 'Retail',   metric: 'count', curr: stats.retail,      comp: compStats.retail,      color: '#00408C' },
    { label: 'xScale',   metric: 'count', curr: stats.xscale,      comp: compStats.xscale,      color: '#411980' },
    { label: 'Weight',   metric: 'wt',    curr: stats.totalWeight, comp: compStats.totalWeight, color: '#E91C24', isFloat: true },
  ];

  return (
    <div style={S.page}>

      {/* ── Fixed top section ── */}
      <div style={{ flexShrink: 0 }}>

        {/* Title + stats banner */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#FFFFFF', borderRadius: 8, marginBottom: 16,
          border: '1px solid #E0E3E8', borderBottom: '3px solid #E91C24', overflow: 'hidden',
        }}>
          <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1, whiteSpace: 'nowrap' }}>Projects</div>
          </div>
          {statItems.map(({ label, metric, curr, comp, color, isFloat }) => (
            <div key={label} style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '6px 10px', flex: '1 1 auto',
              borderRight: '1px solid #E0E3E8', minWidth: 0,
            }}>
              <span style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{isFloat ? curr.toFixed(1) : curr}</span>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· {metric}</span>
              </div>
              {compCycleId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: '#8B93A3' }}>{isFloat ? comp.toFixed(1) : comp}</span>
                  <DeltaBadge a={comp} b={curr} size={9} isFloat={isFloat} />
                </div>
              )}
            </div>
          ))}
          {/* Planning cycle selector */}
          <div style={{ padding: '0 10px', borderRight: '1px solid #E0E3E8', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Cycle</span>
            <select
              value={selectedCycleId ?? ''}
              onChange={e => setSelectedCycleId(e.target.value ? parseInt(e.target.value, 10) : null)}
              style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="">All cycles</option>
              {cycles.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Y-O-Y comparison cycle selector */}
          <div style={{ padding: '0 10px', borderRight: '1px solid #E0E3E8', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>YoY comparison</span>
            <select
              value={compCycleId ?? ''}
              onChange={e => setCompCycleId(e.target.value ? parseInt(e.target.value, 10) : null)}
              style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="">None</option>
              {cycles.filter(c => c.is_active && c.id !== selectedCycleId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Region selector — far right */}
          <div style={{ padding: '0 10px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Region</span>
            <select
              value={selectedRegionId ?? ''}
              onChange={e => { setSelectedRegionId(e.target.value ? parseInt(e.target.value, 10) : null); setCountryFilter(''); }}
              style={{ background: '#F2F3F5', border: '1px solid #E0E3E8', color: '#111827', fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', outline: 'none', width: 82 }}
            >
              <option value="">All</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
            </select>
          </div>
        </div>

        {/* Toolbar — filters + Add Project button at right */}
        <div style={S.toolbar}>
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </span>
            <input
              style={S.searchInput}
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select style={S.filterSel} value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">All countries</option>
            {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select style={S.filterSel} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select style={S.filterSel} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select style={S.filterSel} value={isActiveFilter} onChange={e => setIsActiveFilter(e.target.value as typeof isActiveFilter)}>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
            <option value="all">All</option>
          </select>

          {!loading && (
            <span style={{ color: '#666666', fontSize: 12, whiteSpace: 'nowrap' }}>
              {filtered.length} {filtered.length === 1 ? 'project' : 'projects'} · {countriesList.length} {countriesList.length === 1 ? 'country' : 'countries'}
            </span>
          )}

          {(search || statusFilter || typeFilter || countryFilter) && (
            <button
              style={{ ...S.btnSecondary, fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' as const }}
              onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setCountryFilter(''); }}
            >
              Clear filters
            </button>
          )}

          {/* Right side: collapse-all toggle + lock indicator + add project */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {!canEdit && selectedCycle && (
              <span style={{ fontSize: 11, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                🔒 {selectedCycle.status === 'draft' ? 'Stage 1: Admin Setup' : selectedCycle.status === 'approved' ? 'Stage 4: Global Approval' : 'Closed'} — editing restricted
              </span>
            )}
            <button
              title={collapsedStatuses.size > 0 ? 'Expand all sections' : 'Collapse all sections'}
              onClick={() => {
                const vis = PROJECT_STATUSES.filter(s => filtered.some(p => p.status === s));
                setCollapsedStatuses(collapsedStatuses.size > 0 ? new Set() : new Set(vis));
              }}
              style={{ ...S.btnCompact, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                {collapsedStatuses.size > 0
                  ? <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
                  : <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                }
              </svg>
              Status
            </button>
            <button style={{ ...S.btnCompact, opacity: canEdit ? 1 : 0.4, cursor: canEdit ? 'pointer' : 'not-allowed' }}
              onClick={canEdit ? openAdd : undefined}>+ Project</button>
          </div>
        </div>
      </div>

      {/* ── Scrollable grid section ── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 12 }}>
        {loading ? (
          <div style={S.centerBox}><div className="spinner" /></div>
        ) : error ? (
          <div style={{ ...S.centerBox, flexDirection: 'column', gap: 12 }}>
            <span style={{ color: '#E91C24' }}>Failed to load projects</span>
            <span style={{ fontSize: 12, color: '#666' }}>{error}</span>
            <button style={S.btnSecondary} onClick={loadProjects}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...S.centerBox, flexDirection: 'column', gap: 8 }}>
            <span style={{ color: '#666' }}>No projects found</span>
          </div>
        ) : (
        <div style={{ minWidth: 'max-content' }}>

          {/* Country header row — sticky, black */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', background: '#000000', overflow: 'hidden' }}>
              {countriesList.map((country, ci) => {
                const flag16 = flagUrl(country, 20);
                const flag32 = flagUrl(country, 40);
                return (
                  <div key={country} style={{
                    width: COL_W, flexShrink: 0,
                    padding: '7px 10px',
                    borderRight: ci < countriesList.length - 1 ? '1px solid rgba(255,255,255,0.30)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}>
                    {flag16 && (
                      <img
                        src={flag16}
                        srcSet={flag32 ? `${flag32} 2x` : undefined}
                        alt={country}
                        style={{ width: 18, height: 13, objectFit: 'cover', borderRadius: 2, flexShrink: 0, display: 'block' }}
                      />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {country}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status rows — collapsible */}
          <div style={{ marginTop: 4 }}>
          {PROJECT_STATUSES.map(status => {
            const sm          = statusMeta(status);
            const statusItems = filtered.filter(p => p.status === status);
            const statusTotal = statusItems.length;
            if (statusTotal === 0) return null;
            const statusWeight = statusItems.reduce((s, p) => s + (Number(p.weight) || 1), 0).toFixed(1);
            const collapsed   = collapsedStatuses.has(status);

            return (
              <div key={status} style={{ marginBottom: 4 }}>

                {/* Clickable status label bar */}
                <div
                  onClick={() => toggleStatus(status)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 0, padding: '4px 10px',
                    background: sm.barBg, border: `1px solid ${sm.border}`,
                    borderRadius: 0,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <span style={{
                    fontSize: 9, color: sm.color, fontWeight: 900,
                    transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                    display: 'inline-block', width: 10, textAlign: 'center',
                  }}>▼</span>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.dot, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: sm.color }}>{status}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginLeft: 8, whiteSpace: 'nowrap' as const }}>
                    {statusTotal} · Wt {statusWeight}
                  </span>
                  <div style={{ flex: 1 }} />
                </div>

                {/* Cards — hidden when collapsed */}
                {!collapsed && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start',
                    background: `${sm.bg}88`,
                    border: `1px solid ${sm.border}`, borderTop: 'none',
                  }}>
                    {countriesList.map((country, ci) => {
                      const cards     = projectMatrix[country]?.[status] ?? [];
                      const isCellHov = canEdit && hoveredCell?.country === country && hoveredCell?.status === status;
                      return (
                        <div
                          key={country}
                          onClick={() => { if (canEdit) openAddPreset(country, status); }}
                          onMouseEnter={() => { if (canEdit) setHoveredCell({ country, status }); }}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            width: COL_W, flexShrink: 0,
                            display: 'flex', flexDirection: 'column', gap: 6,
                            padding: '6px',
                            borderRight: ci < countriesList.length - 1 ? `1px solid ${sm.border}` : 'none',
                            minHeight: 40,
                            cursor: canEdit ? 'pointer' : 'default',
                            background: isCellHov ? `${sm.bg}CC` : 'transparent',
                            transition: 'background 0.12s',
                          }}
                        >
                          {cards.map(p => (
                            <ProjectCard key={p.id} project={p} onClick={canEdit ? () => openEdit(p) : undefined} stopParent />
                          ))}
                          {cards.length === 0 ? (
                            <div style={{
                              height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1px dashed ${isCellHov ? sm.border : '#D8D8D8'}`,
                              background: isCellHov ? `${sm.bg}60` : 'rgba(255,255,255,0.4)',
                              borderRadius: 4,
                              transition: 'all 0.12s',
                            }}>
                              {isCellHov && (
                                <span style={{ fontSize: 16, color: sm.border, lineHeight: 1, opacity: 0.8 }}>+</span>
                              )}
                            </div>
                          ) : isCellHov ? (
                            <div style={{
                              fontSize: 10, fontWeight: 700, color: sm.border, textAlign: 'center',
                              padding: '3px 0', border: `1px dashed ${sm.border}`,
                              borderRadius: 3, opacity: 0.75,
                            }}>
                              + Add project
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </div>

          {/* ── Totals row ── table style */}
          {countriesList.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {/* Totals header bar — per-column cells so dividers align with country header */}
              <div style={{ display: 'flex', background: '#000000', border: '1px solid #333333', borderBottom: 'none', overflow: 'hidden' }}>
                {countriesList.map((_, ci) => (
                  <div key={ci} style={{
                    width: COL_W, flexShrink: 0,
                    padding: '5px 10px',
                    borderRight: ci < countriesList.length - 1 ? '1px solid rgba(255,255,255,0.30)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {ci === 0 && (
                      <>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase' as const, letterSpacing: '0.12em', flex: 1 }}>
                          Totals
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>
                          {filtered.length} · Wt {filtered.reduce((s, p) => s + (Number(p.weight) || 1), 0).toFixed(1)}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Per-country totals — table cells */}
              <div style={{ display: 'flex', border: '1px solid #B0B4BC', background: '#D0D3DA', overflow: 'hidden' }}>
                {countriesList.map((country, ci) => {
                  const cs = countryStats[country];
                  return (
                    <div key={country} style={{
                      width: COL_W, flexShrink: 0,
                      padding: '7px 8px',
                      borderRight: ci < countriesList.length - 1 ? '1px solid #B0B4BC' : 'none',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      {/* Total count + weight */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: 17, fontWeight: 800, color: '#111111', lineHeight: 1 }}>{cs.total}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#E91C24' }}>Wt {cs.weight.toFixed(1)}</span>
                      </div>
                      {/* Status breakdown */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
                        {cs.approved > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: STATUS_META.Approved.barBg, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_META.Approved.dot, display: 'inline-block' }} />
                              Approved
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_META.Approved.barBg }}>{cs.approved}</span>
                          </div>
                        )}
                        {cs.seeded > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: STATUS_META.Seeded.barBg, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_META.Seeded.dot, display: 'inline-block' }} />
                              Seeded
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_META.Seeded.barBg }}>{cs.seeded}</span>
                          </div>
                        )}
                        {cs.proposed > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: STATUS_META.Proposed.barBg, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_META.Proposed.dot, display: 'inline-block' }} />
                              Proposed
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_META.Proposed.barBg }}>{cs.proposed}</span>
                          </div>
                        )}
                      </div>
                      {/* Divider */}
                      <div style={{ height: 1, background: '#C4C7CE', marginBottom: 4, marginTop: 'auto' }} />
                      {/* Type breakdown */}
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {cs.retail > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 5px', background: '#E3F2FD', color: '#086AE3', fontWeight: 700, borderRadius: 3 }}>
                            Retail {cs.retail}
                          </span>
                        )}
                        {cs.xscale > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 5px', background: '#F3E5F7', color: '#411980', fontWeight: 700, borderRadius: 3 }}>
                            xScale {cs.xscale}
                          </span>
                        )}
                        {cs.matrix > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 5px', background: '#E0F5F6', color: '#006064', fontWeight: 700, borderRadius: 3 }}>
                            Matrix {cs.matrix}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={S.modal(!!editTarget)}>
            <h2 style={S.modalTitle}>{editTarget ? 'Edit Project' : 'Add Project'}</h2>

            <div style={S.fg}>
              <label style={S.lbl}>Project Name *</label>
              <input
                style={{ ...S.inp, borderColor: nameError ? '#E91C24' : '#D5D5D5' }}
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="Enter project name"
                autoFocus
              />
              {nameError && <span style={{ fontSize: 11, color: '#E91C24', display: 'block', marginTop: 3 }}>{nameError}</span>}
            </div>

            <div style={S.row3}>
              <div style={S.fg}>
                <label style={S.lbl}>Type</label>
                <select style={S.sel} value={form.type} onChange={e => setField('type', e.target.value)}>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Status</label>
                <select style={S.sel} value={form.status} onChange={e => setField('status', e.target.value)}>
                  {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Weight</label>
                <select style={S.sel} value={form.weight} onChange={e => setField('weight', e.target.value)}>
                  {WEIGHT_OPTIONS.map(w => (
                    <option key={w} value={w}>{w.toFixed(1)}{w === 0.5 ? ' — Half' : w === 1.0 ? ' — Standard' : w === 1.5 ? ' — Heavy' : ' — Double'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={S.fg}>
              <label style={S.lbl}>Year</label>
              <input
                type="number" min="2020" max="2035" style={S.inp}
                value={form.year}
                onChange={e => setField('year', e.target.value)}
                placeholder="e.g. 2026"
              />
            </div>

            <div style={S.fg}>
              <label style={S.lbl}>Region</label>
              <select style={S.sel} value={form.region_id} onChange={e => setField('region_id', e.target.value)}>
                <option value="">— Select region —</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div style={S.row2}>
              <div style={S.fg}>
                <label style={S.lbl}>Country</label>
                <select
                  style={{ ...S.sel, opacity: filteredCountries.length === 0 ? 0.5 : 1 }}
                  value={form.country_id}
                  onChange={e => setField('country_id', e.target.value)}
                  disabled={filteredCountries.length === 0}
                >
                  <option value="">— Select country —</option>
                  {filteredCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Metro</label>
                <input
                  style={S.inp} value={form.metro}
                  onChange={e => setField('metro', e.target.value)}
                  placeholder="e.g. London"
                />
              </div>
            </div>

            <div style={S.fg}>
              <label style={S.lbl}>Phase Code</label>
              <input
                style={S.inp} value={form.phase_code}
                onChange={e => setField('phase_code', e.target.value)}
                placeholder="e.g. PHASE-1"
              />
            </div>

            {/* Comments — edit mode only */}
            {editTarget && (
              <div style={{ marginTop: 8, paddingTop: 20, borderTop: '2px solid #E0E3E8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
                  Comments{comments.length > 0 ? ` (${comments.length})` : ''}
                </div>

                {/* Existing comments */}
                {commentsLoading ? (
                  <div style={{ color: '#8B93A3', fontSize: 12, padding: '6px 0 12px' }}>Loading…</div>
                ) : commentsError ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 12px' }}>
                    <span style={{ color: '#AD050C', fontSize: 12 }}>Could not load comments.</span>
                    <button
                      style={{ background: 'none', border: 'none', color: '#086AE3', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      onClick={() => setCommentsFetchTick(t => t + 1)}
                    >Retry</button>
                  </div>
                ) : comments.length === 0 ? (
                  <div style={{ color: '#8B93A3', fontSize: 12, padding: '6px 0 12px', fontStyle: 'italic' }}>No comments yet — be the first to add one.</div>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, paddingRight: 4 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, #E91C24 0%, #411980 100%)',
                          color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                        }}>
                          {initials(c.user_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#111111' }}>{c.user_name}</span>
                            {c.user_role && (
                              <span style={{ fontSize: 9, color: '#FFFFFF', background: '#5A657B', borderRadius: 3, padding: '1px 5px', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                                {c.user_role}
                              </span>
                            )}
                            <span style={{ fontSize: 10, color: '#8B93A3', marginLeft: 'auto', whiteSpace: 'nowrap' as const }}>
                              {fmtDateTime(c.created_at)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#2F3541', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const, background: '#F7F8FA', borderRadius: 6, padding: '8px 10px', border: '1px solid #E8EAED' }}>
                            {c.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* New comment input */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment… (Ctrl+Enter to post)"
                    rows={2}
                    style={{ ...S.inp, flex: 1, resize: 'vertical' as const, minHeight: 60, fontFamily: 'inherit', lineHeight: 1.5 }}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postComment(); } }}
                  />
                  <button
                    style={{ ...S.btnPrimary, alignSelf: 'flex-end', padding: '9px 14px', fontSize: 12, opacity: !newComment.trim() || postingComment ? 0.5 : 1 }}
                    onClick={postComment}
                    disabled={!newComment.trim() || postingComment}
                  >
                    {postingComment ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            )}

            <div style={S.mFooter}>
              {editTarget && editTarget.is_active && (
                <button
                  style={{ ...S.btnSecondary, color: '#AD050C', borderColor: '#F5C0BB', marginRight: 'auto' }}
                  onClick={() => { setModalOpen(false); setDeleteTarget(editTarget); }}
                  disabled={saving}
                >
                  Archive
                </button>
              )}
              <button style={S.btnSecondary} onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
              <button style={S.btnPrimary}   onClick={handleSave}              disabled={saving}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation */}
      {deleteTarget && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div style={{ ...S.modal(), maxWidth: 420 }}>
            <h2 style={{ ...S.modalTitle, marginBottom: 12 }}>Archive Project</h2>
            <p style={{ color: '#555555', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              Archive <strong style={{ color: '#111111' }}>{deleteTarget.name}</strong>? It will be hidden from active views but all data and allocations are preserved.
            </p>
            <div style={S.mFooter}>
              <button style={S.btnSecondary} onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button style={{ ...S.btnPrimary, background: '#AD050C' }} onClick={handleDeactivate} disabled={deleting}>
                {deleting ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({ project: p, onClick, stopParent }: { project: Project; onClick?: () => void; stopParent?: boolean }) {
  const [hover, setHover] = useState(false);
  const tm     = typeMeta(p.type);
  const weight = Number(p.weight) || 1;
  const meta   = [p.metro, p.phase_code].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onClick ? (e) => { if (stopParent) e.stopPropagation(); onClick(); } : undefined}
      onMouseEnter={(e) => { e.stopPropagation(); setHover(true); }}
      onMouseLeave={(e) => { e.stopPropagation(); setHover(false); }}
      title="Click to edit"
      style={{
        background: hover ? '#FAFAFA' : '#FFFFFF',
        border: `1px solid ${hover ? '#BBBBBB' : '#E4E4E4'}`,
        borderLeft: `3px solid ${tm.color}`,
        borderRadius: 6,
        padding: '7px 9px 6px',
        boxShadow: hover ? '0 2px 6px rgba(0,0,0,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.12s, border-color 0.12s, background 0.12s',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        boxSizing: 'border-box' as const,
      }}
    >
      {/* Row 1: project name */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#111111', lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {p.name}
      </div>

      {/* Row 2: type badge + meta + weight */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ ...S.badge(tm.bg, tm.color, tm.border), fontSize: 9, padding: '1px 5px', flexShrink: 0 }}>{p.type}</span>
        {(p.year || meta) && (
          <span style={{ fontSize: 9, color: '#8B93A3', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {p.year ? `FY${p.year}` : ''}{p.year && meta ? ' · ' : ''}{meta}
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 800, color: tm.color, flexShrink: 0, lineHeight: 1 }}>
          {weight.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
