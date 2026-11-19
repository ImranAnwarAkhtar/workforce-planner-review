import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  smartsheetApi, changeRequestsApi, formUsersApi,
  type SmartsheetRow, type ChangeRequest, type FormUser,
} from '../services/api';
import { useColFilter } from '../hooks/useColFilter';
import PlanningCycleBanner from '../components/PlanningCycleBanner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_STATUSES = ['Open', 'In Progress', 'Actioned in Plan', 'On Hold'] as const;
type PlanStatus = typeof PLAN_STATUSES[number];

const STATUS_COLOURS: Record<PlanStatus, { bg: string; color: string; border: string }> = {
  'Open':             { bg: '#F2F3F4', color: '#5A657B', border: '#D1D5DB' },
  'In Progress':      { bg: '#EEF4FF', color: '#3B4ECA', border: '#C7D2FE' },
  'Actioned in Plan': { bg: '#DFFBE5', color: '#2A8346', border: '#6FCF97' },
  'On Hold':          { bg: '#FFF8E6', color: '#D97706', border: '#FEDC86' },
};

const INAPP_STATUS_COLOURS: Record<string, { bg: string; color: string; border: string }> = {
  'Pending':       { bg: '#FFF8E6', color: '#D97706', border: '#FEDC86' },
  'Approved':      { bg: '#DFFBE5', color: '#2A8346', border: '#6FCF97' },
  'Auto-Approved': { bg: '#DFFBE5', color: '#2A8346', border: '#6FCF97' },
  'Rejected':      { bg: '#FEE2E2', color: '#B91C1C', border: '#FCA5A5' },
};

const XSCALE_OPTIONS = [
  'xScale – No Change',
  'Retail – No Change',
  'Swap Between Retail & xScale',
] as const;

const CHANGE_REQUIRED_OPTIONS = [
  'Manager Change – Same Team',
  'Level or Role Change',
  'Location Change – Same Region',
  'Manager Change – Different Function or Team',
  'Manager Change – Across Regions',
] as const;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOURS[status as PlanStatus] ?? STATUS_COLOURS['Open'];
  return (
    <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

function InAppStatusBadge({ status }: { status: string }) {
  const c = INAPP_STATUS_COLOURS[status] ?? { bg: '#F2F3F4', color: '#5A657B', border: '#D1D5DB' };
  return (
    <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: 'smartsheet' | 'in_app' }) {
  const isInApp = source === 'in_app';
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700,
      background: isInApp ? '#EEF4FF' : '#F0F7FF',
      color: isInApp ? '#3B4ECA' : '#0369A1',
      border: `1px solid ${isInApp ? '#C7D2FE' : '#BAE6FD'}`,
      whiteSpace: 'nowrap', letterSpacing: '0.03em',
    }}>
      {isInApp ? 'In-App' : 'Smartsheet'}
    </span>
  );
}

// Convert a local ChangeRequest row into SmartsheetRow shape for merged list display
function localRowToSmartsheetRow(cr: ChangeRequest): SmartsheetRow {
  return {
    _rowId:           `in_app_${cr.id}`,
    _rowNumber:       cr.id,
    _planStatus:      cr.status,
    _planNotes:       null,
    _updatedByName:   cr.approved_by_name,
    _statusUpdatedAt: cr.approved_at,
    _tbhInPlan:       null,
    _newTbhInPlan:    null,
    _region:          cr.new_region_name,
    _discipline:      null,
    _source:          'in_app',
    // Map to Smartsheet column names used in the list table
    'TBH Code':       cr.tbh_id ?? cr.tbh_code_raw ?? '',
    'Current Manager': cr.current_manager ?? '',
    'Requestor Email': cr.requestor_email ?? '',
    'xScale v Retail': cr.xscale_vs_retail ?? '',
    'Change required': cr.change_type ?? '',
    'Comments':        cr.comments ?? '',
  };
}

// ---------------------------------------------------------------------------
// Searchable user dropdown
// ---------------------------------------------------------------------------

function UserEmailSelect({
  value, onChange, users, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  users: FormUser[];
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return users.slice(0, 20);
    const q = query.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 20);
  }, [query, users]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Search by name or email…"
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        style={{
          width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6,
          fontSize: 13, outline: 'none', boxSizing: 'border-box',
          background: disabled ? '#F9FAFB' : '#FFF',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#FFF', border: '1px solid #D1D5DB', borderTop: 'none',
          borderRadius: '0 0 6px 6px', maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {filtered.map(u => (
            <div
              key={u.id}
              onMouseDown={() => { onChange(u.email); setQuery(u.email); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                borderBottom: '1px solid #F0F2F5',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F3F4FF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#FFF')}
            >
              <div style={{ fontWeight: 600, color: '#111827' }}>{u.name}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{u.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change Form tab
// ---------------------------------------------------------------------------

interface FormState {
  tbh_code_raw: string;
  current_manager: string;
  requestor_email: string;
  xscale_vs_retail: string;
  change_required: string[];
}

const EMPTY_FORM: FormState = {
  tbh_code_raw: '',
  current_manager: '',
  requestor_email: '',
  xscale_vs_retail: '',
  change_required: [],
};

function ChangeForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [users,      setUsers]      = useState<FormUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    formUsersApi.list().then(setUsers).catch(() => {});
  }, []);

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.tbh_code_raw.trim())   e.tbh_code_raw   = 'TBH Code is required';
    if (!form.current_manager.trim()) e.current_manager = 'Current Manager is required';
    if (!form.requestor_email)        e.requestor_email = 'Requestor Email is required';
    if (!form.xscale_vs_retail)       e.xscale_vs_retail = 'xScale v Retail is required';
    if (!form.change_required.length) e.change_required = 'At least one change type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await changeRequestsApi.create({
        tbh_code_raw:     form.tbh_code_raw.trim(),
        change_type:      form.change_required.join(', '),
        current_manager:  form.current_manager.trim(),
        requestor_email:  form.requestor_email,
        xscale_vs_retail: form.xscale_vs_retail,
      });
      setSubmitted(true);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setErrors({ tbh_code_raw: (err as Error).message ?? 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#DFFBE5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Change Request Submitted</div>
        <div style={{ fontSize: 13, color: '#6B7280', maxWidth: 400, textAlign: 'center' }}>
          Your request has been received and is pending review. You can track its status in the List tab.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={() => setSubmitted(false)}
            style={{ padding: '8px 20px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13, background: '#FFF', cursor: 'pointer', color: '#374151' }}
          >
            Submit Another
          </button>
          <button
            onClick={onSubmitted}
            style={{ padding: '8px 20px', border: 'none', borderRadius: 7, fontSize: 13, background: '#E91C24', cursor: 'pointer', color: '#FFF', fontWeight: 600 }}
          >
            View in List
          </button>
        </div>
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' };
  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    padding: '7px 10px', border: `1px solid ${hasErr ? '#E91C24' : '#D1D5DB'}`, borderRadius: 6,
    fontSize: 13, outline: 'none', background: '#FFF',
  });
  const helperStyle: React.CSSProperties = { fontSize: 11, color: '#6B7280', marginTop: 2 };
  const errStyle: React.CSSProperties = { fontSize: 11, color: '#E91C24', marginTop: 2 };

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        {/* Form header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Headcount Change Request</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            Use this form to submit a headcount change. All requests are reviewed by PMO before action is taken.
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* TBH Code */}
            <div style={fieldStyle}>
              <label style={labelStyle}>TBH Code <span style={{ color: '#E91C24' }}>*</span></label>
              <input
                type="text"
                value={form.tbh_code_raw}
                onChange={e => setForm(f => ({ ...f, tbh_code_raw: e.target.value }))}
                placeholder="e.g. TBHXX_L0XXX_CXXX_MON YR"
                style={inputStyle(!!errors.tbh_code_raw)}
              />
              {errors.tbh_code_raw
                ? <span style={errStyle}>{errors.tbh_code_raw}</span>
                : <span style={helperStyle}>Enter the TBH Code for the headcount being changed</span>
              }
            </div>

            {/* Current Manager */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Current Manager <span style={{ color: '#E91C24' }}>*</span></label>
              <input
                type="text"
                value={form.current_manager}
                onChange={e => setForm(f => ({ ...f, current_manager: e.target.value }))}
                placeholder="Name of current Hiring Manager"
                style={inputStyle(!!errors.current_manager)}
              />
              {errors.current_manager
                ? <span style={errStyle}>{errors.current_manager}</span>
                : <span style={helperStyle}>Name of current Hiring Manager allocated to this Headcount</span>
              }
            </div>

            {/* Requestor Email */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Requestor Email <span style={{ color: '#E91C24' }}>*</span></label>
              <UserEmailSelect
                value={form.requestor_email}
                onChange={v => setForm(f => ({ ...f, requestor_email: v }))}
                users={users}
              />
              {errors.requestor_email && <span style={errStyle}>{errors.requestor_email}</span>}
            </div>

            {/* xScale v Retail */}
            <div style={fieldStyle}>
              <label style={labelStyle}>xScale v Retail <span style={{ color: '#E91C24' }}>*</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {XSCALE_OPTIONS.map(opt => {
                  const checked = form.xscale_vs_retail === opt;
                  return (
                    <label
                      key={opt}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                        border: `1px solid ${checked ? '#3B4ECA' : '#D1D5DB'}`,
                        borderRadius: 7, cursor: 'pointer',
                        background: checked ? '#EEF4FF' : '#FFF',
                        transition: 'border-color 0.1s, background 0.1s',
                      }}
                    >
                      <input
                        type="radio"
                        name="xscale_vs_retail"
                        value={opt}
                        checked={checked}
                        onChange={() => setForm(f => ({ ...f, xscale_vs_retail: opt }))}
                        style={{ accentColor: '#3B4ECA' }}
                      />
                      <span style={{ fontSize: 13, color: checked ? '#3B4ECA' : '#374151', fontWeight: checked ? 600 : 400 }}>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {errors.xscale_vs_retail && <span style={errStyle}>{errors.xscale_vs_retail}</span>}
            </div>

            {/* Change Required */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Change Required <span style={{ color: '#E91C24' }}>*</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CHANGE_REQUIRED_OPTIONS.map(opt => {
                  const checked = form.change_required.includes(opt);
                  return (
                    <label
                      key={opt}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                        border: `1px solid ${checked ? '#3B4ECA' : '#D1D5DB'}`,
                        borderRadius: 7, cursor: 'pointer',
                        background: checked ? '#EEF4FF' : '#FFF',
                        transition: 'border-color 0.1s, background 0.1s',
                      }}
                    >
                      <input
                        type="checkbox"
                        value={opt}
                        checked={checked}
                        onChange={e => setForm(f => ({
                          ...f,
                          change_required: e.target.checked
                            ? [...f.change_required, opt]
                            : f.change_required.filter(v => v !== opt),
                        }))}
                        style={{ accentColor: '#3B4ECA', width: 15, height: 15 }}
                      />
                      <span style={{ fontSize: 13, color: checked ? '#3B4ECA' : '#374151', fontWeight: checked ? 600 : 400 }}>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {errors.change_required && <span style={errStyle}>{errors.change_required}</span>}
            </div>

            {/* Submit */}
            <div style={{ paddingTop: 8, display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 28px', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700,
                  background: submitting ? '#F3F4F6' : '#E91C24', color: submitting ? '#9CA3AF' : '#FFF',
                  cursor: submitting ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Change Request'}
              </button>
              <button
                type="button"
                onClick={() => { setForm(EMPTY_FORM); setErrors({}); }}
                style={{ padding: '10px 20px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13, background: '#FFF', cursor: 'pointer', color: '#374151' }}
              >
                Reset
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List tab
// ---------------------------------------------------------------------------

function ChangeRequestList() {
  const [columns,       setColumns]       = useState<string[]>([]);
  const [ssRows,        setSsRows]        = useState<SmartsheetRow[]>([]);
  const [localRows,     setLocalRows]     = useState<ChangeRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [savingRow,     setSavingRow]     = useState<string | null>(null);
  const [filterStatus,     setFilterStatus]     = useState('');
  const [filterChangeType, setFilterChangeType] = useState('');
  const [filterRegion,     setFilterRegion]     = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [filterSource,     setFilterSource]     = useState('');
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ssData, localData] = await Promise.all([
        smartsheetApi.changeRequests(),
        changeRequestsApi.list({ limit: 500 }),
      ]);
      setColumns(ssData.columns);
      setSsRows(ssData.rows);
      setLocalRows(localData);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Merge: Smartsheet rows first, then in-app rows normalized
  const rows = useMemo<SmartsheetRow[]>(() => [
    ...ssRows.map(r => ({ ...r, _source: 'smartsheet' as const })),
    ...localRows.map(localRowToSmartsheetRow),
  ], [ssRows, localRows]);

  async function handleStatusChange(rowId: string, status: string) {
    setSavingRow(rowId);
    try {
      await smartsheetApi.setStatus(rowId, status);
      setSsRows(prev => prev.map(r => r._rowId === rowId ? { ...r, _planStatus: status } : r));
    } catch {
      // silent
    } finally {
      setSavingRow(null);
    }
  }

  const changeTypes = useMemo(
    () => Array.from(new Set(rows.map(r => r['Change required']).filter(Boolean) as string[])).sort(),
    [rows]
  );
  const regions = useMemo(
    () => Array.from(new Set(rows.map(r => r._region).filter(Boolean) as string[])).sort(),
    [rows]
  );
  const disciplines = useMemo(
    () => Array.from(new Set(rows.map(r => r._discipline).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const crColDefs = useMemo(() => [
    { key: '_source_badge', label: 'Source', get: (r: SmartsheetRow) => r._source as string ?? 'smartsheet' },
    ...columns.map(col => ({
      key: col,
      label: col,
      get: (r: SmartsheetRow) => r[col] != null ? String(r[col]) : '',
    })),
    { key: '_planStatus', label: 'Status', get: (r: SmartsheetRow) => r._planStatus ?? 'Open' },
  ], [columns]);

  const colFilter = useColFilter(rows, crColDefs);

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      if (filterStatus     && r._planStatus           !== filterStatus)     return false;
      if (filterChangeType && r['Change required']    !== filterChangeType) return false;
      if (filterRegion     && r._region               !== filterRegion)     return false;
      if (filterDiscipline && r._discipline           !== filterDiscipline) return false;
      if (filterSource     && r._source               !== filterSource)     return false;
      return true;
    });
    return colFilter.applyToList(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterStatus, filterChangeType, filterRegion, filterDiscipline, filterSource, colFilter.colFilters, colFilter.sortConfig]);

  const counts = useMemo(() => ({
    total:         rows.length,
    smartsheet:    rows.filter(r => r._source !== 'in_app').length,
    inApp:         rows.filter(r => r._source === 'in_app').length,
    open:          ssRows.filter(r => r._planStatus === 'Open').length,
    inProgress:    ssRows.filter(r => r._planStatus === 'In Progress').length,
    actioned:      ssRows.filter(r => r._planStatus === 'Actioned in Plan').length,
    onHold:        ssRows.filter(r => r._planStatus === 'On Hold').length,
    tbhInPlan:     ssRows.filter(r => r._tbhInPlan === true).length,
    newTbhInPlan:  ssRows.filter(r => r._newTbhInPlan === true).length,
  }), [rows, ssRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Stats banner */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'stretch',
        background: '#FFFFFF', border: '1px solid #E0E3E8',
        borderRadius: 8, marginBottom: 8, overflow: 'hidden',
      }}>
        {[
          { label: 'Total',       value: counts.total,      color: '#5A657B' },
          { label: 'Smartsheet',  value: counts.smartsheet, color: '#0369A1' },
          { label: 'In-App',      value: counts.inApp,      color: '#3B4ECA' },
          { label: 'Open',        value: counts.open,       color: '#5A657B' },
          { label: 'In Progress', value: counts.inProgress, color: '#3B4ECA' },
          { label: 'Actioned',    value: counts.actioned,   color: '#2A8346' },
          { label: 'On Hold',     value: counts.onHold,     color: '#D97706' },
        ].map(({ label, value, color }, i) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '6px 10px', flex: '1 1 auto',
            borderRight: '1px solid #E0E3E8',
            borderLeft: i === 3 ? '3px solid #E0E3E8' : undefined,
            minWidth: 0,
          }}>
            <span style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          </div>
        ))}
        {[
          { label: 'TBH In Plan',     value: counts.tbhInPlan,    total: ssRows.filter(r => r['TBH Code']).length },
          { label: 'New TBH In Plan', value: counts.newTbhInPlan, total: ssRows.filter(r => r['New TBH Code']).length },
        ].map(({ label, value, total }, i) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '6px 10px', flex: '1 1 auto',
            borderLeft: i === 0 ? '3px solid #E0E3E8' : undefined,
            borderRight: '1px solid #E0E3E8', minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#2A8346', lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}>/{total}</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 14px', flexShrink: 0 }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{ padding: '5px 14px', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 12, color: '#374151', background: '#FFF', cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <PlanningCycleBanner />

      {/* Filter bar */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        background: '#F8F9FA', border: '1px solid #E0E3E8', borderRadius: 8,
        padding: '8px 14px', marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Filter</span>
        {([
          { label: 'Source',      value: filterSource,      set: setFilterSource,      options: ['smartsheet', 'in_app'] as string[] },
          { label: 'Change Type', value: filterChangeType,  set: setFilterChangeType,  options: changeTypes },
          { label: 'Region',      value: filterRegion,      set: setFilterRegion,      options: regions },
          { label: 'Discipline',  value: filterDiscipline,  set: setFilterDiscipline,  options: disciplines },
          { label: 'Plan Status', value: filterStatus,      set: setFilterStatus,      options: PLAN_STATUSES as unknown as string[] },
        ]).map(({ label, value, set, options }) => (
          <select
            key={label}
            value={value}
            onChange={e => set(e.target.value)}
            style={{
              padding: '5px 10px', border: `1px solid ${value ? '#3B4ECA' : '#D5D5D5'}`,
              borderRadius: 6, fontSize: 12,
              color: value ? '#111827' : '#6B7280',
              background: value ? '#EEF4FF' : '#FFF',
              cursor: 'pointer', maxWidth: 180,
            }}
          >
            <option value="">All {label}s</option>
            {options.map(o => <option key={o} value={o}>{o === 'in_app' ? 'In-App' : o === 'smartsheet' ? 'Smartsheet' : o}</option>)}
          </select>
        ))}
        {(filterSource || filterChangeType || filterRegion || filterDiscipline || filterStatus) && (
          <button
            onClick={() => { setFilterSource(''); setFilterChangeType(''); setFilterRegion(''); setFilterDiscipline(''); setFilterStatus(''); }}
            style={{ padding: '5px 10px', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', background: '#FEF2F2', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ✕ Clear all
          </button>
        )}
      </div>

      {colFilter.renderFilterBar()}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #E0E3E8', borderRadius: 8, background: '#FFFFFF' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8B93A3', fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#E91C24', fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>{error}</div>
            <button onClick={loadData} style={{ padding: '6px 16px', border: '1px solid #D5D5D5', borderRadius: 6, background: '#FFF', fontSize: 12, cursor: 'pointer' }}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8B93A3', fontSize: 13 }}>
            {rows.length === 0 ? 'No data' : 'No rows match the selected filter'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                {crColDefs.map(col => (
                  <th key={col.key} style={{
                    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                    color: col.key === '_planStatus' ? '#E91C24' : col.key === '_source_badge' ? '#0369A1' : '#666666',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    whiteSpace: 'nowrap', background: '#E4E6EA',
                    borderBottom: '2px solid #C8CCD4',
                    position: 'sticky', top: 0, zIndex: 1,
                    minWidth: col.key === '_planStatus' ? 160 : col.key === '_source_badge' ? 90 : undefined,
                    userSelect: 'none',
                  }}>
                    {col.key === '_source_badge' ? 'Source' : colFilter.renderHeaderContent(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const isExpanded = expandedRow === row._rowId;
                const isInApp = row._source === 'in_app';
                const planStatus = (row._planStatus || 'Open') as PlanStatus;
                return (
                  <tr
                    key={row._rowId}
                    style={{ borderBottom: '1px solid #F0F2F5', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC', cursor: 'pointer' }}
                    onClick={() => setExpandedRow(isExpanded ? null : row._rowId)}
                  >
                    {/* Source badge cell */}
                    <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                      <SourceBadge source={isInApp ? 'in_app' : 'smartsheet'} />
                    </td>
                    {/* Data columns */}
                    {columns.map(col => {
                      const val = row[col];
                      const isTbhCol    = col === 'TBH Code';
                      const isNewTbhCol = col === 'New TBH Code';
                      const inPlan = isTbhCol ? row._tbhInPlan : isNewTbhCol ? row._newTbhInPlan : undefined;
                      return (
                        <td key={col} style={{
                          padding: '8px 14px', color: '#374151',
                          borderRight: '1px solid #F0F2F5',
                          maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: isExpanded ? 'normal' : 'nowrap',
                          verticalAlign: 'top',
                        }}
                          title={val != null ? String(val) : undefined}
                        >
                          {(isTbhCol || isNewTbhCol) && val != null && val !== '' && !isInApp ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              whiteSpace: 'nowrap',
                              ...(inPlan === true  ? { background: '#DFFBE5', color: '#2A8346', border: '1px solid #6FCF97' } :
                                  inPlan === false ? { background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5' } :
                                                    { background: '#F2F3F4', color: '#5A657B', border: '1px solid #D1D5DB' }),
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                background: inPlan === true ? '#2A8346' : inPlan === false ? '#B91C1C' : '#9CA3AF' }} />
                              {String(val)}
                            </span>
                          ) : val != null && val !== '' ? String(val) : (
                            <span style={{ color: '#C9CDD4' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    {/* Status cell */}
                    <td style={{ padding: '6px 14px', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                      {isInApp ? (
                        <div>
                          <InAppStatusBadge status={row._planStatus ?? 'Pending'} />
                          {row._statusUpdatedAt && (
                            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
                              {new Date(row._statusUpdatedAt as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              {row._updatedByName ? ` · ${row._updatedByName}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <select
                            value={planStatus}
                            disabled={savingRow === row._rowId}
                            onChange={e => handleStatusChange(row._rowId, e.target.value)}
                            style={{
                              padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                              fontWeight: 600, outline: 'none', minWidth: 140,
                              background: STATUS_COLOURS[planStatus]?.bg ?? '#F2F3F4',
                              color:      STATUS_COLOURS[planStatus]?.color ?? '#5A657B',
                              border:     `1px solid ${STATUS_COLOURS[planStatus]?.border ?? '#D1D5DB'}`,
                            }}
                          >
                            {PLAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {savingRow === row._rowId && (
                            <span style={{ fontSize: 10, color: '#8B93A3' }}>Saving…</span>
                          )}
                          {row._statusUpdatedAt && (
                            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
                              Updated {new Date(row._statusUpdatedAt as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              {row._updatedByName ? ` · ${row._updatedByName}` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={{ flexShrink: 0, marginTop: 8, fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
          {filtered.length} of {rows.length} rows · {counts.smartsheet} from Smartsheet · {counts.inApp} in-app · Click a row to expand
        </div>
      )}

      {colFilter.renderDropdown()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type Tab = 'list' | 'form';

export default function ChangeRequests() {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [listKey, setListKey] = useState(0);

  function handleFormSubmitted() {
    setActiveTab('list');
    setListKey(k => k + 1);
  }

  const TAB_BTN = (tab: Tab, label: string) => {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        style={{
          padding: '8px 20px', border: 'none', borderRadius: '6px 6px 0 0',
          fontSize: 13, fontWeight: active ? 700 : 500,
          cursor: 'pointer',
          background: active ? '#FFFFFF' : 'transparent',
          color: active ? '#E91C24' : '#5A657B',
          borderBottom: active ? '2px solid #E91C24' : '2px solid transparent',
          transition: 'all 0.1s',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#111111' }}>

      {/* Page header */}
      <div style={{
        flexShrink: 0,
        background: '#FFFFFF', borderBottom: '1px solid #E0E3E8',
        marginBottom: 0, padding: '8px 16px 0',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Change Requests</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {TAB_BTN('list', 'List')}
          {TAB_BTN('form', 'Change Form')}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 0 0' }}>
        {activeTab === 'list'
          ? <ChangeRequestList key={listKey} />
          : <ChangeForm onSubmitted={handleFormSubmitted} />
        }
      </div>

    </div>
  );
}
