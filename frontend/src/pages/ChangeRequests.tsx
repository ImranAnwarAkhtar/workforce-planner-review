import { useEffect, useState, useMemo, useCallback } from 'react';
import { smartsheetApi, type SmartsheetRow } from '../services/api';

// ---------------------------------------------------------------------------
// Plan status config
// ---------------------------------------------------------------------------

const PLAN_STATUSES = ['Open', 'In Progress', 'Actioned in Plan', 'On Hold'] as const;
type PlanStatus = typeof PLAN_STATUSES[number];

const STATUS_COLOURS: Record<PlanStatus, { bg: string; color: string; border: string }> = {
  'Open':             { bg: '#F2F3F4', color: '#5A657B', border: '#D1D5DB' },
  'In Progress':      { bg: '#EEF4FF', color: '#3B4ECA', border: '#C7D2FE' },
  'Actioned in Plan': { bg: '#DFFBE5', color: '#2A8346', border: '#6FCF97' },
  'On Hold':          { bg: '#FFF8E6', color: '#D97706', border: '#FEDC86' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOURS[status as PlanStatus] ?? STATUS_COLOURS['Open'];
  return (
    <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChangeRequests() {
  const [columns,    setColumns]    = useState<string[]>([]);
  const [rows,       setRows]       = useState<SmartsheetRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [savingRow,  setSavingRow]  = useState<string | null>(null);
  const [filterStatus,     setFilterStatus]     = useState('');
  const [filterChangeType, setFilterChangeType] = useState('');
  const [filterRegion,     setFilterRegion]     = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await smartsheetApi.changeRequests();
      setColumns(data.columns);
      setRows(data.rows);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleStatusChange(rowId: string, status: string) {
    setSavingRow(rowId);
    try {
      await smartsheetApi.setStatus(rowId, status);
      setRows(prev => prev.map(r => r._rowId === rowId ? { ...r, _planStatus: status } : r));
    } catch {
      // status change failed — revert visual is automatic on re-render
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

  const filtered = useMemo(() => rows.filter(r => {
    if (filterStatus     && r._planStatus                    !== filterStatus)     return false;
    if (filterChangeType && r['Change required']             !== filterChangeType) return false;
    if (filterRegion     && r._region                        !== filterRegion)     return false;
    if (filterDiscipline && r._discipline                    !== filterDiscipline) return false;
    return true;
  }), [rows, filterStatus, filterChangeType, filterRegion, filterDiscipline]);

  const counts = useMemo(() => ({
    total:         rows.length,
    open:          rows.filter(r => r._planStatus === 'Open').length,
    inProgress:    rows.filter(r => r._planStatus === 'In Progress').length,
    actioned:      rows.filter(r => r._planStatus === 'Actioned in Plan').length,
    onHold:        rows.filter(r => r._planStatus === 'On Hold').length,
    tbhInPlan:     rows.filter(r => r._tbhInPlan === true).length,
    newTbhInPlan:  rows.filter(r => r._newTbhInPlan === true).length,
  }), [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#111111' }}>

      {/* ── Banner ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'stretch',
        background: '#FFFFFF', border: '1px solid #E0E3E8', borderBottom: '3px solid #E91C24',
        borderRadius: 8, marginBottom: 8, overflow: 'hidden',
      }}>
        {/* Title */}
        <div style={{ padding: '9px 16px', borderRight: '1px solid #E0E3E8', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>Change Requests</span>
        </div>

        {/* Status stats */}
        {[
          { label: 'Total',       value: counts.total,      color: '#5A657B' },
          { label: 'Open',        value: counts.open,       color: '#5A657B' },
          { label: 'In Progress', value: counts.inProgress, color: '#3B4ECA' },
          { label: 'Actioned',    value: counts.actioned,   color: '#2A8346' },
          { label: 'On Hold',     value: counts.onHold,     color: '#D97706' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', flex: '1 1 auto', borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
            </div>
          </div>
        ))}

        {/* TBH stats — separated by a thicker left border on the first item */}
        {[
          { label: 'TBH In Plan',     value: counts.tbhInPlan,    total: rows.filter(r => r['TBH Code']).length },
          { label: 'New TBH In Plan', value: counts.newTbhInPlan, total: rows.filter(r => r['New TBH Code']).length },
        ].map(({ label, value, total }, i) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 10px', flex: '1 1 auto', borderLeft: i === 0 ? '3px solid #E0E3E8' : undefined, borderRight: '1px solid #E0E3E8', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#2A8346', lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}>/{total}</span>
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
            </div>
          </div>
        ))}

        {/* Refresh */}
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

      {/* ── Filter bar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        background: '#F8F9FA', border: '1px solid #E0E3E8', borderRadius: 8,
        padding: '8px 14px', marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Filter</span>
        {([
          { label: 'Change Type', value: filterChangeType, set: setFilterChangeType, options: changeTypes },
          { label: 'Region',      value: filterRegion,     set: setFilterRegion,     options: regions },
          { label: 'Discipline',  value: filterDiscipline, set: setFilterDiscipline, options: disciplines },
          { label: 'Plan Status', value: filterStatus,     set: setFilterStatus,     options: PLAN_STATUSES as unknown as string[] },
        ] as const).map(({ label, value, set, options }) => (
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
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {(filterChangeType || filterRegion || filterDiscipline || filterStatus) && (
          <button
            onClick={() => { setFilterChangeType(''); setFilterRegion(''); setFilterDiscipline(''); setFilterStatus(''); }}
            style={{ padding: '5px 10px', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', background: '#FEF2F2', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ✕ Clear all
          </button>
        )}
      </div>

      {/* ── Table / content ── */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #E0E3E8', borderRadius: 8, background: '#FFFFFF' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8B93A3', fontSize: 13 }}>
            Loading from Smartsheet…
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#E91C24', fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>{error}</div>
            <button
              onClick={loadData}
              style={{ padding: '6px 16px', border: '1px solid #D5D5D5', borderRadius: 6, background: '#FFF', fontSize: 12, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8B93A3', fontSize: 13 }}>
            {rows.length === 0 ? 'No data returned from Smartsheet' : 'No rows match the selected filter'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E0E3E8' }}>
                {columns.map(col => (
                  <th key={col} style={{
                    padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                    color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap', background: '#F8F9FA',
                    position: 'sticky', top: 0, zIndex: 1,
                    borderRight: '1px solid #E8EAED',
                  }}>
                    {col}
                  </th>
                ))}
                {/* Plan Status — extra editable column */}
                <th style={{
                  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: '#E91C24', textTransform: 'uppercase', letterSpacing: '0.06em',
                  whiteSpace: 'nowrap', background: '#F8F9FA',
                  position: 'sticky', top: 0, zIndex: 1, minWidth: 170,
                }}>
                  Plan Status ✎
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const isExpanded = expandedRow === row._rowId;
                const planStatus = (row._planStatus || 'Open') as PlanStatus;
                return (
                  <tr
                    key={row._rowId}
                    style={{ borderBottom: '1px solid #F0F2F5', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC', cursor: 'pointer' }}
                    onClick={() => setExpandedRow(isExpanded ? null : row._rowId)}
                  >
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
                          {(isTbhCol || isNewTbhCol) && val != null && val !== '' ? (
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
                    {/* Plan Status cell */}
                    <td style={{ padding: '6px 14px', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
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
                      </div>
                      {row._statusUpdatedAt && (
                        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
                          Updated {new Date(row._statusUpdatedAt as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {row._updatedByName ? ` · ${row._updatedByName}` : ''}
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

      {/* ── Source note ── */}
      {!loading && !error && rows.length > 0 && (
        <div style={{ flexShrink: 0, marginTop: 8, fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
          {filtered.length} of {rows.length} rows · Live from Smartsheet · Click a row to expand full text
        </div>
      )}
    </div>
  );
}
