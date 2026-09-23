import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  headcountApi, refDataApi, tbhCodesApi,
  type Person, type Discipline, type Level, type Country,
} from '../services/api';
import PersonEditPanel from '../components/PersonEditPanel';

const DISCIPLINES = ['Construction', 'Design', 'Commercial', 'Commissioning', 'Other'];

const DISCIPLINE_COLOURS: Record<string, string> = {
  'Construction': '#086AE3',
  'Design':       '#33A85C',
  'Commercial':   '#FDB90D',
  'Commissioning':'#00737A',
  'Other':        '#8B93A3',
};
const DISC_LABEL_COLOR = (disc: string): string => {
  const c = DISCIPLINE_COLOURS[disc] ?? '#444444';
  return c === '#FDB90D' ? '#C59000' : c;
};

const TYPE_META: Record<string, { label: string; bg: string; color: string; border: string; bannerColor: string }> = {
  'R FTE': { label: 'R FTE', bg: '#FFEBEE', color: '#AD050C', border: '#E91C24', bannerColor: '#E91C24' },
  'R CON': { label: 'R CON', bg: '#FFF1CC', color: '#FDB90D', border: '#FEDC86', bannerColor: '#FDB90D' },
  'A FTE': { label: 'A FTE', bg: '#DFFBE5', color: '#2A8346', border: '#33A85C', bannerColor: '#33A85C' },
  'A CON': { label: 'A CON', bg: '#CCE3FF', color: '#00408C', border: '#086AE3', bannerColor: '#086AE3' },
};

const SEL: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid #D5D5D5',
  borderRadius: 4, fontSize: 12, color: '#111111', background: '#FFFFFF',
};

export default function Headcount() {
  const [records, setRecords]         = useState<Person[]>([]);
  const [loading, setLoading]         = useState(false);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [levels, setLevels]           = useState<Level[]>([]);
  const [countries, setCountries]     = useState<Country[]>([]);
  const [tbhCodes, setTbhCodes]       = useState<{ id: number; tbh_id: string }[]>([]);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [discFilter, setDiscFilter] = useState('');

  // Edit panel (PersonEditPanel)
  const [editPerson, setEditPerson] = useState<Person | null>(null);

  // View detail modal
  const [viewTarget, setViewTarget] = useState<Person | null>(null);

  // Approve confirm
  const [approveTarget, setApproveTarget] = useState<Person | null>(null);
  const [approving, setApproving]         = useState(false);

  // Reject confirm
  const [rejectTarget, setRejectTarget] = useState<Person | null>(null);
  const [rejecting, setRejecting]       = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Convert to hire modal
  const [convertTarget, setConvertTarget] = useState<Person | null>(null);
  const [convertForm, setConvertForm]     = useState({
    name: '', new_contract_type_code: 'FTE', workday_jr_id: '', notes: '',
  });
  const [converting, setConverting] = useState(false);

  // Assign TBH
  const [tbhTarget, setTbhTarget] = useState<Person | null>(null);
  const [tbhValue, setTbhValue]   = useState('');
  const [savingTbh, setSavingTbh] = useState(false);

  // New request modal
  const [showNew, setShowNew]   = useState(false);
  const [newForm, setNewForm]   = useState({
    name: '', contract_type_code: 'R FTE' as 'R FTE' | 'R CON',
    discipline_id: '', level_id: '', country_id: '', notes: '',
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords(await headcountApi.list()); }
    catch { toast.error('Failed to load headcount records'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    Promise.all([
      refDataApi.disciplines(),
      refDataApi.levels(),
      refDataApi.countries(),
      tbhCodesApi.list({ limit: 500 }),
    ]).then(([d, l, c, t]) => {
      setDisciplines(d);
      setLevels(l);
      setCountries(c);
      setTbhCodes(t.map(x => ({ id: x.id, tbh_id: x.tbh_id })));
    }).catch(() => {});
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const updated = await headcountApi.approve(approveTarget.id);
      toast.success(`Approved → ${updated.contract_type_code}`);
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
      setApproveTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Approval failed');
    } finally { setApproving(false); }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await headcountApi.delete(rejectTarget.id);
      toast.success(`Request rejected and removed`);
      setRecords(prev => prev.filter(r => r.id !== rejectTarget.id));
      setRejectTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Rejection failed');
    } finally { setRejecting(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await headcountApi.delete(deleteTarget.id);
      toast.success('Record deleted');
      setRecords(prev => prev.filter(r => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed');
    } finally { setDeleting(false); }
  }

  async function handleAssignTbh() {
    if (!tbhTarget) return;
    setSavingTbh(true);
    try {
      const updated = await headcountApi.assignTbh(tbhTarget.id, tbhValue ? Number(tbhValue) : null);
      toast.success('TBH code assigned');
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
      setTbhTarget(null); setTbhValue('');
    } catch { toast.error('Failed to assign TBH'); }
    finally { setSavingTbh(false); }
  }

  async function handleConvert() {
    if (!convertTarget || !convertForm.name.trim()) { toast.error('Hire name is required'); return; }
    setConverting(true);
    try {
      const updated = await headcountApi.convert(convertTarget.id, {
        name:                   convertForm.name.trim(),
        new_contract_type_code: convertForm.new_contract_type_code,
        workday_jr_id:          convertForm.workday_jr_id.trim() || undefined,
        notes:                  convertForm.notes.trim() || undefined,
      });
      toast.success(`Converted to ${updated.contract_type_code} — ${updated.name}`);
      setRecords(prev => prev.filter(r => r.id !== updated.id));
      setConvertTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Conversion failed');
    } finally { setConverting(false); }
  }

  async function handleCreate() {
    if (!newForm.name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      const created = await headcountApi.create({
        name:               newForm.name.trim(),
        contract_type_code: newForm.contract_type_code,
        discipline_id:      newForm.discipline_id ? Number(newForm.discipline_id) : undefined,
        level_id:           newForm.level_id ? Number(newForm.level_id) : undefined,
        country_id:         newForm.country_id ? Number(newForm.country_id) : undefined,
        notes:              newForm.notes.trim() || undefined,
      });
      toast.success('Headcount request created');
      setRecords(prev => [created, ...prev]);
      setShowNew(false);
      setNewForm({ name: '', contract_type_code: 'R FTE', discipline_id: '', level_id: '', country_id: '', notes: '' });
    } catch { toast.error('Failed to create request'); }
    finally { setCreating(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = records.filter(r => {
    if (typeFilter && r.contract_type_code !== typeFilter) return false;
    if (discFilter && r.discipline_name !== discFilter) return false;
    return true;
  });

  const byDiscipline = DISCIPLINES.map(disc => ({
    discipline: disc,
    rows: filtered.filter(r => (r.discipline_name ?? 'Other') === disc),
  })).filter(g => g.rows.length > 0);

  const ungrouped = filtered.filter(r => !DISCIPLINES.includes(r.discipline_name ?? 'Other'));

  const counts = {
    total: records.length,
    rFte:  records.filter(r => r.contract_type_code === 'R FTE').length,
    rCon:  records.filter(r => r.contract_type_code === 'R CON').length,
    aFte:  records.filter(r => r.contract_type_code === 'A FTE').length,
    aCon:  records.filter(r => r.contract_type_code === 'A CON').length,
  };

  // ── Shared badge ─────────────────────────────────────────────────────────

  function TypeBadge({ code }: { code: string | null }) {
    const meta = TYPE_META[code ?? ''] ?? { label: code ?? '?', bg: '#F0F0F0', color: '#444444', border: '#D0D0D0' };
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
        whiteSpace: 'nowrap',
      }}>
        {code}
      </span>
    );
  }

  // ── Row render ────────────────────────────────────────────────────────────

  function RecordRow({ r }: { r: Person }) {
    const isRequested = r.contract_type_code === 'R FTE' || r.contract_type_code === 'R CON';
    const isApproved  = r.contract_type_code === 'A FTE' || r.contract_type_code === 'A CON';
    const allowedConversion = r.contract_type_code === 'A FTE' ? ['FTE', 'SNR'] : ['CON'];

    return (
      <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
        <td style={{ padding: '8px 14px', width: 90 }}>
          <TypeBadge code={r.contract_type_code} />
        </td>
        <td style={{ padding: '8px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#111111' }}>{r.name}</div>
          {r.notes && (
            <div style={{ fontSize: 11, color: '#777777', marginTop: 2, maxWidth: 300,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.notes}
            </div>
          )}
        </td>
        <td style={{ padding: '8px 14px', fontSize: 12, color: '#444444' }}>
          {r.level_name ?? '—'}
        </td>
        <td style={{ padding: '8px 14px', fontSize: 12, color: '#444444' }}>
          {r.country_names || '—'}
        </td>
        <td style={{ padding: '8px 14px' }}>
          {r.tbh_id
            ? <span style={{ fontSize: 11, fontWeight: 600, color: '#33A85C', background: '#EBF7EF',
                padding: '2px 7px', borderRadius: 3, border: '1px solid #A8DDB5' }}>{r.tbh_id}</span>
            : <span style={{ fontSize: 11, color: '#AAAAAA' }}>—</span>}
        </td>
        <td style={{ padding: '8px 14px' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* View */}
            <button onClick={() => setViewTarget(r)} style={BTN_VIEW}>View</button>

            {/* Edit */}
            <button onClick={() => setEditPerson(r)} style={BTN_EDIT}>Edit</button>

            {/* Approve (R FTE / R CON) */}
            {isRequested && (
              <button onClick={() => setApproveTarget(r)} style={BTN_APPROVE}>✓ Approve</button>
            )}

            {/* Reject (R FTE / R CON) */}
            {isRequested && (
              <button onClick={() => setRejectTarget(r)} style={BTN_REJECT}>✗ Reject</button>
            )}

            {/* TBH + Convert (A FTE / A CON) */}
            {isApproved && (
              <>
                <button onClick={() => { setTbhTarget(r); setTbhValue(String(r.tbh_code_id ?? '')); }} style={BTN_TBH}>
                  TBH Code
                </button>
                <button onClick={() => {
                  setConvertTarget(r);
                  setConvertForm({ name: '', new_contract_type_code: allowedConversion[0], workday_jr_id: '', notes: r.notes ?? '' });
                }} style={BTN_CONVERT}>
                  → Convert
                </button>
              </>
            )}

            {/* Delete (all) */}
            <button onClick={() => setDeleteTarget(r)} style={BTN_DELETE}>🗑</button>
          </div>
        </td>
      </tr>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const bannerStats = [
    { label: 'Total',  value: counts.total, color: '#2F3541' },
    { label: 'R FTE',  value: counts.rFte,  color: TYPE_META['R FTE'].bannerColor },
    { label: 'R CON',  value: counts.rCon,  color: TYPE_META['R CON'].bannerColor },
    { label: 'A FTE',  value: counts.aFte,  color: TYPE_META['A FTE'].bannerColor },
    { label: 'A CON',  value: counts.aCon,  color: TYPE_META['A CON'].bannerColor },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#111111' }}>

      {/* ── Banner: title + stats + new button ── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: '#FFFFFF', borderBottom: '3px solid #E91C24',
          borderRadius: '8px 8px 0 0', overflow: 'hidden',
        }}>
          {/* Title */}
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', borderRight: '1px solid #E0E3E8', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>Headcount Requests</span>
          </div>

          {/* Stats */}
          {bannerStats.map(s => (
            <div key={s.label} style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '6px 10px', flex: '1 1 auto', borderRight: '1px solid #E0E3E8', minWidth: 0,
            }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span style={{ fontSize: 7, color: '#9BA4B5', whiteSpace: 'nowrap' }}>· count</span>
              </div>
            </div>
          ))}

          {/* New request button */}
          <div style={{ padding: '0 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button onClick={() => setShowNew(true)} style={{
              padding: '5px 12px', background: '#E91C24', color: '#FFFFFF',
              border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              + New Request
            </button>
          </div>
        </div>

        {/* Sub-bar: filters */}
        <div style={{ padding: '10px 16px', background: '#F2F3F5', borderBottom: '1px solid #E0E3E8', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={SEL}>
            <option value="">All types</option>
            <option value="R FTE">R FTE — Requested FTE</option>
            <option value="R CON">R CON — Requested Contract</option>
            <option value="A FTE">A FTE — Approved FTE</option>
            <option value="A CON">A CON — Approved Contract</option>
          </select>
          <select value={discFilter} onChange={e => setDiscFilter(e.target.value)} style={SEL}>
            <option value="">All disciplines</option>
            {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {(typeFilter || discFilter) && (
            <button onClick={() => { setTypeFilter(''); setDiscFilter(''); }} style={{
              padding: '4px 10px', background: 'transparent', border: '1px solid #D5D5D5',
              borderRadius: 4, fontSize: 11, color: '#555', cursor: 'pointer',
            }}>✕ Clear</button>
          )}
          <button onClick={load} style={{
            padding: '5px 12px', background: 'transparent',
            border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 12,
            color: '#555555', cursor: 'pointer', marginLeft: 'auto',
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 40, color: '#888' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888888' }}>
            No headcount requests found.
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Use "+ New Request" or the "Request headcount" button in the Allocations table.
            </div>
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8F9FA', position: 'sticky', top: 0 }}>
                <th style={TH}>Type</th>
                <th style={TH}>Name / Placeholder</th>
                <th style={TH}>Level</th>
                <th style={TH}>Country</th>
                <th style={TH}>TBH Code</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {byDiscipline.map(({ discipline, rows }) => (
                <React.Fragment key={discipline}>
                  <tr>
                    <td colSpan={6} style={{
                      padding: '8px 14px', background: '#F2F4F8',
                      borderLeft: `4px solid ${DISCIPLINE_COLOURS[discipline] ?? '#888888'}`,
                      borderTop: '2px solid #D8DDE8', borderBottom: '1px solid #D8DDE8',
                      fontWeight: 700, fontSize: 12, color: DISC_LABEL_COLOR(discipline),
                    }}>
                      {discipline} · {rows.length} {rows.length === 1 ? 'record' : 'records'}
                    </td>
                  </tr>
                  {rows.map(r => <RecordRow key={r.id} r={r} />)}
                </React.Fragment>
              ))}
              {ungrouped.length > 0 && (
                <React.Fragment>
                  <tr>
                    <td colSpan={6} style={{
                      padding: '8px 14px', background: '#F8F9FA',
                      fontWeight: 700, fontSize: 12, color: '#888888',
                    }}>
                      Unassigned discipline
                    </td>
                  </tr>
                  {ungrouped.map(r => <RecordRow key={r.id} r={r} />)}
                </React.Fragment>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Person edit panel ── */}
      <PersonEditPanel
        person={editPerson}
        onClose={() => setEditPerson(null)}
        onSaved={updated => {
          setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
          setEditPerson(null);
        }}
      />

      {/* ── View detail modal ── */}
      {viewTarget && (
        <Modal onClose={() => setViewTarget(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>{viewTarget.name}</div>
              <TypeBadge code={viewTarget.contract_type_code} />
            </div>
            <button onClick={() => setViewTarget(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 14 }}>
            {[
              ['Discipline',  viewTarget.discipline_name  ?? '—'],
              ['Level',       viewTarget.level_name        ?? '—'],
              ['Country',     viewTarget.country_names     || '—'],
              ['Region',      viewTarget.region_names      || '—'],
              ['TBH Code',    viewTarget.tbh_id            ?? 'Not assigned'],
              ['Created',     new Date(viewTarget.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
          {viewTarget.notes && (
            <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 12 }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes / Justification</div>
              <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{viewTarget.notes}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button onClick={() => { setViewTarget(null); setEditPerson(viewTarget); }} style={{ ...OK_BTN, flex: 'none', padding: '8px 20px' }}>
              Edit
            </button>
            <button onClick={() => setViewTarget(null)} style={{ ...CANCEL_BTN, flex: 'none', padding: '8px 20px' }}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* ── Approve confirm ── */}
      {approveTarget && (
        <Modal onClose={() => setApproveTarget(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Approve Headcount?</div>
          <p style={{ fontSize: 13, color: '#444444', margin: '0 0 16px' }}>
            This will change <strong>{approveTarget.name}</strong> from{' '}
            <strong>{approveTarget.contract_type_code}</strong> to{' '}
            <strong>{approveTarget.contract_type_code === 'R FTE' ? 'A FTE' : 'A CON'}</strong>.
            <br />A TBH code should then be assigned.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setApproveTarget(null)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleApprove} disabled={approving} style={OK_BTN}>
              {approving ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reject confirm ── */}
      {rejectTarget && (
        <Modal onClose={() => setRejectTarget(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#AD050C' }}>Reject Request?</div>
          <p style={{ fontSize: 13, color: '#444444', margin: '0 0 16px' }}>
            This will reject and permanently remove the headcount request for{' '}
            <strong>{rejectTarget.name}</strong> ({rejectTarget.contract_type_code}).
            This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setRejectTarget(null)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleReject} disabled={rejecting} style={{ ...OK_BTN, background: '#AD050C' }}>
              {rejecting ? 'Rejecting…' : 'Reject Request'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Delete Record?</div>
          <p style={{ fontSize: 13, color: '#444444', margin: '0 0 16px' }}>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong> ({deleteTarget.contract_type_code})?
            This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setDeleteTarget(null)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleDelete} disabled={deleting} style={{ ...OK_BTN, background: '#555555' }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Assign TBH ── */}
      {tbhTarget && (
        <Modal onClose={() => setTbhTarget(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Assign TBH Code</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>TBH Code</label>
            <select style={{ padding: '8px 10px', border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 13 }}
              value={tbhValue} onChange={e => setTbhValue(e.target.value)}>
              <option value="">— Remove assignment —</option>
              {tbhCodes.map(t => <option key={t.id} value={t.id}>{t.tbh_id}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setTbhTarget(null)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleAssignTbh} disabled={savingTbh} style={OK_BTN}>
              {savingTbh ? 'Saving…' : 'Assign TBH'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Convert to hire ── */}
      {convertTarget && (
        <Modal onClose={() => setConvertTarget(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Convert to Named Hire</div>
          <p style={{ fontSize: 12, color: '#666666', margin: '0 0 14px' }}>
            Converting <strong>{convertTarget.name}</strong> ({convertTarget.contract_type_code}).
            Enter the hire's real name and select the final contract type.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Hire's full name *">
              <input style={INP} value={convertForm.name}
                onChange={e => setConvertForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="First Last" />
            </Field>
            <Field label="Contract type *">
              <select style={INP} value={convertForm.new_contract_type_code}
                onChange={e => setConvertForm(prev => ({ ...prev, new_contract_type_code: e.target.value }))}>
                {(convertTarget.contract_type_code === 'A FTE' ? ['FTE', 'SNR'] : ['CON'])
                  .map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Workday JR ID">
              <input style={INP} value={convertForm.workday_jr_id}
                onChange={e => setConvertForm(prev => ({ ...prev, workday_jr_id: e.target.value }))}
                placeholder="JR-000000" />
            </Field>
            <Field label="Notes">
              <textarea rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }}
                value={convertForm.notes}
                onChange={e => setConvertForm(prev => ({ ...prev, notes: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setConvertTarget(null)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleConvert} disabled={converting} style={OK_BTN}>
              {converting ? 'Converting…' : 'Confirm Hire'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── New request modal ── */}
      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>New Headcount Request</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Placeholder name *">
              <input style={INP} value={newForm.name}
                onChange={e => setNewForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. TBH – Construction VP" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Type">
                <select style={INP} value={newForm.contract_type_code}
                  onChange={e => setNewForm(prev => ({ ...prev, contract_type_code: e.target.value as 'R FTE' | 'R CON' }))}>
                  <option value="R FTE">R FTE — Employee</option>
                  <option value="R CON">R CON — Contractor</option>
                </select>
              </Field>
              <Field label="Discipline">
                <select style={INP} value={newForm.discipline_id}
                  onChange={e => setNewForm(prev => ({ ...prev, discipline_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Level">
                <select style={INP} value={newForm.level_id}
                  onChange={e => setNewForm(prev => ({ ...prev, level_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {levels.map(l => <option key={l.id} value={l.id}>{l.level_name}</option>)}
                </select>
              </Field>
              <Field label="Country">
                <select style={INP} value={newForm.country_id}
                  onChange={e => setNewForm(prev => ({ ...prev, country_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes / Justification">
              <textarea rows={3} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }}
                value={newForm.notes}
                onChange={e => setNewForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Why is this role needed?" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowNew(false)} style={CANCEL_BTN}>Cancel</button>
            <button onClick={handleCreate} disabled={creating} style={OK_BTN}>
              {creating ? 'Creating…' : 'Submit Request'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared small components ────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11,
  color: '#666666', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', borderBottom: '1px solid #E0E0E0',
  whiteSpace: 'nowrap',
};

const INP: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #D5D5D5', borderRadius: 4,
  fontSize: 13, width: '100%', boxSizing: 'border-box', background: '#FFFFFF',
};

const CANCEL_BTN: React.CSSProperties = {
  flex: 1, padding: '9px 0', background: '#FFFFFF',
  border: '1px solid #D5D5D5', borderRadius: 5, fontSize: 13,
  color: '#555555', cursor: 'pointer',
};

const OK_BTN: React.CSSProperties = {
  flex: 2, padding: '9px 0', background: '#E91C24',
  border: 'none', borderRadius: 5, fontSize: 13,
  fontWeight: 600, color: '#FFFFFF', cursor: 'pointer',
};

// Action button styles
const BTN_BASE: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid',
};
const BTN_VIEW:    React.CSSProperties = { ...BTN_BASE, background: '#F8F9FA',  color: '#374151', borderColor: '#D1D5DB' };
const BTN_EDIT:    React.CSSProperties = { ...BTN_BASE, background: '#EFF6FF',  color: '#1D4ED8', borderColor: '#BFDBFE' };
const BTN_APPROVE: React.CSSProperties = { ...BTN_BASE, background: '#EBF7EF',  color: '#33A85C', borderColor: '#A8DDB5' };
const BTN_REJECT:  React.CSSProperties = { ...BTN_BASE, background: '#FEF3F2',  color: '#AD050C', borderColor: '#FBBDBA' };
const BTN_TBH:     React.CSSProperties = { ...BTN_BASE, background: '#EBF2FB',  color: '#086AE3', borderColor: '#A8C4E8' };
const BTN_CONVERT: React.CSSProperties = { ...BTN_BASE, background: '#FFF1CC',  color: '#FDB90D', borderColor: '#FEDC86' };
const BTN_DELETE:  React.CSSProperties = { ...BTN_BASE, background: 'transparent', color: '#9CA3AF', borderColor: '#E5E7EB', padding: '3px 7px' };

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 460, maxHeight: '85vh', overflowY: 'auto',
        background: '#FFFFFF', borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 501,
        padding: 24,
      }}>
        {children}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
