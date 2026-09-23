import { useEffect, useState, useMemo, useCallback } from 'react';
import { tbhCodesApi, refDataApi, type TbhCode, type Region, type CreateTbhCodeBody } from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQ_STATUSES  = ['Open', 'In Progress', 'Offer Extended', 'Filled', 'On Hold', 'Cancelled'];
const HIRE_TYPES    = ['Net New', 'Backfill', 'Conversion', 'Uplift'];

const STATUS_META: Record<string, { color: string; bg: string; border: string }> = {
  'Open':           { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'In Progress':    { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  'Offer Extended': { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  'Filled':         { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  'On Hold':        { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  'Cancelled':      { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

// Colours shown in the dark banner stat items
const STATUS_BANNER_COLOR: Record<string, string> = {
  'Open':           '#60A5FA',
  'In Progress':    '#FBBF24',
  'Offer Extended': '#A78BFA',
  'Filled':         '#33A85C',
  'On Hold':        '#9CA3AF',
  'Cancelled':      '#F87171',
};

function statusMeta(s: string | null) {
  return STATUS_META[s ?? ''] ?? { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' };
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tk = { bg2: '#FFFFFF', border: '#E5E5E5', accent: '#E91C24', muted: '#666666' };
const card: React.CSSProperties    = { background: tk.bg2, border: `1px solid ${tk.border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const TH: React.CSSProperties     = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tk.muted, background: '#F8F9FA', borderBottom: `1px solid ${tk.border}`, whiteSpace: 'nowrap' };
const TD: React.CSSProperties     = { padding: '7px 12px', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle', fontSize: 13, color: '#111111' };
const inputSt: React.CSSProperties  = { width: '100%', padding: '8px 11px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const selectSt: React.CSSProperties = { ...inputSt, cursor: 'pointer' };
const labelSt: React.CSSProperties  = { display: 'block', fontSize: 11, fontWeight: 700, color: tk.muted, marginBottom: 4, letterSpacing: '0.07em', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties    = { padding: '8px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnCompact: React.CSSProperties   = { padding: '4px 10px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', background: 'transparent', color: '#555555', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 14, cursor: 'pointer' };
const overlay: React.CSSProperties   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 };
const modalBox: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 10, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', padding: '26px 30px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' };
const modalFooter: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, paddingTop: 18, borderTop: '1px solid #EEEEEE' };
const row2: React.CSSProperties     = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 };

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  tbh_id: string; old_tbh: string; funding_year: string; hire_type: string;
  region_id: string; project_type: string; legal_entity: string; location_code: string;
  cost_centre: string; job_profile: string; replaced_emp_name: string; manager_name: string;
  target_hire_date: string; jr_id: string; req_status: string; ta_contact: string;
  candidate_name: string; estimated_hire_date: string; ta_status_comments: string;
  tbh_description: string; fp_and_a_notes: string;
}

const emptyForm: FormState = {
  tbh_id: '', old_tbh: '', funding_year: String(new Date().getFullYear()),
  hire_type: 'Net New', region_id: '', project_type: '', legal_entity: '', location_code: '',
  cost_centre: '', job_profile: '', replaced_emp_name: '', manager_name: '',
  target_hire_date: '', jr_id: '', req_status: 'Open', ta_contact: '', candidate_name: '',
  estimated_hire_date: '', ta_status_comments: '', tbh_description: '', fp_and_a_notes: '',
};

function tbhToForm(t: TbhCode): FormState {
  return {
    tbh_id: t.tbh_id, old_tbh: t.old_tbh ?? '', funding_year: t.funding_year ? String(t.funding_year) : '',
    hire_type: t.hire_type ?? 'Net New', region_id: t.region_id ? String(t.region_id) : '',
    project_type: t.project_type ?? '', legal_entity: t.legal_entity ?? '', location_code: t.location_code ?? '',
    cost_centre: t.cost_centre ?? '', job_profile: t.job_profile ?? '', replaced_emp_name: t.replaced_emp_name ?? '',
    manager_name: t.manager_name ?? '', target_hire_date: t.target_hire_date ? t.target_hire_date.slice(0, 10) : '',
    jr_id: t.jr_id ?? '', req_status: t.req_status ?? 'Open', ta_contact: t.ta_contact ?? '',
    candidate_name: t.candidate_name ?? '', estimated_hire_date: t.estimated_hire_date ? t.estimated_hire_date.slice(0, 10) : '',
    ta_status_comments: t.ta_status_comments ?? '', tbh_description: t.tbh_description ?? '', fp_and_a_notes: t.fp_and_a_notes ?? '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Recruitment() {
  const [tbhCodes, setTbhCodes] = useState<TbhCode[]>([]);
  const [regions,  setRegions]  = useState<Region[]>([]);

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

  const [importing,    setImporting]    = useState(false);
  const [importMsg,    setImportMsg]    = useState<string | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true); setImportMsg(null);
    try {
      const result = await tbhCodesApi.importExcel(file);
      setImportMsg(`Import complete — ${result.inserted} added, ${result.updated} updated, ${result.skipped} skipped`);
      loadData();
    } catch (err: unknown) {
      setImportMsg(`Import failed: ${(err as Error).message}`);
    } finally { setImporting(false); }
  }

  useEffect(() => { refDataApi.regions().then(setRegions).catch(() => {}); }, []);

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

  const filtered = useMemo(() => {
    if (!search.trim()) return tbhCodes;
    const q = search.toLowerCase();
    return tbhCodes.filter(t =>
      t.tbh_id.toLowerCase().includes(q) ||
      (t.job_profile ?? '').toLowerCase().includes(q) ||
      (t.candidate_name ?? '').toLowerCase().includes(q) ||
      (t.manager_name ?? '').toLowerCase().includes(q) ||
      (t.region_name ?? '').toLowerCase().includes(q)
    );
  }, [tbhCodes, search]);

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
        old_tbh:             form.old_tbh             || null,
        funding_year:        form.funding_year         ? parseInt(form.funding_year, 10)  : null,
        hire_type:           form.hire_type            || null,
        region_id:           form.region_id            ? parseInt(form.region_id, 10)     : null,
        project_type:        form.project_type         || null,
        legal_entity:        form.legal_entity         || null,
        location_code:       form.location_code        || null,
        cost_centre:         form.cost_centre          || null,
        job_profile:         form.job_profile          || null,
        replaced_emp_name:   form.replaced_emp_name    || null,
        manager_name:        form.manager_name         || null,
        target_hire_date:    form.target_hire_date     || null,
        jr_id:               form.jr_id                || null,
        req_status:          form.req_status           || null,
        ta_contact:          form.ta_contact           || null,
        candidate_name:      form.candidate_name       || null,
        estimated_hire_date: form.estimated_hire_date  || null,
        ta_status_comments:  form.ta_status_comments   || null,
        tbh_description:     form.tbh_description      || null,
        fp_and_a_notes:      form.fp_and_a_notes       || null,
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
        {REQ_STATUSES.map(s => (
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
          <label style={{ ...btnCompact, cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1 }}>
            {importing ? 'Importing…' : 'Import Excel'}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} disabled={importing} />
          </label>
          <button style={btnCompact} onClick={openAdd}>+ Add TBH</button>
        </div>
      </div>

      {/* Import result banner */}
      {importMsg && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 6, fontSize: 12, background: importMsg.startsWith('Import failed') ? '#FEF2F2' : '#ECFDF5', color: importMsg.startsWith('Import failed') ? '#DC2626' : '#059669', border: `1px solid ${importMsg.startsWith('Import failed') ? '#FECACA' : '#A7F3D0'}` }}>
          {importMsg}
          <button onClick={() => setImportMsg(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13 }}>×</button>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ padding: '6px 10px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, outline: 'none', flex: '1 1 180px', maxWidth: 260 }}
          placeholder="Search TBH ID, role, candidate, manager…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={{ padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {REQ_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ padding: '6px 8px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6, color: '#111111', fontSize: 12, cursor: 'pointer', outline: 'none' }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>FY{y}</option>)}
        </select>
        {!loading && <span style={{ color: '#888', fontSize: 12 }}>{filtered.length} records</span>}
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>TBH ID</th>
                <th style={TH}>Job Profile</th>
                <th style={TH}>Region</th>
                <th style={TH}>Type</th>
                <th style={TH}>Status</th>
                <th style={TH}>Hire Date</th>
                <th style={TH}>Manager</th>
                <th style={{ ...TH, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const m = statusMeta(t.req_status);
                const hireDate = fmtDate(t.target_hire_date) ?? fmtDate(t.estimated_hire_date);
                return (
                  <tr key={t.id} style={{ background: '#FFFFFF' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>

                    {/* TBH ID + FY inline */}
                    <td style={{ ...TD, maxWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ fontWeight: 600, color: '#111111', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{t.tbh_id}</span>
                        {t.funding_year && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#666', background: '#F3F4F6', padding: '1px 5px', borderRadius: 3 }}>FY{t.funding_year}</span>
                        )}
                      </div>
                    </td>

                    {/* Job profile */}
                    <td style={{ ...TD, maxWidth: 220 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111111' }}>{t.job_profile ?? '—'}</span>
                    </td>

                    {/* Region */}
                    <td style={TD}>
                      <span style={{ color: t.region_name ? '#374151' : '#9CA3AF', fontSize: 12 }}>{t.region_name ?? '—'}</span>
                    </td>

                    {/* Hire type pill */}
                    <td style={TD}>
                      {t.hire_type ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{t.hire_type}</span>
                      ) : <span style={{ color: '#9CA3AF' }}>—</span>}
                    </td>

                    {/* Status pill */}
                    <td style={TD}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>
                        {t.req_status ?? 'Unknown'}
                      </span>
                    </td>

                    {/* Hire date */}
                    <td style={TD}>
                      <span style={{ color: hireDate ? '#374151' : '#9CA3AF', fontSize: 12 }}>{hireDate ?? '—'}</span>
                    </td>

                    {/* Manager */}
                    <td style={{ ...TD, maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontSize: 12 }}>{t.manager_name ?? '—'}</span>
                    </td>

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
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={modalBox}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, color: '#111111' }}>{editTarget ? 'Edit TBH Code' : 'Add TBH Code'}</h2>

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
                  {HIRE_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={row2}>
              <div>
                <label style={labelSt}>Status</label>
                <select style={selectSt} value={form.req_status} onChange={e => sf('req_status', e.target.value)}>
                  {REQ_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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

            <div style={{ marginBottom: 14 }}>
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
                <label style={labelSt}>Candidate Name</label>
                <input style={inputSt} value={form.candidate_name} onChange={e => sf('candidate_name', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>JR ID (Workday)</label>
                <input style={inputSt} value={form.jr_id} onChange={e => sf('jr_id', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>TA Status Comments</label>
              <textarea style={{ ...inputSt, height: 60, resize: 'vertical' as const }} value={form.ta_status_comments} onChange={e => sf('ta_status_comments', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelSt}>Cost Centre</label>
                <input style={inputSt} value={form.cost_centre} onChange={e => sf('cost_centre', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Legal Entity</label>
                <input style={inputSt} value={form.legal_entity} onChange={e => sf('legal_entity', e.target.value)} />
              </div>
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
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#111111' }}>Delete TBH Code</h2>
            <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
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
    </div>
  );
}
