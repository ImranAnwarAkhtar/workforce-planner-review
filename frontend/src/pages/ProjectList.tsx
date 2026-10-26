import { useEffect, useState, useMemo, useRef } from 'react';
import { projectsApi, refDataApi, type Project, type Region, type Country } from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';
import { useColFilter, type ColDef } from '../hooks/useColFilter';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PROJECT_TYPES    = ['Retail', 'xScale', 'Matrix'] as const;
const PROJECT_STATUSES = ['Approved', 'Seeded', 'Proposed'] as const;

const STATUS_COLOR: Record<string, string> = {
  Approved: '#E91C24', Seeded: '#7739D9', Proposed: '#086AE3',
};
const TYPE_COLOR: Record<string, string> = {
  Retail: '#086AE3', xScale: '#7739D9', Matrix: '#411980',
};
const TYPE_BG: Record<string, string> = {
  Retail: '#CCE3FF', xScale: '#E9DBFF', Matrix: '#EDCCFF',
};

function fmtKw(v: number | null | undefined): string {
  if (v == null || v === 0) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMw(v: number | null | undefined): string {
  if (v == null || v === 0) return '—';
  return (v / 1000).toFixed(3);
}

// ---------------------------------------------------------------------------
// Column defs for useColFilter
// ---------------------------------------------------------------------------

const COL_DEFS: ColDef<Project>[] = [
  { key: 'name',    label: 'Name',    get: p => p.name },
  { key: 'type',    label: 'Type',    get: p => p.type },
  { key: 'status',  label: 'Status',  get: p => p.status },
  { key: 'region',  label: 'Region',  get: p => p.region_name  ?? '' },
  { key: 'country', label: 'Country', get: p => p.country_name ?? '' },
  { key: 'year',    label: 'Year',    get: p => p.year != null ? String(p.year) : '' },
];

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------

interface EditForm {
  name: string; type: string; status: string;
  region_id: string; country_id: string;
  year: string; weight: string; power_kw: string;
  metro: string; phase_code: string; is_active: boolean;
}

function projectToForm(p: Project): EditForm {
  return {
    name: p.name ?? '', type: p.type ?? 'Retail', status: p.status ?? 'Approved',
    region_id:  p.region_id  != null ? String(p.region_id)  : '',
    country_id: p.country_id != null ? String(p.country_id) : '',
    year:       p.year       != null ? String(p.year)       : '',
    weight:     p.weight     != null ? String(p.weight)     : '',
    power_kw:   p.power_kw   != null ? String(p.power_kw)   : '',
    metro: p.metro ?? '', phase_code: p.phase_code ?? '',
    is_active: p.is_active !== false,
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  page:       { color: '#111111', height: '100%', display: 'flex', flexDirection: 'column' } as React.CSSProperties,
  centerBox:  { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#999' } as React.CSSProperties,
  toolbar:    { display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' } as React.CSSProperties,
  searchWrap: { position: 'relative' as const, flex: '1 1 160px', maxWidth: 220 } as React.CSSProperties,
  searchInput:{ width: '100%', padding: '6px 10px 6px 28px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  searchIcon: { position: 'absolute' as const, left: 8, top: '50%', transform: 'translateY(-50%)', color: '#999', pointerEvents: 'none' as const },
  filterSel:  { padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' } as React.CSSProperties,
  btnPrimary: { padding: '6px 14px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  btnSecondary:{ padding: '6px 12px', background: 'transparent', color: '#555', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  // modal
  overlay:    { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
  modal:      { background: '#FFF', borderRadius: 10, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' as const } as React.CSSProperties,
  mHead:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E8EBF0', flexShrink: 0 } as React.CSSProperties,
  mBody:      { padding: '18px 20px', display: 'flex', flexDirection: 'column' as const, gap: 12, overflow: 'auto' } as React.CSSProperties,
  mFoot:      { display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #E8EBF0', flexShrink: 0 } as React.CSSProperties,
  row2:       { display: 'flex', gap: 12 } as React.CSSProperties,
  fg:         { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: 1 } as React.CSSProperties,
  lbl:        { fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase' as const, letterSpacing: '0.06em' } as React.CSSProperties,
  inp:        { padding: '7px 10px', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 12, color: '#111', outline: 'none', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  sel:        { padding: '7px 10px', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 12, color: '#111', background: '#FFF', outline: 'none', width: '100%', cursor: 'pointer', boxSizing: 'border-box' as const } as React.CSSProperties,
};

const TH: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#5A657B',
  background: '#F2F3F4', borderBottom: '2px solid #E0E3E8',
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 1,
};
const TD: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, color: '#2F3541',
  borderBottom: '1px solid #F0F1F3', whiteSpace: 'nowrap',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectList() {
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [regions,   setRegions]   = useState<Region[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const { cycles, selectedCycleId, setSelectedCycleId } = usePlanningCycle();

  const [search,         setSearch]         = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState<'true' | 'false' | 'all'>('true');

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // single edit modal
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm,       setEditForm]       = useState<EditForm | null>(null);
  const [saving,         setSaving]         = useState(false);

  // bulk edit modal
  const [bulkEditOpen,  setBulkEditOpen]  = useState(false);
  const [bulkSaving,    setBulkSaving]    = useState(false);
  const [beType,        setBeType]        = useState('');
  const [beStatus,      setBeStatus]      = useState('');
  const [beRegionId,    setBeRegionId]    = useState('');
  const [beYear,        setBeYear]        = useState('');
  const [beIsActive,    setBeIsActive]    = useState<'' | 'true' | 'false'>('');

  // column filter hook
  const colFilter = useColFilter(projects, COL_DEFS);

  function loadProjects() {
    setLoading(true);
    Promise.all([
      projectsApi.list({ is_active: isActiveFilter, planning_cycle_id: selectedCycleId ?? undefined, limit: 2000 }),
      refDataApi.regions().catch(() => [] as Region[]),
      refDataApi.countries().catch(() => [] as Country[]),
    ])
      .then(([ps, rs, cs]) => { setProjects(ps); setRegions(rs); setCountries(cs); setError(null); })
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProjects(); }, [selectedCycleId, isActiveFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = projects;
    if (search) list = list.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.metro ?? '').toLowerCase().includes(search.toLowerCase())
    );
    return colFilter.applyToList(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, colFilter.colFilters, colFilter.sortConfig]);

  const stats = useMemo(() => ({
    total:       filtered.length,
    approved:    filtered.filter(p => p.status === 'Approved').length,
    seeded:      filtered.filter(p => p.status === 'Seeded').length,
    proposed:    filtered.filter(p => p.status === 'Proposed').length,
    retail:      filtered.filter(p => p.type === 'Retail').length,
    xscale:      filtered.filter(p => p.type === 'xScale').length,
    totalWeight: filtered.reduce((s, p) => s + (Number(p.weight) || 1), 0),
    totalKw:     filtered.reduce((s, p) => s + (Number(p.power_kw) || 0), 0),
  }), [filtered]);

  // ── Selection ─────────────────────────────────────────────────────────────

  const allSelected  = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const someSelected = !allSelected && filtered.some(p => selectedIds.has(p.id));

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allSelected) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(filtered.map(p => p.id))); }
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await projectsApi.upload(file, selectedCycleId);
      toast.success(`Imported ${result.inserted} project${result.inserted !== 1 ? 's' : ''}${result.skipped ? ` · ${result.skipped} skipped` : ''}`);
      loadProjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Single edit ───────────────────────────────────────────────────────────

  function openEdit(p: Project) { setEditingProject(p); setEditForm(projectToForm(p)); }
  function closeEdit() { setEditingProject(null); setEditForm(null); }
  function setField(key: keyof EditForm, value: string | boolean) {
    setEditForm(f => f ? { ...f, [key]: value } : f);
  }

  async function handleSave() {
    if (!editingProject || !editForm) return;
    setSaving(true);
    try {
      await projectsApi.update(editingProject.id, {
        name:       editForm.name.trim(),
        type:       editForm.type,
        status:     editForm.status,
        region_id:  editForm.region_id  ? parseInt(editForm.region_id,  10) : undefined,
        country_id: editForm.country_id ? parseInt(editForm.country_id, 10) : undefined,
        year:       editForm.year    ? parseInt(editForm.year,    10) : null,
        weight:     editForm.weight  !== '' ? parseFloat(editForm.weight)  : undefined,
        power_kw:   editForm.power_kw !== '' ? parseFloat(editForm.power_kw) : null,
        metro:      editForm.metro.trim()      || undefined,
        phase_code: editForm.phase_code.trim() || undefined,
        is_active:  editForm.is_active,
      });
      toast.success('Project updated');
      closeEdit();
      loadProjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const editCountries = useMemo(() => {
    if (!editForm?.region_id) return countries;
    return countries.filter(c => String(c.region_id) === editForm.region_id);
  }, [countries, editForm?.region_id]);

  const mwPreview = useMemo(() => {
    if (!editForm) return '';
    const v = parseFloat(editForm.power_kw);
    if (!editForm.power_kw.trim() || isNaN(v)) return '';
    return (v / 1000).toFixed(3);
  }, [editForm?.power_kw]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bulk edit ─────────────────────────────────────────────────────────────

  function openBulkEdit() {
    setBeType(''); setBeStatus(''); setBeRegionId(''); setBeYear(''); setBeIsActive('');
    setBulkEditOpen(true);
  }
  function closeBulkEdit() { setBulkEditOpen(false); }

  async function handleBulkSave() {
    const ids = Array.from(selectedIds);
    const body: any = {};
    if (beType)     body.type      = beType;
    if (beStatus)   body.status    = beStatus;
    if (beRegionId) body.region_id = parseInt(beRegionId, 10);
    if (beYear)     body.year      = parseInt(beYear, 10);
    if (beIsActive !== '') body.is_active = beIsActive === 'true';
    if (Object.keys(body).length === 0) { toast.error('No changes selected'); return; }
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(id => projectsApi.update(id, body)));
      toast.success(`Updated ${ids.length} project${ids.length !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      closeBulkEdit();
      loadProjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Bulk update failed');
    } finally { setBulkSaving(false); }
  }

  const selectedCount = selectedIds.size;
  const selectedProjects = filtered.filter(p => selectedIds.has(p.id));

  // ── Render ─────────────────────────────────────────────────────────────────

  const statDefs = [
    { label: 'Total',    value: stats.total,                                      color: '#2F3541' },
    { label: 'Approved', value: stats.approved,                                   color: '#E91C24' },
    { label: 'Seeded',   value: stats.seeded,                                     color: '#7739D9' },
    { label: 'Proposed', value: stats.proposed,                                   color: '#086AE3' },
    { label: 'Retail',   value: stats.retail,                                     color: '#00408C' },
    { label: 'xScale',   value: stats.xscale,                                     color: '#411980' },
    { label: 'Weight',   value: stats.totalWeight.toFixed(1),                     color: '#E91C24' },
    { label: 'Power kW', value: stats.totalKw > 0 ? fmtKw(stats.totalKw) : '0',  color: '#00737A' },
    { label: 'Power MW', value: stats.totalKw > 0 ? fmtMw(stats.totalKw) : '0',  color: '#00737A' },
  ];

  return (
    <div style={S.page}>

      {/* Stats + title banner */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#FFFFFF', borderRadius: 8, marginBottom: 14,
        border: '1px solid #E0E3E8', borderBottom: '3px solid #00737A', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1, whiteSpace: 'nowrap' }}>Project List</div>
        </div>
        {statDefs.map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '6px 10px', flex: '1 1 auto', borderRight: '1px solid #E0E3E8', minWidth: 0,
          }}>
            <span style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', marginTop: 2 }}>{label}</span>
          </div>
        ))}
        {/* Cycle selector */}
        <div style={{ padding: '0 10px', borderRight: '1px solid #E0E3E8', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span style={{ fontSize: 7, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Cycle</span>
          <select value={selectedCycleId ?? ''} onChange={e => setSelectedCycleId(e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{ fontSize: 11, border: 'none', outline: 'none', cursor: 'pointer', color: '#111827', background: 'transparent', padding: 0, fontWeight: 600 }}>
            <option value="">All cycles</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ ...S.toolbar, flexShrink: 0 }}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </span>
          <input style={S.searchInput} placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select style={S.filterSel} value={isActiveFilter} onChange={e => setIsActiveFilter(e.target.value as typeof isActiveFilter)}>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
          <option value="all">All</option>
        </select>

        {colFilter.anyColFilter && (
          <button style={{ ...S.btnSecondary, color: '#AD050C', borderColor: '#F5C0BB' }} onClick={colFilter.clearAllFilters}>
            Clear filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#888' }}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            style={{ ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => fileRef.current?.click()} disabled={uploading}
            title="Upload CSV or Excel. Columns: name, type, status, region, country, weight, power_kw, year, metro, phase_code"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
            {uploading ? 'Importing…' : 'Upload CSV'}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', marginBottom: 10,
          background: '#FEF4F4', border: '1px solid #F5C0BB', borderRadius: 6,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#AD050C' }}>
            {selectedCount} project{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedProjects.slice(0, 4).map(p => p.name).join(', ')}{selectedCount > 4 ? ` +${selectedCount - 4} more` : ''}
          </div>
          <button style={{ ...S.btnPrimary, fontSize: 11 }} onClick={openBulkEdit}>
            Bulk Edit
          </button>
          <button style={{ ...S.btnSecondary, fontSize: 11 }} onClick={() => setSelectedIds(new Set())}>
            Deselect
          </button>
        </div>
      )}

      {/* Column filter bar */}
      {colFilter.renderFilterBar()}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, border: '1px solid #E0E3E8', borderRadius: 8, marginTop: colFilter.anyColFilter ? 8 : 0 }}>
        {loading ? (
          <div style={S.centerBox}><div className="spinner" /></div>
        ) : error ? (
          <div style={{ ...S.centerBox, flexDirection: 'column', gap: 12 }}>
            <span style={{ color: '#E91C24' }}>Failed to load projects</span>
            <button style={S.btnSecondary} onClick={loadProjects}>Retry</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {/* Checkbox */}
                <th style={{ ...TH, width: 36, padding: '8px 6px 8px 10px', cursor: 'default' }}>
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#E91C24', width: 13, height: 13 }} />
                </th>
                {/* Filterable columns */}
                {COL_DEFS.map(col => (
                  <th key={col.key} style={{ ...TH, textAlign: 'left',
                    minWidth: col.key === 'name' ? 200 : col.key === 'region' || col.key === 'country' ? 100 : 70 }}>
                    {colFilter.renderHeaderContent(col)}
                  </th>
                ))}
                {/* Non-filterable numeric columns */}
                <th style={{ ...TH, textAlign: 'right', minWidth: 70 }}>Weight</th>
                <th style={{ ...TH, textAlign: 'right', minWidth: 90 }}>Power (kW)</th>
                <th style={{ ...TH, textAlign: 'right', minWidth: 90 }}>Power (MW)</th>
                <th style={{ ...TH, textAlign: 'center', minWidth: 52, cursor: 'default' }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ ...TD, textAlign: 'center', color: '#999', padding: '40px 0' }}>No projects found</td></tr>
              ) : filtered.map((p, i) => {
                const isSelected = selectedIds.has(p.id);
                return (
                  <tr
                    key={p.id}
                    style={{ background: isSelected ? '#FEF4F4' : i % 2 === 0 ? '#FFFFFF' : '#FAFAFA', cursor: 'default' }}
                    onDoubleClick={() => openEdit(p)}
                  >
                    <td style={{ ...TD, padding: '7px 6px 7px 10px', width: 36 }} onDoubleClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                        style={{ cursor: 'pointer', accentColor: '#E91C24', width: 13, height: 13 }} />
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>{p.name}</td>
                    <td style={TD}>
                      <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: TYPE_BG[p.type] ?? '#EEE', color: TYPE_COLOR[p.type] ?? '#555' }}>
                        {p.type}
                      </span>
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[p.status] ?? '#AAA', display: 'inline-block', flexShrink: 0 }} />
                        {p.status}
                      </span>
                    </td>
                    <td style={{ ...TD, color: '#5A657B' }}>{p.region_name ?? '—'}</td>
                    <td style={{ ...TD, color: '#5A657B' }}>{p.country_name ?? '—'}</td>
                    <td style={{ ...TD, color: '#5A657B' }}>{p.year ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{Number(p.weight).toFixed(1)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: p.power_kw ? '#00737A' : '#CCC', fontWeight: p.power_kw ? 600 : 400 }}>{fmtKw(p.power_kw)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: p.power_kw ? '#00737A' : '#CCC', fontWeight: p.power_kw ? 600 : 400 }}>{fmtMw(p.power_kw)}</td>
                    <td style={{ ...TD, textAlign: 'center', padding: '4px 8px' }} onDoubleClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(p)} title="Edit project"
                        style={{ background: 'none', border: '1px solid #D5D5D5', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: '#5A657B', display: 'inline-flex', alignItems: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload hint */}
      <div style={{ flexShrink: 0, marginTop: 8, fontSize: 10, color: '#AAA' }}>
        CSV columns: <b>name</b>, type, status, region, country, weight, power_kw, year, metro, phase_code
      </div>

      {/* Column filter dropdown (portal) */}
      {colFilter.renderDropdown()}

      {/* ── Single edit modal ───────────────────────────────────────────────── */}
      {editingProject && editForm && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div style={S.modal}>
            <div style={S.mHead}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Edit Project</div>
                <div style={{ fontSize: 11, color: '#8B93A3', marginTop: 2 }}>{editingProject.name}</div>
              </div>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={S.mBody}>
              <div style={S.fg}>
                <label style={S.lbl}>Project Name</label>
                <input style={S.inp} value={editForm.name} onChange={e => setField('name', e.target.value)} placeholder="Project name" />
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Type</label>
                  <select style={S.sel} value={editForm.type} onChange={e => setField('type', e.target.value)}>
                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Status</label>
                  <select style={S.sel} value={editForm.status} onChange={e => setField('status', e.target.value)}>
                    {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Region</label>
                  <select style={S.sel} value={editForm.region_id} onChange={e => { setField('region_id', e.target.value); setField('country_id', ''); }}>
                    <option value="">— select —</option>
                    {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Country</label>
                  <select style={S.sel} value={editForm.country_id} onChange={e => setField('country_id', e.target.value)}>
                    <option value="">— select —</option>
                    {editCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Year</label>
                  <input type="number" style={S.inp} value={editForm.year} onChange={e => setField('year', e.target.value)} placeholder="e.g. 2026" />
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Weight</label>
                  <input type="number" min="0" step="any" style={S.inp} value={editForm.weight} onChange={e => setField('weight', e.target.value)} placeholder="e.g. 1.0" />
                </div>
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Power (kW)</label>
                  <input type="number" min="0" step="any" style={S.inp} value={editForm.power_kw} onChange={e => setField('power_kw', e.target.value)} placeholder="e.g. 2500" />
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Power (MW) — auto</label>
                  <input style={{ ...S.inp, background: '#F7F8FA', color: '#888' }} readOnly value={mwPreview} placeholder="Calculated from kW" />
                </div>
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Metro</label>
                  <input style={S.inp} value={editForm.metro} onChange={e => setField('metro', e.target.value)} placeholder="e.g. London" />
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Phase Code</label>
                  <input style={S.inp} value={editForm.phase_code} onChange={e => setField('phase_code', e.target.value)} placeholder="e.g. P1" />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#2F3541', userSelect: 'none' }}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setField('is_active', e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                Active project
              </label>
            </div>
            <div style={S.mFoot}>
              <button style={S.btnSecondary} onClick={closeEdit} disabled={saving}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving || !editForm.name.trim()}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk edit modal ─────────────────────────────────────────────────── */}
      {bulkEditOpen && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) closeBulkEdit(); }}>
          <div style={{ ...S.modal, width: 440 }}>
            <div style={S.mHead}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Bulk Edit</div>
                <div style={{ fontSize: 11, color: '#8B93A3', marginTop: 2 }}>
                  {selectedCount} project{selectedCount !== 1 ? 's' : ''} — only filled fields will be updated
                </div>
              </div>
              <button onClick={closeBulkEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={S.mBody}>
              <div style={{ padding: '8px 10px', background: '#F8F9FA', borderRadius: 6, fontSize: 11, color: '#5A657B', border: '1px solid #E0E3E8' }}>
                Leave a field blank to keep each project's existing value unchanged.
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Type</label>
                  <select style={S.sel} value={beType} onChange={e => setBeType(e.target.value)}>
                    <option value="">— no change —</option>
                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Status</label>
                  <select style={S.sel} value={beStatus} onChange={e => setBeStatus(e.target.value)}>
                    <option value="">— no change —</option>
                    {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={S.row2}>
                <div style={S.fg}>
                  <label style={S.lbl}>Region</label>
                  <select style={S.sel} value={beRegionId} onChange={e => setBeRegionId(e.target.value)}>
                    <option value="">— no change —</option>
                    {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={S.fg}>
                  <label style={S.lbl}>Year</label>
                  <input type="number" style={S.inp} value={beYear} onChange={e => setBeYear(e.target.value)} placeholder="— no change —" />
                </div>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Active Status</label>
                <select style={S.sel} value={beIsActive} onChange={e => setBeIsActive(e.target.value as typeof beIsActive)}>
                  <option value="">— no change —</option>
                  <option value="true">Set Active</option>
                  <option value="false">Set Inactive</option>
                </select>
              </div>
            </div>
            <div style={S.mFoot}>
              <button style={S.btnSecondary} onClick={closeBulkEdit} disabled={bulkSaving}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: bulkSaving ? 0.7 : 1 }} onClick={handleBulkSave} disabled={bulkSaving}>
                {bulkSaving ? 'Saving…' : `Update ${selectedCount} Project${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
