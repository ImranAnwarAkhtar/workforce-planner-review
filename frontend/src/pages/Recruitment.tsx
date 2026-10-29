import { useEffect, useState, useMemo, useCallback } from 'react';
import { tbhCodesApi, refDataApi, type TbhCode, type Region, type CreateTbhCodeBody } from '../services/api';
import { useColFilter, type ColDef } from '../hooks/useColFilter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fallback values used until API data loads
const REQ_STATUSES_DEFAULT = ['Req not raised', 'Screening', 'Interviewing', 'Offer Pending', 'Offer Accepted', 'Hired', 'Closed'];
const HIRE_TYPES_DEFAULT   = ['Net New', 'Backfill', 'Conversion', 'Uplift'];
const HIRE_SOURCES_DEFAULT = ['External', 'Internal (within GDC)', 'Internal (outside GDC)', 'Conversion', 'Promotion'];

const STATUS_META: Record<string, { color: string; bg: string; border: string }> = {
  'Req not raised': { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  'Screening':      { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  'Interviewing':   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  'Offer Pending':  { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  'Offer Accepted': { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  'Hired':          { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
  'Closed':         { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

// Colours shown in the dark banner stat items
const STATUS_BANNER_COLOR: Record<string, string> = {
  'Req not raised': '#9CA3AF',
  'Screening':      '#60A5FA',
  'Interviewing':   '#FBBF24',
  'Offer Pending':  '#A78BFA',
  'Offer Accepted': '#34D399',
  'Hired':          '#33A85C',
  'Closed':         '#F87171',
};

function statusMeta(s: string | null) {
  return STATUS_META[s ?? ''] ?? { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' };
}

// Sticky-column config (first 5 columns frozen)
const STICKY_WIDTHS: [string, number][] = [
  ['tbh_id',   211],
  ['old_tbh',  145],
  ['req_status', 102],
];
const STICKY_LEFT: Record<string, number>  = {};
const STICKY_WIDTH: Record<string, number> = {};
let _acc = 0;
for (const [k, w] of STICKY_WIDTHS) { STICKY_LEFT[k] = _acc; STICKY_WIDTH[k] = w; _acc += w; }

function colWidth(key: string): number {
  if (STICKY_WIDTH[key] !== undefined) return STICKY_WIDTH[key];
  if (['pmo_comments','wfp_comments','ta_status_comments','tbh_description',
       'fp_and_a_notes','fp_and_a_approver_notes'].includes(key)) return 150;
  return 92;
}

function stickyTD(key: string): React.CSSProperties {
  const w = STICKY_WIDTH[key];
  return { position: 'sticky', left: STICKY_LEFT[key], zIndex: 1, background: '#FFFFFF', width: w, maxWidth: w };
}

function regionChip(name: string | null): { bg: string; color: string; border: string } | null {
  if (!name) return null;
  const n = name.toUpperCase();
  if (n.includes('ASIA') || (n.includes('APAC') && !n.includes('MATRIX'))) return { bg: '#EBF3FF', color: '#00408C', border: '#BFDBFE' };
  if (n.includes('MATRIX')) return { bg: '#FFF8EB', color: '#92400E', border: '#FDE68A' };
  if (n.includes('AMER') || n.includes('AMERICAS')) return { bg: '#EEF2FF', color: '#00408C', border: '#C7D2FE' };
  if (n.includes('NORTH') || n.includes('EMEA-N') || n.includes('EMEA_N')) return { bg: '#F3EEFF', color: '#411980', border: '#DDD6FE' };
  if (n.includes('CENTRAL') || n.includes('EMEA-C') || n.includes('EMEA_C')) return { bg: '#F0ECFF', color: '#5B21B6', border: '#D8B4FE' };
  if (n.includes('SOUTH') || n.includes('EMEA-S') || n.includes('EMEA_S')) return { bg: '#EFF0FF', color: '#3730A3', border: '#C7D2FE' };
  if (n.includes('EMEA')) return { bg: '#F5F1FF', color: '#411980', border: '#E0CFFE' };
  if (n.includes('MEA')) return { bg: '#E8F6F7', color: '#00737A', border: '#99E6EA' };
  if (n.includes('GLOBAL')) return { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
  return { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
}

function projectChip(pt: string | null): { bg: string; color: string; border: string } | null {
  if (!pt) return null;
  if (pt === 'Retail') return { bg: '#EBF3FF', color: '#00408C', border: '#BFDBFE' };
  if (pt === 'xScale') return { bg: '#F3EEFF', color: '#411980', border: '#DDD6FE' };
  if (pt === 'Matrix') return { bg: '#E8F6F7', color: '#00737A', border: '#99E6EA' };
  return { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MONTH_ABBR: Record<string, string> = {
  jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',
  jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec',
};
function parseTbhDate(tbhId: string): string | null {
  const m = tbhId.match(/[_\s-]([A-Za-z]{3})[\s_-]?(\d{2})$/i);
  if (!m) return null;
  const mon = MONTH_ABBR[m[1].toLowerCase()];
  if (!mon) return null;
  return `${mon} ${2000 + parseInt(m[2], 10)}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tk = { bg2: '#FFFFFF', border: '#E5E5E5', accent: '#E91C24', muted: '#666666' };
const card: React.CSSProperties    = { background: tk.bg2, border: `1px solid ${tk.border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const TH: React.CSSProperties     = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tk.muted, background: '#E4E6EA', borderBottom: '2px solid #C8CCD4', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 };
const TD: React.CSSProperties     = { padding: '5px 8px', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle', fontSize: 11, color: '#111111' };
const inputSt: React.CSSProperties  = { width: '100%', padding: '4px 7px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#111111', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
const selectSt: React.CSSProperties = { ...inputSt, cursor: 'pointer' };
const labelSt: React.CSSProperties  = { display: 'block', fontSize: 10, fontWeight: 700, color: tk.muted, marginBottom: 2, letterSpacing: '0.07em', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties    = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const btnCompact: React.CSSProperties   = { padding: '4px 10px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const };
const btnSecondary: React.CSSProperties = { padding: '5px 12px', background: 'transparent', color: '#555555', border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 12, cursor: 'pointer' };
const overlay: React.CSSProperties   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 };
const modalBox: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', padding: '16px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' };
const modalFooter: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid #EEEEEE' };
const row2: React.CSSProperties     = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 };

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const REC_COL_DEFS: ColDef<TbhCode>[] = [
  { key: 'tbh_id',                  label: 'TBH ID',                          get: t => t.tbh_id },
  { key: 'old_tbh',                 label: 'Old TBH',                         get: t => t.old_tbh ?? '' },
  { key: 'req_status',              label: 'Hire Status',                     get: t => t.req_status ?? '' },
  { key: 'creation_date',           label: 'Created',                         get: t => t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' },
  { key: 'in_summary',              label: 'In Summary',                      get: t => t.in_summary ?? '' },
  { key: 'status_query',            label: 'Status / Query',                  get: t => t.status_query ?? '' },
  { key: 'pmo_comments',            label: 'PMO Comments',                    get: t => t.pmo_comments ?? '' },
  { key: 'wfp_comments',            label: 'Workforce Planning Comments',     get: t => t.wfp_comments ?? '' },
  { key: 'funding_year',            label: 'Funding',                         get: t => t.funding_year ? String(t.funding_year) : '' },
  { key: 'hire_type',               label: 'Hire Type',                       get: t => t.hire_type ?? '' },
  { key: 'hire_source',             label: 'Hire Source',                     get: t => t.hire_source ?? '' },
  { key: 'region',                  label: 'Region',                          get: t => t.region_name ?? '' },
  { key: 'project_type',            label: 'Project',                         get: t => t.project_type ?? '' },
  { key: 'legal_entity',            label: 'Legal Entity Final',              get: t => t.legal_entity ?? '' },
  { key: 'location_code',           label: 'Location',                        get: t => t.location_code ?? '' },
  { key: 'cost_centre',             label: 'Cost Center',                     get: t => t.cost_centre ?? '' },
  { key: 'job_profile',             label: 'Job Profile',                     get: t => t.job_profile ?? '' },
  { key: 'manager_name',            label: 'Manager Name',                    get: t => t.manager_name ?? '' },
  { key: 'replaced_emp_name',       label: 'Replaced Emp Name',               get: t => t.replaced_emp_name ?? '' },
  { key: 'jr_id',                   label: 'Job Req ID',                      get: t => t.jr_id ?? '' },
  { key: 'ta_contact',              label: 'TA Contact',                      get: t => t.ta_contact ?? '' },
  { key: 'comp_ratio',              label: 'Comp Ratio',                      get: t => t.comp_ratio != null ? String(t.comp_ratio) : '' },
  { key: 'candidate_name',          label: 'Final Candidate',                 get: t => t.candidate_name ?? '' },
  { key: 'estimated_hire_date',     label: 'TA (Est.) Hire Date',             get: t => t.estimated_hire_date ?? '' },
  { key: 'confirmed_start_date',    label: 'Confirmed Start Date',            get: t => t.confirmed_start_date ?? '' },
  { key: 'target_hire_date',        label: 'Hire Date',                       get: t => t.target_hire_date ?? '' },
  { key: 'fp_and_a_approver_notes', label: 'Note from FP&A Approver',         get: t => t.fp_and_a_approver_notes ?? '' },
  { key: 'fp_and_a_notes',          label: 'Note from FP&A',                  get: t => t.fp_and_a_notes ?? '' },
  { key: 'tbh_description',         label: 'TBH Description',                 get: t => t.tbh_description ?? '' },
  { key: 'ta_status_comments',      label: 'TA Status Comments',              get: t => t.ta_status_comments ?? '' },
];

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  tbh_id: string; old_tbh: string; in_summary: string; status_query: string;
  pmo_comments: string; wfp_comments: string; funding_year: string; hire_type: string;
  region_id: string; project_type: string; legal_entity: string; location_code: string;
  cost_centre: string; job_profile: string; replaced_emp_name: string; manager_name: string;
  target_hire_date: string; jr_id: string; req_status: string; ta_contact: string;
  comp_ratio: string; candidate_name: string; estimated_hire_date: string;
  ta_status_comments: string; tbh_description: string;
  fp_and_a_approver_notes: string; fp_and_a_notes: string;
  confirmed_start_date: string; hire_source: string;
}

const emptyForm: FormState = {
  tbh_id: '', old_tbh: '', in_summary: '', status_query: '', pmo_comments: '', wfp_comments: '',
  funding_year: String(new Date().getFullYear()),
  hire_type: 'Net New', region_id: '', project_type: '', legal_entity: '', location_code: '',
  cost_centre: '', job_profile: '', replaced_emp_name: '', manager_name: '',
  target_hire_date: '', jr_id: '', req_status: 'Open', ta_contact: '',
  comp_ratio: '', candidate_name: '',
  estimated_hire_date: '', ta_status_comments: '', tbh_description: '',
  fp_and_a_approver_notes: '', fp_and_a_notes: '',
  confirmed_start_date: '', hire_source: '',
};

function tbhToForm(t: TbhCode): FormState {
  return {
    tbh_id: t.tbh_id, old_tbh: t.old_tbh ?? '',
    in_summary: t.in_summary ?? '', status_query: t.status_query ?? '',
    pmo_comments: t.pmo_comments ?? '', wfp_comments: t.wfp_comments ?? '',
    funding_year: t.funding_year ? String(t.funding_year) : '',
    hire_type: t.hire_type ?? 'Net New', region_id: t.region_id ? String(t.region_id) : '',
    project_type: t.project_type ?? '', legal_entity: t.legal_entity ?? '', location_code: t.location_code ?? '',
    cost_centre: t.cost_centre ?? '', job_profile: t.job_profile ?? '', replaced_emp_name: t.replaced_emp_name ?? '',
    manager_name: t.manager_name ?? '', target_hire_date: t.target_hire_date ? t.target_hire_date.slice(0, 10) : '',
    jr_id: t.jr_id ?? '', req_status: t.req_status ?? 'Open', ta_contact: t.ta_contact ?? '',
    comp_ratio: t.comp_ratio != null ? String(t.comp_ratio) : '',
    candidate_name: t.candidate_name ?? '', estimated_hire_date: t.estimated_hire_date ? t.estimated_hire_date.slice(0, 10) : '',
    ta_status_comments: t.ta_status_comments ?? '', tbh_description: t.tbh_description ?? '',
    fp_and_a_approver_notes: t.fp_and_a_approver_notes ?? '', fp_and_a_notes: t.fp_and_a_notes ?? '',
    confirmed_start_date: t.confirmed_start_date ? t.confirmed_start_date.slice(0, 10) : '',
    hire_source: t.hire_source ?? '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Recruitment() {
  const [tbhCodes, setTbhCodes] = useState<TbhCode[]>([]);
  const [regions,  setRegions]  = useState<Region[]>([]);
  const [hireTypes,   setHireTypes]   = useState<string[]>(HIRE_TYPES_DEFAULT);
  const [reqStatuses, setReqStatuses] = useState<string[]>(REQ_STATUSES_DEFAULT);
  const [hireSources, setHireSources] = useState<string[]>(HIRE_SOURCES_DEFAULT);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter,   setYearFilter]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<TbhCode | null>(null);
  const [form,         setForm]         = useState<FormState>(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [tbhIdError,   setTbhIdError]   = useState('');

  const [deleteTarget, setDeleteTarget] = useState<TbhCode | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const [hiddenCols,  setHiddenCols]  = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const toggleCol = (key: string) => setHiddenCols(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  useEffect(() => {
    refDataApi.regions().then(setRegions).catch(() => {});
    refDataApi.refLists().then(all => {
      const vals = (name: string) => all.filter(e => e.list_name === name).sort((a,b) => a.sort_order - b.sort_order).map(e => e.value);
      const ht = vals('hire_type');   if (ht.length)  setHireTypes(ht);
      const hs = vals('hire_status'); if (hs.length)  setReqStatuses(hs);
      const src = vals('hire_source'); if (src.length) setHireSources(src);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {
        req_status:   statusFilter || undefined,
        funding_year: yearFilter ? parseInt(yearFilter, 10) : undefined,
        limit: 500,
      };
      setTbhCodes(await tbhCodesApi.list(params));
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [statusFilter, yearFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const colFilter = useColFilter(tbhCodes, REC_COL_DEFS);

  const filtered = useMemo(() => {
    let list = tbhCodes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.tbh_id.toLowerCase().includes(q) ||
        (t.job_profile ?? '').toLowerCase().includes(q) ||
        (t.candidate_name ?? '').toLowerCase().includes(q) ||
        (t.manager_name ?? '').toLowerCase().includes(q) ||
        (t.region_name ?? '').toLowerCase().includes(q)
      );
    }
    return colFilter.applyToList(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tbhCodes, search, colFilter.colFilters, colFilter.sortConfig]);

  const years = useMemo(() => {
    const ys = new Set(tbhCodes.map(t => t.funding_year).filter(Boolean) as number[]);
    return Array.from(ys).sort((a, b) => b - a);
  }, [tbhCodes]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tbhCodes) { const s = t.req_status ?? 'Open'; c[s] = (c[s] || 0) + 1; }
    return c;
  }, [tbhCodes]);

  function openAdd()          { setEditTarget(null); setForm(emptyForm); setTbhIdError(''); setModalOpen(true); }
  function openEdit(t: TbhCode) { setEditTarget(t);   setForm(tbhToForm(t)); setTbhIdError(''); setModalOpen(true); }

  function sf(k: keyof FormState, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'tbh_id') setTbhIdError('');
  }

  async function handleSave() {
    if (!form.tbh_id.trim()) { setTbhIdError('TBH ID is required'); return; }
    setSaving(true);
    try {
      const body: CreateTbhCodeBody = {
        tbh_id: form.tbh_id.trim(),
        old_tbh:                  form.old_tbh                  || null,
        in_summary:               form.in_summary               || null,
        status_query:             form.status_query             || null,
        pmo_comments:             form.pmo_comments             || null,
        wfp_comments:             form.wfp_comments             || null,
        funding_year:             form.funding_year             ? parseInt(form.funding_year, 10) : null,
        hire_type:                form.hire_type                || null,
        region_id:                form.region_id                ? parseInt(form.region_id, 10)    : null,
        project_type:             form.project_type             || null,
        legal_entity:             form.legal_entity             || null,
        location_code:            form.location_code            || null,
        cost_centre:              form.cost_centre              || null,
        job_profile:              form.job_profile              || null,
        replaced_emp_name:        form.replaced_emp_name        || null,
        manager_name:             form.manager_name             || null,
        target_hire_date:         form.target_hire_date         || null,
        jr_id:                    form.jr_id                    || null,
        req_status:               form.req_status               || null,
        ta_contact:               form.ta_contact               || null,
        candidate_name:           form.candidate_name           || null,
        estimated_hire_date:      form.estimated_hire_date      || null,
        ta_status_comments:       form.ta_status_comments       || null,
        tbh_description:          form.tbh_description          || null,
        fp_and_a_approver_notes:  form.fp_and_a_approver_notes  || null,
        fp_and_a_notes:           form.fp_and_a_notes           || null,
        confirmed_start_date:     form.confirmed_start_date     || null,
        hire_source:              form.hire_source              || null,
        comp_ratio:               form.comp_ratio               ? parseFloat(form.comp_ratio) : null,
      };
      if (editTarget) await tbhCodesApi.update(editTarget.id, body);
      else            await tbhCodesApi.create(body);
      setModalOpen(false);
      loadData();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await tbhCodesApi.delete(deleteTarget.id); setDeleteTarget(null); loadData(); }
    finally { setDeleting(false); }
  }

  return (
    <div style={{ color: '#111111' }}>

      {/* ── Top banner: title + pipeline status counts + actions ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#FFFFFF', borderRadius: 8, marginBottom: 16,
        border: '1px solid #E0E3E8', borderBottom: '3px solid #E91C24', overflow: 'hidden',
      }}>
        {/* Title */}
        <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1, whiteSpace: 'nowrap' }}>Talent Acquisition</div>
        </div>

        {/* Total */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', borderRight: '1px solid #E0E3E8', flex: '1 1 auto', minWidth: 0 }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{tbhCodes.length}</span>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Total</span>
            <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
          </div>
        </div>

        {/* Per-status counts */}
        {reqStatuses.map(s => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', borderRight: '1px solid #E0E3E8', flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: STATUS_BANNER_COLOR[s], lineHeight: 1 }}>
              {statusCounts[s] ?? 0}
            </span>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{s}</span>
              <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
            </div>
          </div>
        ))}

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', padding: '0 14px', flexShrink: 0 }}>
          <button style={btnCompact} onClick={openAdd}>+ Add TBH</button>
        </div>
      </div>


      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ padding: '6px 10px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, outline: 'none', flex: '1 1 180px', maxWidth: 260 }}
          placeholder="Search TBH ID, role, candidate, manager…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={{ padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {reqStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>FY{y}</option>)}
        </select>
        {!loading && <span style={{ color: '#888', fontSize: 12 }}>{filtered.length} records</span>}

        {/* Hire status filter chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Status:</span>
          <button onClick={() => setStatusFilter('')} style={{ padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: statusFilter === '' ? '1.5px solid #374151' : '1px solid #E0E0E0', background: statusFilter === '' ? '#374151' : '#F9FAFB', color: statusFilter === '' ? '#FFFFFF' : '#555' }}>All</button>
          {reqStatuses.map(s => {
            const m = STATUS_META[s];
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(active ? '' : s)} style={{ padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: active ? `1.5px solid ${m.color}` : `1px solid ${m.border}`, background: active ? m.color : m.bg, color: active ? '#FFFFFF' : m.color }}>
                {s}
              </button>
            );
          })}
        </div>

        {/* Column visibility toggle */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setColMenuOpen(o => !o)}
            style={{ padding: '6px 10px', background: colMenuOpen ? '#F3F4F6' : '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/><circle cx="5" cy="4" r="2" fill="#fff" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="8" r="2" fill="#fff" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="12" r="2" fill="#fff" stroke="currentColor" strokeWidth="1.2"/></svg>
            Columns {hiddenCols.size > 0 && <span style={{ background: '#E91C24', color: '#fff', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 700 }}>{hiddenCols.size}</span>}
          </button>
          {colMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 220, padding: '8px 0' }}
              onMouseLeave={() => setColMenuOpen(false)}>
              <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #F0F0F0', marginBottom: 4 }}>Toggle columns</div>
              {REC_COL_DEFS.slice(STICKY_WIDTHS.length).map(col => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F6FA'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <input type="checkbox" checked={!hiddenCols.has(col.key)} onChange={() => toggleCol(col.key)} style={{ cursor: 'pointer' }} />
                  {col.label}
                </label>
              ))}
              {hiddenCols.size > 0 && (
                <div style={{ borderTop: '1px solid #F0F0F0', marginTop: 4, padding: '6px 12px 2px' }}>
                  <button onClick={() => setHiddenCols(new Set())} style={{ fontSize: 11, color: '#E91C24', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Show all columns</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={card}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 36, color: tk.accent }}>
            {error} <button style={{ ...btnSecondary, marginLeft: 12 }} onClick={loadData}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No TBH codes found</div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 195px)' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {REC_COL_DEFS.map((col, ci) => {
                  const isSticky = ci < STICKY_WIDTHS.length;
                  if (!isSticky && hiddenCols.has(col.key)) return null;
                  const w = colWidth(col.key);
                  return (
                    <th key={col.key} style={{ ...TH, userSelect: 'none', minWidth: w, width: isSticky ? w : undefined, maxWidth: isSticky ? w : undefined, ...(isSticky ? { left: STICKY_LEFT[col.key], zIndex: 3 } : {}) }}>
                      {colFilter.renderHeaderContent(col)}
                    </th>
                  );
                })}
                <th style={{ ...TH, textAlign: 'right', minWidth: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const m = statusMeta(t.req_status);
                return (
                  <tr key={t.id} style={{ background: '#FFFFFF', cursor: 'pointer' }}
                    onMouseEnter={e => { for (const c of Array.from(e.currentTarget.cells)) (c as HTMLElement).style.background = '#F5F6FA'; }}
                    onMouseLeave={e => { for (const c of Array.from(e.currentTarget.cells)) (c as HTMLElement).style.background = '#FFFFFF'; }}
                    onDoubleClick={() => openEdit(t)}>

                    {/* TBH ID — sticky col 1 */}
                    <td title={t.tbh_id} style={{ ...TD, ...stickyTD('tbh_id') }}>
                      <span style={{ fontWeight: 600, color: '#111111', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.tbh_id}</span>
                    </td>

                    {/* Old TBH — sticky col 2 */}
                    <td title={t.old_tbh ?? ''} style={{ ...TD, ...stickyTD('old_tbh') }}>
                      <span style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.old_tbh ?? '—'}</span>
                    </td>

                    {/* REQ Status — sticky col 3 */}
                    <td title={t.req_status ?? ''} style={{ ...TD, ...stickyTD('req_status') }}>
                      <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>
                        {t.req_status ?? 'Unknown'}
                      </span>
                    </td>

                    {/* ── Non-sticky / collapsible columns ── */}
                    {!hiddenCols.has('creation_date') && (() => { const d = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null; return (
                      <td title={d ?? ''} style={{ ...TD, textAlign: 'center' }}>
                        {d ? <span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap' }}>{d}</span>
                           : <span style={{ color: '#9CA3AF', fontSize: 10 }}>—</span>}
                      </td>
                    ); })()}
                    {!hiddenCols.has('in_summary') && (
                      <td title={t.is_in_plan ? 'In resource plan' : 'Not in resource plan'} style={{ ...TD, textAlign: 'center' }}>
                        {t.is_in_plan
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '1px 6px', borderRadius: 8, border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>Yes</span>
                          : <span style={{ color: '#9CA3AF', fontSize: 10 }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('status_query') && (
                      <td title={t.status_query ?? ''} style={TD}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.status_query ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('pmo_comments') && (
                      <td title={t.pmo_comments ?? ''} style={{ ...TD, maxWidth: 200 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.pmo_comments ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('wfp_comments') && (
                      <td title={t.wfp_comments ?? ''} style={{ ...TD, maxWidth: 200 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.wfp_comments ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('funding_year') && (
                      <td title={t.funding_year ? String(t.funding_year) : ''} style={TD}>
                        {t.funding_year ? <span style={{ fontSize: 11, fontWeight: 600, color: '#666', background: '#F3F4F6', padding: '2px 6px', borderRadius: 3 }}>FY{t.funding_year}</span>
                                        : <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('hire_type') && (
                      <td title={t.hire_type ?? ''} style={TD}>
                        {t.hire_type ? <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{t.hire_type}</span>
                                     : <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('hire_source') && (
                      <td title={t.hire_source ?? ''} style={TD}>
                        {t.hire_source
                          ? (() => {
                              const hs = t.hire_source;
                              const bg = hs === 'External' ? '#EBF3FF' : hs.startsWith('Internal (within') ? '#F0EDFF' : hs.startsWith('Internal (outside') ? '#EEF1FF' : hs === 'Conversion' ? '#F9EEF5' : hs === 'Promotion' ? '#ECFDF5' : '#F3F4F6';
                              const cl = hs === 'External' ? '#086AE3' : hs.startsWith('Internal (within') ? '#411980' : hs.startsWith('Internal (outside') ? '#3730A3' : hs === 'Conversion' ? '#841A5B' : hs === 'Promotion' ? '#059669' : '#374151';
                              return <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap', background: bg, color: cl }}>{hs}</span>;
                            })()
                          : <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('region') && (
                      <td title={t.region_name ?? ''} style={TD}>
                        {t.region_name ? (() => { const rc = regionChip(t.region_name); return rc ? <span style={{ fontSize: 10, fontWeight: 600, color: rc.color, background: rc.bg, padding: '1px 6px', borderRadius: 8, border: `1px solid ${rc.border}`, whiteSpace: 'nowrap' }}>{t.region_name}</span> : <span style={{ color: '#374151', fontSize: 10 }}>{t.region_name}</span>; })() : <span style={{ color: '#9CA3AF', fontSize: 10 }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('project_type') && (
                      <td title={t.project_type ?? ''} style={TD}>
                        {t.project_type ? (() => { const pc = projectChip(t.project_type); return pc ? <span style={{ fontSize: 10, fontWeight: 600, color: pc.color, background: pc.bg, padding: '1px 6px', borderRadius: 8, border: `1px solid ${pc.border}`, whiteSpace: 'nowrap' }}>{t.project_type}</span> : <span style={{ color: '#374151', fontSize: 10 }}>{t.project_type}</span>; })() : <span style={{ color: '#9CA3AF', fontSize: 10 }}>—</span>}
                      </td>
                    )}
                    {!hiddenCols.has('legal_entity') && (
                      <td title={t.legal_entity ?? ''} style={{ ...TD, maxWidth: 180 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.legal_entity ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('location_code') && (
                      <td title={t.location_code ?? ''} style={{ ...TD, maxWidth: 160 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.location_code ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('cost_centre') && (
                      <td title={t.cost_centre ?? ''} style={{ ...TD, maxWidth: 160 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.cost_centre ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('job_profile') && (
                      <td title={t.job_profile ?? ''} style={{ ...TD, maxWidth: 220 }}><span style={{ fontSize: 10, color: '#111111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.job_profile ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('manager_name') && (
                      <td title={t.manager_name ?? ''} style={{ ...TD, maxWidth: 160 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.manager_name ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('replaced_emp_name') && (
                      <td title={t.replaced_emp_name ?? ''} style={{ ...TD, maxWidth: 160 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.replaced_emp_name ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('jr_id') && (
                      <td title={t.jr_id ?? ''} style={TD}><span style={{ fontSize: 11, color: '#2563EB', whiteSpace: 'nowrap' }}>{t.jr_id ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('ta_contact') && (
                      <td title={t.ta_contact ?? ''} style={{ ...TD, maxWidth: 140 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.ta_contact ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('comp_ratio') && (
                      <td title={t.comp_ratio != null ? String(t.comp_ratio) : ''} style={{ ...TD, textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>{t.comp_ratio != null ? t.comp_ratio.toFixed(2) : '—'}</span>
                      </td>
                    )}
                    {!hiddenCols.has('candidate_name') && (
                      <td title={t.candidate_name ?? ''} style={{ ...TD, maxWidth: 180 }}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.candidate_name ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('estimated_hire_date') && (
                      <td title={fmtDate(t.estimated_hire_date) ?? ''} style={TD}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(t.estimated_hire_date) ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('confirmed_start_date') && (
                      <td title={fmtDate(t.confirmed_start_date) ?? ''} style={TD}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(t.confirmed_start_date) ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('target_hire_date') && (
                      <td title={fmtDate(t.target_hire_date) ?? ''} style={TD}><span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(t.target_hire_date) ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('fp_and_a_approver_notes') && (
                      <td title={t.fp_and_a_approver_notes ?? ''} style={{ ...TD, maxWidth: 220 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.fp_and_a_approver_notes ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('fp_and_a_notes') && (
                      <td title={t.fp_and_a_notes ?? ''} style={{ ...TD, maxWidth: 220 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.fp_and_a_notes ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('tbh_description') && (
                      <td title={t.tbh_description ?? ''} style={{ ...TD, maxWidth: 220 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.tbh_description ?? '—'}</span></td>
                    )}
                    {!hiddenCols.has('ta_status_comments') && (
                      <td title={t.ta_status_comments ?? ''} style={{ ...TD, maxWidth: 220 }}><span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.ta_status_comments ?? '—'}</span></td>
                    )}

                    {/* Actions */}
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(t)} style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid #D1D5DB', color: '#374151', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>Edit</button>
                      <button onClick={() => setDeleteTarget(t)} style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 4, cursor: 'pointer' }}>Del</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={modalBox}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#111111' }}>{editTarget ? 'Edit TBH Code' : 'Add TBH Code'}</h2>

            <div style={row2}>
              <div>
                <label style={labelSt}>TBH ID *</label>
                <input style={{ ...inputSt, borderColor: tbhIdError ? tk.accent : '#D5D5D5' }} value={form.tbh_id} onChange={e => sf('tbh_id', e.target.value)} placeholder="e.g. TBH-2025-001" autoFocus />
                {tbhIdError && <span style={{ fontSize: 11, color: tk.accent, marginTop: 2, display: 'block' }}>{tbhIdError}</span>}
              </div>
              <div>
                <label style={labelSt}>Old TBH ID</label>
                <input style={inputSt} value={form.old_tbh} onChange={e => sf('old_tbh', e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Funding Year</label>
                <input type="number" min="2020" max="2035" style={inputSt} value={form.funding_year} onChange={e => sf('funding_year', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Hire Type</label>
                <select style={selectSt} value={form.hire_type} onChange={e => sf('hire_type', e.target.value)}>
                  {hireTypes.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Status</label>
                <select style={selectSt} value={form.req_status} onChange={e => sf('req_status', e.target.value)}>
                  {reqStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Region</label>
                <select style={selectSt} value={form.region_id} onChange={e => sf('region_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelSt}>Job Profile</label>
              <input style={inputSt} value={form.job_profile} onChange={e => sf('job_profile', e.target.value)} placeholder="e.g. Senior Network Engineer" />
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Manager</label>
                <input style={inputSt} value={form.manager_name} onChange={e => sf('manager_name', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>TA Contact</label>
                <input style={inputSt} value={form.ta_contact} onChange={e => sf('ta_contact', e.target.value)} />
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Target Hire Date</label>
                <input type="date" style={inputSt} value={form.target_hire_date} onChange={e => sf('target_hire_date', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Estimated Hire Date</label>
                <input type="date" style={inputSt} value={form.estimated_hire_date} onChange={e => sf('estimated_hire_date', e.target.value)} />
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>JR ID (Workday)</label>
                <input style={inputSt} value={form.jr_id} onChange={e => sf('jr_id', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Confirmed Start Date</label>
                <input type="date" style={inputSt} value={form.confirmed_start_date} onChange={e => sf('confirmed_start_date', e.target.value)} />
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Hire Source</label>
                <select style={inputSt} value={form.hire_source} onChange={e => sf('hire_source', e.target.value)}>
                  <option value="">— select —</option>
                  {hireSources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>{/* spacer */}</div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Comp Ratio</label>
                <input type="number" step="0.01" min="0" max="9.99" style={inputSt} value={form.comp_ratio} onChange={e => sf('comp_ratio', e.target.value)} placeholder="e.g. 1.05" />
              </div>
              <div>
                <label style={labelSt}>Candidate Name</label>
                <input style={inputSt} value={form.candidate_name} onChange={e => sf('candidate_name', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelSt}>TA Status Comments</label>
              <textarea style={{ ...inputSt, height: 44, resize: 'vertical' as const }} value={form.ta_status_comments} onChange={e => sf('ta_status_comments', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={labelSt}>Cost Centre</label>
                <input style={inputSt} value={form.cost_centre} onChange={e => sf('cost_centre', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Legal Entity</label>
                <input style={inputSt} value={form.legal_entity} onChange={e => sf('legal_entity', e.target.value)} />
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>In Summary</label>
                <input style={inputSt} value={form.in_summary} onChange={e => sf('in_summary', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Status / Query</label>
                <input style={inputSt} value={form.status_query} onChange={e => sf('status_query', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelSt}>PMO Comments</label>
              <textarea style={{ ...inputSt, height: 40, resize: 'vertical' as const }} value={form.pmo_comments} onChange={e => sf('pmo_comments', e.target.value)} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelSt}>Workforce Planning Comments</label>
              <textarea style={{ ...inputSt, height: 40, resize: 'vertical' as const }} value={form.wfp_comments} onChange={e => sf('wfp_comments', e.target.value)} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelSt}>Note from FP&amp;A Approver</label>
              <textarea style={{ ...inputSt, height: 40, resize: 'vertical' as const }} value={form.fp_and_a_approver_notes} onChange={e => sf('fp_and_a_approver_notes', e.target.value)} />
            </div>

            <div style={modalFooter}>
              <button style={btnSecondary} onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
              <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add TBH Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div style={{ ...modalBox, maxWidth: 380 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#111111' }}>Delete TBH Code</h2>
            <p style={{ color: '#555', fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
              Permanently delete <strong style={{ color: '#111' }}>{deleteTarget.tbh_id}</strong>? This cannot be undone.
            </p>
            <div style={modalFooter}>
              <button style={btnSecondary} onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button style={{ ...btnPrimary, background: '#DC2626' }} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {colFilter.renderDropdown()}
      {colFilter.renderFilterBar()}
    </div>
  );
}
