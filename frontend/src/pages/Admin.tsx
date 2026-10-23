import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { refDataApi, planningCyclesApi, cycleApproversApi, cycleStageAccessApi, gearingApi, alertsApi, peopleApi, type Discipline, type Level, type ContractType, type Region, type PlanningCycle, type CycleApprover, type CycleStageAccess, type GearingConstant, type AlertConfig, type AlertLog, type Person } from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';
import axios from 'axios';

const BASE = (process.env.REACT_APP_API_URL ?? 'http://localhost:3001') + '/api';
const rawClient = axios.create({ baseURL: BASE });

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tk = { bg2: '#FFFFFF', border: '#E5E5E5', accent: '#E91C24', muted: '#666666' };
const card: React.CSSProperties = { background: tk.bg2, border: `1px solid ${tk.border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#444444', background: '#E4E6EA', borderBottom: '2px solid #C8CCD4', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #F0F0F0', fontSize: 14, color: '#333333' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'transparent', color: '#555555', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 13, cursor: 'pointer' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.07em' };

function errMsg(e: unknown): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Operation failed';
}

interface User { id: number; name: string; email: string; role: string; system_profile: string | null; access_tier: string; is_active: boolean; created_at: string }

// ---------------------------------------------------------------------------
// Loading placeholder
// ---------------------------------------------------------------------------

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} style={td}><div style={{ height: 14, background: '#EEEEEE', borderRadius: 3, width: '70%' }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

function DisciplinesTab() {
  const [data, setData] = useState<Discipline[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  function load() {
    setLoading(true);
    refDataApi.disciplines().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await rawClient.post('/admin/disciplines', { name: formName.trim(), code: formCode.trim() || null });
      load(); setCreating(false); setFormName(''); setFormCode('');
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await rawClient.put(`/admin/disciplines/${id}`, { name: editName.trim(), code: editCode.trim() || null });
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try {
      await rawClient.delete(`/admin/disciplines/${id}`);
      load(); setDeletingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); setDeletingId(null); } finally { setSaving(false); }
  }

  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const delConfirmBtn: React.CSSProperties = { padding: '4px 10px', background: '#AD050C', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Manage project and people disciplines.</p>
        <button onClick={() => { setCreating(true); setEditingId(null); setDeletingId(null); }}
          style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Discipline</button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12 }}>New Discipline</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 200px' }}>
              <label style={lbl}>Name *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Construction"
                style={inp} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <label style={lbl}>Code</label>
              <input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="e.g. CON"
                style={{ ...inp, maxWidth: 120 }} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => { setCreating(false); setFormName(''); }} style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !formName.trim()}
              style={{ padding: '7px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: !formName.trim() ? 0.6 : 1 }}>
              {saving ? 'Savingâ€¦' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={{ ...th, width: 100 }}>Code</th><th style={{ ...th, width: 180 }}>Actions</th></tr></thead>
          <tbody>
            {loading ? <LoadingRows cols={3} /> : data.length === 0 ? (
              <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#555' }}>No disciplines</td></tr>
            ) : data.map(d => {
              if (editingId === d.id) return (
                <tr key={d.id} style={{ background: '#FAFAFA' }}>
                  <td style={td}><input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inp, maxWidth: 320 }} /></td>
                  <td style={td}><input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="e.g. CON" style={{ ...inp, maxWidth: 100 }} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(d.id)} disabled={saving} style={saveBtn}>{saving ? 'â€¦' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              return (
                <tr key={d.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{d.name}</td>
                  <td style={{ ...td, color: '#555', fontFamily: 'monospace', fontSize: 12 }}>{d.code ?? 'â€”'}</td>
                  <td style={td}>
                    {deletingId === d.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(d.id)} disabled={saving} style={delConfirmBtn}>{saving ? 'â€¦' : 'Yes'}</button>
                        <button onClick={() => setDeletingId(null)} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingId(d.id); setEditName(d.name); setEditCode(d.code ?? ''); setDeletingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                        <button onClick={() => { setDeletingId(d.id); setEditingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12, color: '#AD050C', borderColor: '#FBBDBA' }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelsTab() {
  const blankL = { level_name: '', short_code: '', level_number: '' };
  const [data, setData] = useState<Level[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(blankL);
  const [editForm, setEditForm] = useState(blankL);

  function load() {
    setLoading(true);
    refDataApi.levels().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!form.level_name.trim() || !form.short_code.trim()) return;
    setSaving(true);
    try {
      await rawClient.post('/admin/levels', {
        level_name: form.level_name.trim(), short_code: form.short_code.trim(),
        level_number: form.level_number ? parseInt(form.level_number) : null,
      });
      load(); setCreating(false); setForm(blankL);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await rawClient.put(`/admin/levels/${id}`, {
        level_name: editForm.level_name.trim(), short_code: editForm.short_code.trim(),
        level_number: editForm.level_number ? parseInt(editForm.level_number) : null,
      });
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try {
      await rawClient.delete(`/admin/levels/${id}`);
      load(); setDeletingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); setDeletingId(null); } finally { setSaving(false); }
  }

  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const delConfirmBtn: React.CSSProperties = { padding: '4px 10px', background: '#AD050C', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Manage seniority levels used for people and hire requests.</p>
        <button onClick={() => { setCreating(true); setEditingId(null); setDeletingId(null); }}
          style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Level</button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12 }}>New Level</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Level Name *</label>
              <input value={form.level_name} onChange={e => setForm(f => ({ ...f, level_name: e.target.value }))} placeholder="e.g. Senior Manager" style={inp} />
            </div>
            <div>
              <label style={lbl}>Short Code *</label>
              <input value={form.short_code} onChange={e => setForm(f => ({ ...f, short_code: e.target.value }))} placeholder="e.g. S M" style={inp} />
            </div>
            <div>
              <label style={lbl}>Level #</label>
              <input type="number" value={form.level_number} onChange={e => setForm(f => ({ ...f, level_number: e.target.value }))} placeholder="e.g. 4" style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); setForm(blankL); }} style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.level_name.trim() || !form.short_code.trim()}
              style={{ padding: '7px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (!form.level_name.trim() || !form.short_code.trim()) ? 0.6 : 1 }}>
              {saving ? 'Savingâ€¦' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Level Name</th><th style={th}>Short Code</th><th style={th}>Level #</th>
            <th style={{ ...th, width: 180 }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <LoadingRows cols={4} /> : data.length === 0 ? (
              <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#555' }}>No levels</td></tr>
            ) : data.map(l => {
              if (editingId === l.id) return (
                <tr key={l.id} style={{ background: '#FAFAFA' }}>
                  <td style={td}><input value={editForm.level_name} onChange={e => setEditForm(f => ({ ...f, level_name: e.target.value }))} style={inp} /></td>
                  <td style={td}><input value={editForm.short_code} onChange={e => setEditForm(f => ({ ...f, short_code: e.target.value }))} style={{ ...inp, width: 90 }} /></td>
                  <td style={td}><input type="number" value={editForm.level_number} onChange={e => setEditForm(f => ({ ...f, level_number: e.target.value }))} style={{ ...inp, width: 70 }} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(l.id)} disabled={saving} style={saveBtn}>{saving ? 'â€¦' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              return (
                <tr key={l.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{l.level_name}</td>
                  <td style={td}><span style={{ padding: '1px 7px', borderRadius: 8, background: '#F0ECFF', color: '#6644BB', border: '1px solid #C5B8F0', fontSize: 11, fontWeight: 600 }}>{l.short_code}</span></td>
                  <td style={td}>{l.level_number ?? 'â€”'}</td>
                  <td style={td}>
                    {deletingId === l.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(l.id)} disabled={saving} style={delConfirmBtn}>{saving ? 'â€¦' : 'Yes'}</button>
                        <button onClick={() => setDeletingId(null)} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingId(l.id); setEditForm({ level_name: l.level_name, short_code: l.short_code, level_number: String(l.level_number ?? '') }); setDeletingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                        <button onClick={() => { setDeletingId(l.id); setEditingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12, color: '#AD050C', borderColor: '#FBBDBA' }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractTypesTab() {
  const blankCT = { code: '', description: '', category: 'existing', colour_hex: 'CCCCCC' };
  const [data, setData] = useState<ContractType[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(blankCT);
  const [editForm, setEditForm] = useState(blankCT);

  function load() {
    setLoading(true);
    refDataApi.contractTypes().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!form.code.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      await rawClient.post('/admin/contract-types', form);
      load(); setCreating(false); setForm(blankCT);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await rawClient.put(`/admin/contract-types/${id}`, editForm);
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try {
      await rawClient.delete(`/admin/contract-types/${id}`);
      load(); setDeletingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); setDeletingId(null); } finally { setSaving(false); }
  }

  const CATEGORIES = ['existing', 'approved', 'requested'];
  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const delConfirmBtn: React.CSSProperties = { padding: '4px 10px', background: '#AD050C', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  function ColourInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const hex6 = value.replace('#', '').padEnd(6, '0').substring(0, 6).toUpperCase();
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={`#${hex6}`}
          onChange={e => onChange(e.target.value.replace('#', '').toUpperCase())}
          style={{ width: 34, height: 30, padding: 1, border: '1px solid #D5D5D5', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
        <input value={hex6} maxLength={6}
          onChange={e => onChange(e.target.value.replace('#', '').toUpperCase().substring(0, 6))}
          placeholder="RRGGBB" style={{ ...inp, width: 90, fontFamily: 'monospace', fontSize: 12 }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Manage contract types used on people records.</p>
        <button onClick={() => { setCreating(true); setEditingId(null); setDeletingId(null); }}
          style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Contract Type</button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12 }}>New Contract Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Code *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. FTE" style={inp} />
            </div>
            <div>
              <label style={lbl}>Description *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Full Time Employee" style={inp} />
            </div>
            <div>
              <label style={lbl}>Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Colour *</label>
              <ColourInput value={form.colour_hex} onChange={v => setForm(f => ({ ...f, colour_hex: v }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); setForm(blankCT); }} style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.code.trim() || !form.description.trim()}
              style={{ padding: '7px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (!form.code.trim() || !form.description.trim()) ? 0.6 : 1 }}>
              {saving ? 'Savingâ€¦' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Code</th><th style={th}>Description</th><th style={th}>Category</th><th style={th}>Colour</th>
            <th style={{ ...th, width: 180 }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <LoadingRows cols={5} /> : data.length === 0 ? (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#555' }}>No contract types</td></tr>
            ) : data.map(c => {
              if (editingId === c.id) return (
                <tr key={c.id} style={{ background: '#FAFAFA' }}>
                  <td style={td}><input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} style={{ ...inp, width: 80 }} /></td>
                  <td style={td}><input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={inp} /></td>
                  <td style={td}>
                    <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </td>
                  <td style={td}><ColourInput value={editForm.colour_hex} onChange={v => setEditForm(f => ({ ...f, colour_hex: v }))} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(c.id)} disabled={saving} style={saveBtn}>{saving ? 'â€¦' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              const hex = (c.colour_hex ?? '').replace('#', '');
              return (
                <tr key={c.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 600 }}>{c.code}</td>
                  <td style={td}>{c.description}</td>
                  <td style={td}>{c.category ?? 'â€”'}</td>
                  <td style={td}>
                    {hex
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, background: `#${hex}`, border: '1px solid #E0E0E0' }} />
                          <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{hex}</span>
                        </div>
                      : <span style={{ color: '#AAA' }}>â€”</span>}
                  </td>
                  <td style={td}>
                    {deletingId === c.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(c.id)} disabled={saving} style={delConfirmBtn}>{saving ? 'â€¦' : 'Yes'}</button>
                        <button onClick={() => setDeletingId(null)} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingId(c.id); setEditForm({ code: c.code, description: c.description, category: c.category ?? 'existing', colour_hex: hex || 'CCCCCC' }); setDeletingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                        <button onClick={() => { setDeletingId(c.id); setEditingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12, color: '#AD050C', borderColor: '#FBBDBA' }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegionsTab() {
  const blankR = { name: '', code: '', sort_order: '0' };
  const [data, setData] = useState<Region[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(blankR);
  const [editForm, setEditForm] = useState(blankR);

  function load() {
    setLoading(true);
    refDataApi.regions().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!form.name.trim() || !form.code.trim()) return;
    setSaving(true);
    try {
      await rawClient.post('/admin/regions', { name: form.name.trim(), code: form.code.trim(), sort_order: parseInt(form.sort_order) || 0 });
      load(); setCreating(false); setForm(blankR);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await rawClient.put(`/admin/regions/${id}`, { name: editForm.name.trim(), code: editForm.code.trim(), sort_order: parseInt(editForm.sort_order) || 0 });
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try {
      await rawClient.delete(`/admin/regions/${id}`);
      load(); setDeletingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); setDeletingId(null); } finally { setSaving(false); }
  }

  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const delConfirmBtn: React.CSSProperties = { padding: '4px 10px', background: '#AD050C', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Manage planning regions. Sort order controls display sequence.</p>
        <button onClick={() => { setCreating(true); setEditingId(null); setDeletingId(null); }}
          style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Region</button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12 }}>New Region</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Asia Pacific" style={inp} />
            </div>
            <div>
              <label style={lbl}>Code *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. APAC" style={inp} />
            </div>
            <div>
              <label style={lbl}>Sort Order</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); setForm(blankR); }} style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.code.trim()}
              style={{ padding: '7px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (!form.name.trim() || !form.code.trim()) ? 0.6 : 1 }}>
              {saving ? 'Savingâ€¦' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Name</th><th style={th}>Code</th><th style={{ ...th, width: 80 }}>Sort</th>
            <th style={{ ...th, width: 180 }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <LoadingRows cols={4} /> : data.length === 0 ? (
              <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#555' }}>No regions</td></tr>
            ) : data.map(r => {
              if (editingId === r.id) return (
                <tr key={r.id} style={{ background: '#FAFAFA' }}>
                  <td style={td}><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inp} /></td>
                  <td style={td}><input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} style={{ ...inp, width: 100 }} /></td>
                  <td style={td}><input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: e.target.value }))} style={{ ...inp, width: 60 }} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(r.id)} disabled={saving} style={saveBtn}>{saving ? 'â€¦' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              return (
                <tr key={r.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{r.name}</td>
                  <td style={td}><span style={{ padding: '1px 7px', borderRadius: 8, background: '#F5F5F5', color: '#666', border: '1px solid #E0E0E0', fontSize: 11 }}>{r.code}</span></td>
                  <td style={td}>{r.sort_order}</td>
                  <td style={td}>
                    {deletingId === r.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(r.id)} disabled={saving} style={delConfirmBtn}>{saving ? 'â€¦' : 'Yes'}</button>
                        <button onClick={() => setDeletingId(null)} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingId(r.id); setEditForm({ name: r.name, code: r.code, sort_order: String(r.sort_order) }); setDeletingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                        <button onClick={() => { setDeletingId(r.id); setEditingId(null); }}
                          style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12, color: '#AD050C', borderColor: '#FBBDBA' }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const USER_PROFILES = [
  'Senior PMO', 'PMO Team', 'Workforce Planning', 'Administration',
  'Senior TA', 'Talent Acquisition', 'Finance', 'Department Head', 'Hub Lead', 'EVP',
];
const ACCESS_TIERS = ['standard', 'approver', 'administrator'];
const TIER_STYLE: Record<string, React.CSSProperties> = {
  standard:      { background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB' },
  approver:      { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
  administrator: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
};

const PROFILE_DEFS = [
  { name: 'Senior PMO',         colour: '#E91C24', description: 'Full planning authority. Manages planning cycles from draft through approval, edits all people and projects, and can approve hire requests.', caps: ['Edit people & projects', 'All cycle stages', 'Approve hire requests', 'Manage admin settings'] },
  { name: 'PMO Team',           colour: '#F97316', description: 'Core planning team. Edits people, projects, and allocations during active and under-review cycle stages.', caps: ['Edit people & projects', 'Active & review stages'] },
  { name: 'Workforce Planning', colour: '#0057B7', description: 'Workforce data management. Maintains people records and allocation data during active planning.', caps: ['Edit people & projects', 'Active & review stages'] },
  { name: 'Administration',     colour: '#6366F1', description: 'Administrative support. Edit access to people and project data during active cycle stages.', caps: ['Edit people & projects', 'Active & review stages'] },
  { name: 'Senior TA',          colour: '#059669', description: 'Senior talent acquisition. Reviews, raises, and approves hire requests and manages the recruitment pipeline.', caps: ['Create hire requests', 'Approve hire requests', 'View pipeline'] },
  { name: 'Talent Acquisition', colour: '#10B981', description: 'Talent acquisition team. Manages the recruitment pipeline and raises hire and change requests.', caps: ['Create hire requests', 'View pipeline'] },
  { name: 'Finance',            colour: '#B45309', description: 'Finance team. Read access across planning data with visibility of financial and headcount reporting.', caps: ['View all data', 'Financial reports'] },
  { name: 'Department Head',    colour: '#7C3AED', description: 'Departmental leadership. Edits own project allocations, participates in review stage, and approves departmental hire requests.', caps: ['Edit people & projects', 'Active & review stages', 'Approve hire requests'] },
  { name: 'Hub Lead',           colour: '#DB2777', description: 'Regional hub leadership. Same edit and approval rights as Department Head, scoped to their regional hub.', caps: ['Edit people & projects', 'Active & review stages', 'Approve hire requests'] },
  { name: 'EVP',                colour: '#64748B', description: 'Executive leadership. Read access across all planning data with hire request approval authority.', caps: ['View all data', 'Approve hire requests'] },
];

const TIER_DEFS = [
  { tier: 'Standard',      colour: '#374151', bg: '#F3F4F6', border: '#D1D5DB', description: 'Access defined entirely by the assigned System Profile. This is the default for all users.' },
  { tier: 'Approver',      colour: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', description: 'All profile access, plus the ability to approve hire requests and change requests regardless of profile assignment.' },
  { tier: 'Administrator', colour: '#92400E', bg: '#FEF3C7', border: '#FDE68A', description: 'Bypasses all profile-based restrictions. Full access to every function in the system. Assign with care.' },
];

// â”€â”€ Permission matrix data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PERM_PROFILES = [
  { name: 'Senior PMO',         short: 'Sr PMO',     colour: '#E91C24', desc: 'Highest-level PMO role with full control across all planning, approvals, and system administration.' },
  { name: 'PMO Team',           short: 'PMO Team',   colour: '#F97316', desc: 'Core planning team with broad edit access across projects, allocations, and planning cycles.' },
  { name: 'Workforce Planning', short: 'W. Plan',    colour: '#0057B7', desc: 'Manages headcount plans and allocations with edit access to planning and people data.' },
  { name: 'Administration',     short: 'Admin',      colour: '#6366F1', desc: 'System administrators managing user access, reference data, and operational settings.' },
  { name: 'Senior TA',          short: 'Sr TA',      colour: '#059669', desc: 'Senior talent acquisition with approval authority over hire requests and full recruitment pipeline access.' },
  { name: 'Talent Acquisition', short: 'Talent Acq', colour: '#10B981', desc: 'Manages the recruitment pipeline, creating and progressing hire requests.' },
  { name: 'Finance',            short: 'Finance',    colour: '#B45309', desc: 'Finance team with visibility into cost and headcount data, including financial reports.' },
  { name: 'Department Head',    short: 'Dept Head',  colour: '#7C3AED', desc: 'Departmental leaders who manage their teams, approve requests, and oversee headcount.' },
  { name: 'Hub Lead',           short: 'Hub Lead',   colour: '#DB2777', desc: 'Hub or site leads with people management responsibilities and approval authority.' },
  { name: 'EVP',                short: 'EVP',        colour: '#64748B', desc: 'Executive view with access to senior-level reports, dashboards, and approval flows.' },
  { name: 'People Manager',     short: 'P. Mgr',     colour: '#0891B2', desc: 'Line managers with view access to their team\'s headcount, active hires, and recruitment progress.' },
];

const SECTION_ROWS: Array<{ key: string; label: string; group: boolean }> = [
  { key: 'people',            label: 'People',                group: true  },
  { key: 'people.view',       label: 'View people list',      group: false },
  { key: 'people.edit',       label: 'Add & edit person',     group: false },
  { key: 'people.deactivate', label: 'Deactivate person',     group: false },
  { key: 'people.delete',     label: 'Hard delete',           group: false },
  { key: 'projects',          label: 'Projects',              group: true  },
  { key: 'projects.view',     label: 'View projects',         group: false },
  { key: 'projects.edit',     label: 'Create & edit',         group: false },
  { key: 'allocations',       label: 'Allocations',           group: true  },
  { key: 'allocations.view',  label: 'View allocations',      group: false },
  { key: 'allocations.edit',  label: 'Edit allocations',      group: false },
  { key: 'cycles',            label: 'Planning Cycles',       group: true  },
  { key: 'cycles.view',       label: 'View cycles',           group: false },
  { key: 'cycles.manage',     label: 'Create & manage',       group: false },
  { key: 'cycles.draft',      label: 'Edit: Draft stage',     group: false },
  { key: 'cycles.active',     label: 'Edit: Active stage',    group: false },
  { key: 'cycles.review',     label: 'Edit: Review stage',    group: false },
  { key: 'talent',            label: 'Talent Acquisition',    group: true  },
  { key: 'talent.view',       label: 'View pipeline',         group: false },
  { key: 'talent.create',     label: 'Create hire requests',  group: false },
  { key: 'talent.approve',    label: 'Approve hire requests', group: false },
  { key: 'changes',           label: 'Change Requests',       group: true  },
  { key: 'changes.view',      label: 'View changes',          group: false },
  { key: 'changes.create',    label: 'Create requests',       group: false },
  { key: 'changes.status',    label: 'Update plan status',    group: false },
  { key: 'reports',           label: 'Reports & Dashboard',   group: true  },
  { key: 'reports.view',      label: 'View dashboard',        group: false },
  { key: 'reports.finance',   label: 'Finance data',          group: false },
  { key: 'admin',             label: 'Administration',        group: true  },
  { key: 'admin.view',        label: 'View admin panel',      group: false },
  { key: 'admin.refdata',     label: 'Edit reference data',   group: false },
  { key: 'admin.access',      label: 'Manage user access',    group: false },
];

type PermLevel = 'none' | 'view' | 'edit' | 'full';
const LEVEL_CYCLE: PermLevel[] = ['none', 'view', 'edit', 'full'];
const LEVEL_CFG: Record<PermLevel, { label: string; bg: string; color: string; border: string }> = {
  none: { label: 'â€”',    bg: '#F9FAFB', color: '#9CA3AF', border: '#E5E7EB' },
  view: { label: 'View', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  edit: { label: 'Edit', bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  full: { label: 'Full', bg: '#FFF1F2', color: '#E91C24', border: '#FECDD3' },
};

const W = ['Senior PMO', 'PMO Team', 'Workforce Planning', 'Administration', 'Department Head', 'Hub Lead'];
const S = ['Senior PMO', 'Senior TA', 'Department Head', 'Hub Lead', 'EVP'];

function defaultPermLevel(sectionKey: string, profile: string): PermLevel {
  switch (sectionKey) {
    case 'people.view':       return 'view';
    case 'people.edit':       return W.includes(profile) ? 'edit' : 'none';
    case 'people.deactivate': return W.includes(profile) ? 'edit' : 'none';
    case 'people.delete':     return ['Senior PMO', 'Workforce Planning'].includes(profile) ? 'full' : 'none';
    case 'projects.view':     return 'view';
    case 'projects.edit':     return W.includes(profile) ? 'edit' : 'none';
    case 'allocations.view':  return 'view';
    case 'allocations.edit':  return W.includes(profile) ? 'edit' : 'none';
    case 'cycles.view':       return 'view';
    case 'cycles.manage':     return profile === 'Senior PMO' ? 'full' : 'none';
    case 'cycles.draft':      return profile === 'Senior PMO' ? 'edit' : 'none';
    case 'cycles.active':     return W.includes(profile) ? 'edit' : 'none';
    case 'cycles.review':     return W.includes(profile) ? 'edit' : 'none';
    case 'talent.view':       return 'view';
    case 'talent.create':     return profile === 'People Manager' ? 'none' : 'edit';
    case 'talent.approve':    return S.includes(profile) ? 'full' : 'none';
    case 'changes.view':      return 'view';
    case 'changes.create':    return profile === 'People Manager' ? 'none' : 'edit';
    case 'changes.status':    return profile === 'People Manager' ? 'none' : 'edit';
    case 'reports.view':      return 'view';
    case 'reports.finance':   return ['Senior PMO', 'PMO Team', 'Finance'].includes(profile) ? 'view' : 'none';
    case 'admin.view':        return ['Senior PMO', 'PMO Team', 'Workforce Planning', 'Administration'].includes(profile) ? 'view' : 'none';
    case 'admin.refdata':     return ['Senior PMO', 'PMO Team', 'Workforce Planning'].includes(profile) ? 'edit' : 'none';
    case 'admin.access':      return profile === 'Senior PMO' ? 'full' : 'none';
    default:                  return 'none';
  }
}

function UserAccessTab() {
  const [dbPerms, setDbPerms]   = useState<Record<string, Record<string, PermLevel>>>({});
  const [local, setLocal]       = useState<Record<string, Record<string, PermLevel>>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [hoveredProfile, setHoveredProfile] = useState<string | null>(null);

  useEffect(() => {
    rawClient.get<{ data: Array<{ profile: string; section_key: string; level: PermLevel }> }>('/admin/profile-permissions')
      .then(r => {
        const map: Record<string, Record<string, PermLevel>> = {};
        for (const row of r.data.data) {
          if (!map[row.profile]) map[row.profile] = {};
          map[row.profile][row.section_key] = row.level;
        }
        setDbPerms(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getLevel(sectionKey: string, profile: string): PermLevel {
    return local[profile]?.[sectionKey] ?? dbPerms[profile]?.[sectionKey] ?? defaultPermLevel(sectionKey, profile);
  }

  function cycleCell(sectionKey: string, profile: string) {
    const cur = getLevel(sectionKey, profile);
    const next = LEVEL_CYCLE[(LEVEL_CYCLE.indexOf(cur) + 1) % LEVEL_CYCLE.length];
    setLocal(prev => ({ ...prev, [profile]: { ...(prev[profile] ?? {}), [sectionKey]: next } }));
  }

  const unsaved = Object.entries(local).reduce((n, [prof, secs]) =>
    n + Object.entries(secs).filter(([k, v]) => v !== (dbPerms[prof]?.[k] ?? defaultPermLevel(k, prof))).length, 0);

  async function handleSave() {
    setSaving(true);
    try {
      const allPerms = PERM_PROFILES.flatMap(p =>
        SECTION_ROWS.filter(r => !r.group).map(r => ({ profile: p.name, section_key: r.key, level: getLevel(r.key, p.name) }))
      );
      await rawClient.put('/admin/profile-permissions/save', { permissions: allPerms });
      setDbPerms(prev => {
        const next = { ...prev };
        for (const [prof, secs] of Object.entries(local)) next[prof] = { ...(next[prof] ?? {}), ...secs };
        return next;
      });
      setLocal({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  const leafRows = SECTION_ROWS.filter(r => !r.group);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>
          Click any cell to cycle: <strong style={{ color: '#9CA3AF' }}>â€”</strong> â†’ <strong style={{ color: '#1D4ED8' }}>View</strong> â†’ <strong style={{ color: '#15803D' }}>Edit</strong> â†’ <strong style={{ color: '#E91C24' }}>Full</strong>
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {unsaved > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
              {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}
            </span>
          )}
          {savedFlash && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>Saved âœ“</span>
          )}
          <button onClick={handleSave} disabled={saving || unsaved === 0}
            style={{ padding: '7px 18px', background: unsaved > 0 ? '#E91C24' : '#D5D5D5', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: unsaved > 0 ? 'pointer' : 'default', transition: 'background 0.15s' }}>
            {saving ? 'Savingâ€¦' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, color: '#666', alignItems: 'center' }}>
        {(Object.entries(LEVEL_CFG) as [PermLevel, typeof LEVEL_CFG[PermLevel]][]).map(([level, cfg]) => (
          <span key={level} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ padding: '1px 6px', borderRadius: 3, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 700, fontSize: 10 }}>{cfg.label}</span>
            <span>{level === 'none' ? 'No access' : level === 'view' ? 'Read only' : level === 'edit' ? 'Create & modify' : 'Full incl. admin actions'}</span>
          </span>
        ))}
        <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Unsaved changes highlighted in amber</span>
      </div>

      {/* Matrix table */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)', border: '1px solid #E5E5E5', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.07em', position: 'sticky', left: 0, top: 0, background: '#E4E6EA', zIndex: 4, borderRight: '2px solid #C8CCD4', borderBottom: '2px solid #C8CCD4', minWidth: 190, whiteSpace: 'nowrap' }}>Section / Action</th>
              {PERM_PROFILES.map(p => (
                <th key={p.name}
                  onMouseEnter={() => setHoveredProfile(p.name)}
                  onMouseLeave={() => setHoveredProfile(null)}
                  style={{ padding: '10px 10px', textAlign: 'center', fontSize: 11, fontWeight: 400, color: '#333333', position: 'sticky', top: 0, background: '#E4E6EA', zIndex: hoveredProfile === p.name ? 3 : 1, borderLeft: '1px solid #D0D4DA', borderBottom: '2px solid #C8CCD4', minWidth: 110, verticalAlign: 'bottom', cursor: 'default' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.colour, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ lineHeight: 1.3 }}>{p.name}</span>
                    {hoveredProfile === p.name && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: '#1F2937', color: '#F9FAFB', fontSize: 12, fontWeight: 400, lineHeight: 1.5, padding: '8px 12px', borderRadius: 6, whiteSpace: 'normal', width: 200, textAlign: 'left', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 100, pointerEvents: 'none' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: p.colour }}>{p.name}</div>
                        {p.desc}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={PERM_PROFILES.length + 1} style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: '#888' }}>Loading permissionsâ€¦</td></tr>
            ) : SECTION_ROWS.map((row, idx) => {
              if (row.group) {
                return (
                  <tr key={row.key} style={{ background: '#F2F3F4' }}>
                    <td colSpan={PERM_PROFILES.length + 1} style={{ padding: '7px 16px', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: idx > 0 ? '2px solid #D1D5DB' : undefined, position: 'sticky', left: 0 }}>
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const rowBg = leafRows.indexOf(row) % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
              return (
                <tr key={row.key} style={{ background: rowBg }}>
                  <td style={{ padding: '6px 16px 6px 26px', fontSize: 12, color: '#374151', position: 'sticky', left: 0, background: rowBg, borderRight: '2px solid #E0E0E0', borderBottom: '1px solid #F0F0F0', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </td>
                  {PERM_PROFILES.map(p => {
                    const level = getLevel(row.key, p.name);
                    const cfg = LEVEL_CFG[level];
                    const isDirty = local[p.name]?.[row.key] !== undefined &&
                      local[p.name]?.[row.key] !== (dbPerms[p.name]?.[row.key] ?? defaultPermLevel(row.key, p.name));
                    return (
                      <td key={p.name} style={{ padding: '4px 3px', textAlign: 'center', borderLeft: '1px solid #F0F0F0', borderBottom: '1px solid #F0F0F0' }}>
                        <button onClick={() => cycleCell(row.key, p.name)}
                          title={`${p.name} â€” ${level} â€” click to change`}
                          style={{ padding: '3px 6px', fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 4, cursor: 'pointer', minWidth: 40, outline: isDirty ? '2px solid #F59E0B' : 'none', outlineOffset: 1 }}>
                          {cfg.label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}


// ---------------------------------------------------------------------------
// Planning Cycles tab
// ---------------------------------------------------------------------------

const CYCLE_STAGES: Record<string, { label: string; bg: string; color: string }> = {
  draft:        { label: 'Stage 1: Admin Setup',    bg: '#F3F4F6', color: '#374151' },
  active:       { label: 'Stage 2: Planning',        bg: '#EFF6FF', color: '#1D4ED8' },
  under_review: { label: 'Stage 3: Regional Review', bg: '#FFFBEB', color: '#D97706' },
  approved:     { label: 'Stage 4: Global Approval', bg: '#ECFDF5', color: '#059669' },
  closed:       { label: 'Closed',                   bg: '#F3F4F6', color: '#9CA3AF' },
};

// Roles that can edit at each stage
const STAGE_ACCESS: Record<string, string[]> = {
  draft:        ['PMO'],
  active:       ['PMO', 'Workforce Planning', 'Dept Lead', 'Function Lead', 'Head of Dept'],
  under_review: ['PMO', 'Workforce Planning', 'Dept Lead', 'Function Lead', 'Head of Dept', 'Head of Commercial'],
  approved:     [],
  closed:       [],
};

// Colour palette for role chips
const ROLE_CHIP: Record<string, { bg: string; color: string; border: string }> = {
  'PMO':                { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  'Workforce Planning': { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  'Dept Lead':          { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  'Function Lead':      { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  'Head of Dept':       { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  'Head of Commercial': { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
};

const inp: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #D5D5D5', borderRadius: 5,
  fontSize: 13, boxSizing: 'border-box' as const, width: '100%',
};

function PlanningCyclesTab() {
  const { cycles, reloadCycles } = usePlanningCycle();
  const [creating, setCreating]         = useState(false);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [saving, setSaving]             = useState(false);
  const [stageSaving, setStageSaving]   = useState<number | null>(null);
  const [approvers, setApprovers]       = useState<Record<number, CycleApprover[]>>({});
  const [addingApproverFor, setAddingApproverFor] = useState<number | null>(null);
  const [newApproverName, setNewApproverName]     = useState('');
  const [newApproverEmail, setNewApproverEmail]   = useState('');
  const [liveStageAccess, setLiveStageAccess] = useState<Record<string, string[]>>({});

  useEffect(() => {
    cycleStageAccessApi.list()
      .then(rows => {
        const map: Record<string, string[]> = {};
        rows.forEach(r => { map[r.stage_key] = r.edit_roles; });
        setLiveStageAccess(map);
      })
      .catch(() => {});
  }, []);

  const [form, setForm]         = useState({ name: '', start_date: '', end_date: '', copy_from_cycle_id: '' });
  const [editForm, setEditForm] = useState({ name: '', start_date: '', end_date: '' });

  async function loadApprovers(cycleList: PlanningCycle[]) {
    const entries = await Promise.all(
      cycleList.map(async c => {
        try { return [c.id, await cycleApproversApi.list(c.id)] as [number, CycleApprover[]]; }
        catch { return [c.id, []] as [number, CycleApprover[]]; }
      })
    );
    setApprovers(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (cycles.length > 0) loadApprovers(cycles);
  }, [cycles]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStageChange(id: number, newStatus: string) {
    setStageSaving(id);
    try {
      await planningCyclesApi.update(id, { status: newStatus as PlanningCycle['status'] });
      reloadCycles();
    } finally { setStageSaving(null); }
  }

  function startEdit(c: PlanningCycle) {
    setEditingId(c.id);
    setEditForm({ name: c.name, start_date: c.start_date.slice(0, 10), end_date: c.end_date.slice(0, 10) });
  }

  async function handleCreate() {
    if (!form.name || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      await planningCyclesApi.create({
        name: form.name, start_date: form.start_date, end_date: form.end_date,
        copy_from_cycle_id: form.copy_from_cycle_id ? parseInt(form.copy_from_cycle_id, 10) : null,
      });
      reloadCycles();
      setCreating(false);
      setForm({ name: '', start_date: '', end_date: '', copy_from_cycle_id: '' });
    } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await planningCyclesApi.update(id, { name: editForm.name, start_date: editForm.start_date, end_date: editForm.end_date });
      reloadCycles();
      setEditingId(null);
    } finally { setSaving(false); }
  }

  async function handleAddApprover(cycleId: number) {
    if (!newApproverName.trim()) return;
    try {
      await cycleApproversApi.add(cycleId, newApproverName.trim(), newApproverEmail.trim() || undefined);
      setNewApproverName(''); setNewApproverEmail(''); setAddingApproverFor(null);
      const data = await cycleApproversApi.list(cycleId);
      setApprovers(prev => ({ ...prev, [cycleId]: data }));
    } catch { /* toast shown by axios interceptor */ }
  }

  async function handleRemoveApprover(cycleId: number, approverId: number) {
    try {
      await cycleApproversApi.remove(cycleId, approverId);
      const data = await cycleApproversApi.list(cycleId);
      setApprovers(prev => ({ ...prev, [cycleId]: data }));
    } catch { /* toast shown by axios interceptor */ }
  }

  function fmtPeriod(c: PlanningCycle) {
    const fmt = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fmt(c.start_date)} â€“ ${fmt(c.end_date)}`;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Manage planning cycles and their workflow stages. Use the Stage column to advance a cycle â€” editing access updates automatically based on the stage.
        </p>
        <button
          onClick={() => { setCreating(true); setEditingId(null); }}
          style={{ padding: '4px 10px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 20, flexShrink: 0 }}
        >+ New Cycle</button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111111', marginBottom: 12 }}>New Planning Cycle</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. H1 2027" style={inp} />
            </div>
            <div>
              <label style={lbl}>Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>End Date *</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Copy From</label>
              <select value={form.copy_from_cycle_id} onChange={e => setForm(f => ({ ...f, copy_from_cycle_id: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">â€” Start blank â€”</option>
                {cycles.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={btnSecondary}>Cancel</button>
            <button
              onClick={handleCreate} disabled={saving || !form.name || !form.start_date || !form.end_date}
              style={{ padding: '7px 16px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (!form.name || !form.start_date || !form.end_date) ? 0.6 : 1 }}
            >{saving ? 'Creatingâ€¦' : form.copy_from_cycle_id ? 'Create & Copy' : 'Create'}</button>
          </div>
        </div>
      )}

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 100 }}>Name</th>
              <th style={{ ...th, width: 180 }}>Period</th>
              <th style={{ ...th, width: 220 }}>Stage</th>
              <th style={th}>Edit Access</th>
              <th style={th}>Approvers</th>
              <th style={{ ...th, width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0
              ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#555' }}>No planning cycles</td></tr>
              : cycles.map(cycle => {
                  const stage = CYCLE_STAGES[cycle.status] ?? CYCLE_STAGES.draft;
                  const cycleApprovers = approvers[cycle.id] ?? [];
                  const isSavingStage  = stageSaving === cycle.id;

                  if (editingId === cycle.id) {
                    return (
                      <tr key={cycle.id} style={{ background: '#FAFAFA' }}>
                        <td style={td}>
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ ...inp, width: 100 }} />
                        </td>
                        <td style={td} colSpan={3}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} style={{ ...inp, width: 140 }} />
                            <span style={{ color: '#999', fontSize: 12 }}>to</span>
                            <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} style={{ ...inp, width: 140 }} />
                          </div>
                        </td>
                        <td style={td} />
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleUpdate(cycle.id)} disabled={saving}
                              style={{ padding: '5px 12px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {saving ? 'â€¦' : 'Save'}
                            </button>
                            <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={cycle.id}>
                      <td style={{ ...td, fontWeight: 600, color: '#111' }}>{cycle.name}</td>
                      <td style={{ ...td, fontSize: 12, color: '#555' }}>{fmtPeriod(cycle)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            value={cycle.status}
                            disabled={isSavingStage}
                            onChange={e => handleStageChange(cycle.id, e.target.value)}
                            style={{
                              padding: '4px 8px', border: `1px solid ${stage.color}44`,
                              borderRadius: 6, fontSize: 12, fontWeight: 600,
                              color: stage.color, background: stage.bg,
                              cursor: isSavingStage ? 'wait' : 'pointer', outline: 'none',
                            }}
                          >
                            {Object.entries(CYCLE_STAGES).map(([v, { label }]) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                          {isSavingStage && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Savingâ€¦</span>}
                        </div>
                      </td>
                      <td style={td}>
                        <RoleChips roles={liveStageAccess[cycle.status] ?? STAGE_ACCESS[cycle.status] ?? []} />
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {cycleApprovers.map(ap => (
                            <span key={ap.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
                              {ap.approver_name}
                              {ap.approver_email && <span style={{ opacity: 0.65 }}>({ap.approver_email})</span>}
                              <button
                                onClick={() => handleRemoveApprover(cycle.id, ap.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 14, padding: '0 0 0 2px', lineHeight: 1, opacity: 0.6 }}
                                title="Remove approver"
                              >Ã—</button>
                            </span>
                          ))}
                          {addingApproverFor === cycle.id ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input autoFocus value={newApproverName} onChange={e => setNewApproverName(e.target.value)}
                                placeholder="Name" onKeyDown={e => e.key === 'Enter' && handleAddApprover(cycle.id)}
                                style={{ ...inp, width: 110, fontSize: 11, padding: '3px 6px' }} />
                              <input value={newApproverEmail} onChange={e => setNewApproverEmail(e.target.value)}
                                placeholder="Email (optional)"
                                style={{ ...inp, width: 150, fontSize: 11, padding: '3px 6px' }} />
                              <button onClick={() => handleAddApprover(cycle.id)} disabled={!newApproverName.trim()}
                                style={{ padding: '3px 10px', background: '#059669', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                              <button onClick={() => { setAddingApproverFor(null); setNewApproverName(''); setNewApproverEmail(''); }}
                                style={{ padding: '3px 8px', background: 'none', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: '#666' }}>âœ•</button>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingApproverFor(cycle.id); setNewApproverName(''); setNewApproverEmail(''); }}
                              style={{ padding: '2px 8px', background: 'none', border: '1px dashed #D1D5DB', borderRadius: 10, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                              + Approver
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={td}>
                        <button onClick={() => startEdit(cycle)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gearing Ratios tab
// ---------------------------------------------------------------------------

const PROJECT_TYPES = ['Retail', 'xScale', 'EM'];

function GearingRatiosTab() {
  const [data, setData]               = useState<GearingConstant[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editDiv, setEditDiv]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [creating, setCreating]       = useState(false);
  const [newForm, setNewForm]         = useState({ discipline_id: '', project_type: 'Retail', divisor: '' });

  function load() {
    setLoading(true);
    Promise.all([
      gearingApi.list(),
      refDataApi.disciplines(),
    ]).then(([g, d]) => { setData(g); setDisciplines(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdate(id: number) {
    const val = parseFloat(editDiv);
    if (isNaN(val) || val <= 0) { toast.error('Divisor must be a positive number'); return; }
    setSaving(true);
    try {
      await rawClient.put(`/gearing/${id}`, { divisor: val });
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleCreate() {
    const val = parseFloat(newForm.divisor);
    if (!newForm.discipline_id) { toast.error('Select a discipline'); return; }
    if (isNaN(val) || val <= 0) { toast.error('Divisor must be a positive number'); return; }
    setSaving(true);
    try {
      await gearingApi.create({ discipline_id: parseInt(newForm.discipline_id, 10), project_type: newForm.project_type, divisor: val });
      load(); setCreating(false); setNewForm({ discipline_id: '', project_type: 'Retail', divisor: '' });
      toast.success('Gearing ratio created');
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 16 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0, maxWidth: 580, lineHeight: 1.55 }}>
          Set one gearing divisor per discipline and project type combination.
          The divisor is the number of projects one person can cover (e.g. 4 = one person per 4 projects).
          The system automatically derives the min and max headcount range from this value.
        </p>
        <button onClick={() => { setCreating(true); setEditingId(null); }}
          style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          + New Ratio
        </button>
      </div>

      {creating && (
        <div style={{ ...card, marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12 }}>New Gearing Ratio</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 180px' }}>
              <label style={lbl}>Discipline *</label>
              <select value={newForm.discipline_id} onChange={e => setNewForm(f => ({ ...f, discipline_id: e.target.value }))}
                style={{ ...inp }}>
                <option value="">Select disciplineâ€¦</option>
                {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={lbl}>Project Type *</label>
              <select value={newForm.project_type} onChange={e => setNewForm(f => ({ ...f, project_type: e.target.value }))}
                style={{ ...inp }}>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <label style={lbl}>Divisor *</label>
              <input type="number" step="0.5" min="0.1" value={newForm.divisor} placeholder="e.g. 4"
                onChange={e => setNewForm(f => ({ ...f, divisor: e.target.value }))}
                style={{ ...inp }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => { setCreating(false); setNewForm({ discipline_id: '', project_type: 'Retail', divisor: '' }); }}
              style={btnSecondary}>Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              style={{ padding: '7px 16px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Savingâ€¦' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Discipline</th>
              <th style={th}>Project Type</th>
              <th style={{ ...th, width: 120 }}>Divisor</th>
              <th style={{ ...th, width: 100 }}>Ratio</th>
              <th style={{ ...th, width: 180 }}>Last Updated By</th>
              <th style={{ ...th, width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows cols={6} /> : data.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#555' }}>No gearing constants configured</td></tr>
            ) : data.map(g => {
              const divisorVal = g.divisor ?? g.min_divisor;
              if (editingId === g.id) return (
                <tr key={g.id} style={{ background: '#FAFAFA' }}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{g.discipline_name}</td>
                  <td style={td}>{g.project_type}</td>
                  <td style={td}>
                    <input type="number" step="0.5" min="0.1" value={editDiv}
                      onChange={e => setEditDiv(e.target.value)}
                      style={{ ...inp, width: 90 }} />
                  </td>
                  <td style={{ ...td, color: '#888', fontSize: 12 }}>1 : {editDiv || '?'}</td>
                  <td style={td} />
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(g.id)} disabled={saving} style={saveBtn}>{saving ? 'â€¦' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              return (
                <tr key={g.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{g.discipline_name}</td>
                  <td style={td}>{g.project_type}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{divisorVal}</td>
                  <td style={{ ...td, color: '#555', fontSize: 12 }}>1 : {divisorVal}</td>
                  <td style={{ ...td, fontSize: 12, color: '#888' }}>
                    {g.updated_by_name ? `${g.updated_by_name} Â· ${fmtDate(g.updated_at)}` : fmtDate(g.updated_at)}
                  </td>
                  <td style={td}>
                    <button onClick={() => { setEditingId(g.id); setEditDiv(String(divisorVal)); }}
                      style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts tab
// ---------------------------------------------------------------------------

const TRIGGER_LABELS: Record<string, string> = {
  overdue_role:      'Role overdue by > N days',
  open_roles_above:  'Open role count exceeds N',
  upcoming_starter:  'Starter within next N days',
};

const TRIGGER_UNIT: Record<string, string> = {
  overdue_role:     'days',
  open_roles_above: 'roles',
  upcoming_starter: 'days',
};

const blankAlert = {
  name: '', trigger_type: 'overdue_role' as AlertConfig['trigger_type'],
  trigger_value: 30, message_template: '', recipient_ids: [] as number[], active: true,
};

function AlertsTab() {
  const [alerts, setAlerts]         = useState<AlertConfig[]>([]);
  const [logs,   setLogs]           = useState<AlertLog[]>([]);
  const [people, setPeople]         = useState<Person[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<AlertConfig | null>(null);
  const [form, setForm]             = useState(blankAlert);
  const [saving, setSaving]         = useState(false);
  const [evaluating, setEvaluating] = useState<number | null>(null);
  const [evalResult, setEvalResult] = useState<{ id: number; triggered: boolean; count: number; email_sent: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const sgConfigured = !!process.env.REACT_APP_SENDGRID_CONFIGURED;

  function load() {
    setLoading(true);
    Promise.all([alertsApi.list(), alertsApi.logs(), peopleApi.list({ limit: 500 })])
      .then(([a, l, p]) => { setAlerts(a); setLogs(l); setPeople(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setForm(blankAlert); setEditTarget(null); setModal('create'); setEvalResult(null);
  }
  function openEdit(a: AlertConfig) {
    setForm({ name: a.name, trigger_type: a.trigger_type, trigger_value: a.trigger_value,
      message_template: a.message_template, recipient_ids: a.recipient_ids, active: a.active });
    setEditTarget(a); setModal('edit'); setEvalResult(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await alertsApi.create(form);
      } else if (editTarget) {
        await alertsApi.update(editTarget.id, form);
      }
      load(); setModal(null);
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try { await alertsApi.remove(id); load(); setDeletingId(null); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  async function handleEvaluate(id: number) {
    setEvaluating(id); setEvalResult(null);
    try {
      const r = await alertsApi.evaluate(id);
      setEvalResult({ id, triggered: r.triggered, count: r.count, email_sent: r.email_sent });
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setEvaluating(null); }
  }

  function toggleRecipient(personId: number) {
    setForm(f => ({
      ...f,
      recipient_ids: f.recipient_ids.includes(personId)
        ? f.recipient_ids.filter(id => id !== personId)
        : [...f.recipient_ids, personId],
    }));
  }

  const peopleWithEmail = people.filter(p => p.email && p.is_active);

  const saveBtn: React.CSSProperties = {
    padding: '7px 16px', background: tk.accent, color: '#FFF',
    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Configure automated alerts that evaluate workforce data and notify people by email.
          </p>
          {!process.env.REACT_APP_API_URL?.includes('railway') && (
            <p style={{ fontSize: 11, color: '#E91C24', margin: '4px 0 0' }}>
              Email delivery requires <strong>SENDGRID_API_KEY</strong> and <strong>SENDGRID_FROM</strong> set in Railway environment variables.
            </p>
          )}
        </div>
        <button onClick={openCreate} style={{ padding: '7px 14px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + New Alert
        </button>
      </div>

      {/* Alert list */}
      <div style={{ ...card, marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Alert Name</th>
            <th style={th}>Trigger</th>
            <th style={th}>Recipients</th>
            <th style={{ ...th, width: 80 }}>Status</th>
            <th style={{ ...th, width: 140 }}>Last Triggered</th>
            <th style={{ ...th, width: 200 }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <LoadingRows cols={6} />
            ) : alerts.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#999', padding: 32 }}>No alerts configured yet. Click "+ New Alert" to create one.</td></tr>
            ) : alerts.map(a => (
              <tr key={a.id}>
                <td style={td}><span style={{ fontWeight: 600 }}>{a.name}</span></td>
                <td style={td}>
                  <span style={{ fontSize: 12, color: '#555' }}>
                    {TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type}&nbsp;&mdash;&nbsp;
                    <strong>{a.trigger_value}</strong> {TRIGGER_UNIT[a.trigger_type]}
                  </span>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 12, color: '#555' }}>
                    {a.recipients?.length ? a.recipients.map(r => r.name).join(', ') : <em style={{ color: '#aaa' }}>none</em>}
                  </span>
                </td>
                <td style={td}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: a.active ? '#E8F5E9' : '#F5F5F5', color: a.active ? '#2E7D32' : '#999' }}>
                    {a.active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td style={{ ...td, fontSize: 12, color: '#666' }}>
                  {a.last_triggered ? new Date(a.last_triggered).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'â€”'}
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(a)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Edit</button>
                    {deletingId === a.id ? (
                      <>
                        <button onClick={() => handleDelete(a.id)} disabled={saving} style={{ padding: '4px 10px', background: '#AD050C', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
                        <button onClick={() => setDeletingId(null)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleEvaluate(a.id)} disabled={evaluating === a.id}
                          style={{ padding: '4px 10px', background: '#1565C0', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: evaluating === a.id ? 'wait' : 'pointer' }}>
                          {evaluating === a.id ? 'Checkingâ€¦' : 'Evaluate'}
                        </button>
                        <button onClick={() => setDeletingId(a.id)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: '#AD050C', borderColor: '#FFCDD2' }}>Delete</button>
                      </>
                    )}
                  </div>
                  {evalResult?.id === a.id && (
                    <div style={{ marginTop: 6, fontSize: 11, padding: '4px 8px', borderRadius: 4,
                      background: evalResult.triggered ? '#FFF8E1' : '#F1F8E9',
                      color: evalResult.triggered ? '#E65100' : '#33691E', border: `1px solid ${evalResult.triggered ? '#FFCC02' : '#AED581'}` }}>
                      {evalResult.triggered
                        ? `âš  Triggered â€” ${evalResult.count} record(s)${evalResult.email_sent ? ' Â· Email sent' : ' Â· No email (check SENDGRID_API_KEY)'}`
                        : 'âœ“ No trigger â€” conditions not met'}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent log */}
      {logs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Recent Activity</div>
          <div style={{ ...card, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Alert</th>
                <th style={th}>Triggered</th>
                <th style={th}>Records</th>
                <th style={th}>Email</th>
                <th style={th}>Recipients</th>
              </tr></thead>
              <tbody>
                {logs.slice(0, 10).map(l => (
                  <tr key={l.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{l.alert_name}</td>
                    <td style={{ ...td, fontSize: 12 }}>{new Date(l.triggered_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ ...td, fontSize: 12 }}>{l.trigger_data?.count ?? 'â€”'}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4,
                        background: l.email_sent ? '#E8F5E9' : '#F5F5F5', color: l.email_sent ? '#2E7D32' : '#999' }}>
                        {l.email_sent ? 'Sent' : 'Not sent'}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 12, color: '#666' }}>
                      {(l.recipients_notified as any[])?.map((r: any) => r.name).join(', ') || 'â€”'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFF', borderRadius: 10, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>{modal === 'create' ? 'New Alert' : 'Edit Alert'}</div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Alert Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Overdue roles â€” APAC" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
            </div>

            {/* Trigger type + threshold */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Trigger Condition *</label>
                <select value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value as AlertConfig['trigger_type'] }))}
                  style={{ ...inp, width: '100%', boxSizing: 'border-box' }}>
                  <option value="overdue_role">Role overdue by &gt; N days</option>
                  <option value="open_roles_above">Open role count exceeds N</option>
                  <option value="upcoming_starter">Starter within next N days</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Threshold (N)</label>
                <input type="number" min={0} value={form.trigger_value}
                  onChange={e => setForm(f => ({ ...f, trigger_value: parseInt(e.target.value) || 0 }))}
                  style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{TRIGGER_UNIT[form.trigger_type]}</div>
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Message Template</label>
              <textarea value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={3} placeholder="Optional message included in the email notificationâ€¦"
                style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* Recipients */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Recipients</label>
              {peopleWithEmail.length === 0 ? (
                <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>
                  No people with email addresses found. Add emails in the People section to enable notifications.
                </div>
              ) : (
                <div style={{ border: '1px solid #D5D5D5', borderRadius: 5, maxHeight: 180, overflowY: 'auto' }}>
                  {peopleWithEmail.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                      background: form.recipient_ids.includes(p.id) ? '#FFF5F5' : 'transparent',
                      borderBottom: '1px solid #F5F5F5' }}>
                      <input type="checkbox" checked={form.recipient_ids.includes(p.id)} onChange={() => toggleRecipient(p.id)} />
                      <span style={{ fontSize: 13, flex: 1 }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>{p.email}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.recipient_ids.length > 0 && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{form.recipient_ids.length} recipient(s) selected</div>
              )}
            </div>

            {/* Active toggle */}
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ ...lbl, margin: 0 }}>Active</label>
              <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                style={{ padding: '4px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: form.active ? '#E8F5E9' : '#F5F5F5', color: form.active ? '#2E7D32' : '#999' }}>
                {form.active ? 'Active' : 'Paused'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ ...saveBtn, opacity: !form.name.trim() ? 0.5 : 1 }}>
                {saving ? 'Savingâ€¦' : 'Save Alert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cycle Stages tab
// ---------------------------------------------------------------------------

// Derived from PERM_PROFILES so new profiles appear automatically
const ALL_STAGE_ROLES = PERM_PROFILES.map(p => p.name);

// Build chip colours from PERM_PROFILES + legacy role names
function hexToChip(hex: string): { bg: string; color: string; border: string } {
  // Derive a light bg tint and border from the brand hex
  return { bg: hex + '18', color: hex, border: hex + '55' };
}
const STAGE_ROLE_CHIP: Record<string, { bg: string; color: string; border: string }> = {
  // Legacy names kept for backward compat with existing DB data
  'PMO':                { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  'Dept Lead':          { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  'Function Lead':      { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  'Head of Dept':       { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  'Head of Commercial': { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
  // All current PERM_PROFILES — generated from their brand colours
  ...Object.fromEntries(PERM_PROFILES.map(p => [p.name, hexToChip(p.colour)])),
};

function RoleChips({ roles }: { roles: string[] }) {
  if (!roles.length) return <span style={{ fontSize: 11, color: '#9CA3AF' }}>— None —</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {roles.map(r => {
        const chip = STAGE_ROLE_CHIP[r] ?? { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
        return (
          <span key={r} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`, whiteSpace: 'nowrap' }}>
            {r}
          </span>
        );
      })}
    </div>
  );
}

function RoleCheckboxGroup({
  label, roles, selected, onChange,
}: { label: string; roles: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (r: string) =>
    onChange(selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r]);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {roles.map(r => {
          const checked = selected.includes(r);
          const chip = STAGE_ROLE_CHIP[r] ?? { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
          return (
            <label key={r} style={{
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              padding: '4px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: checked ? chip.bg : '#F9FAFB',
              color: checked ? chip.color : '#9CA3AF',
              border: `1px solid ${checked ? chip.border : '#E5E7EB'}`,
              transition: 'all 0.1s',
              userSelect: 'none',
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(r)}
                style={{ width: 12, height: 12, accentColor: chip.color, cursor: 'pointer' }} />
              {r}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CycleStagesTab() {
  const [stages, setStages] = useState<CycleStageAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ edit_roles: string[]; review_roles: string[]; approval_roles: string[] }>({
    edit_roles: [], review_roles: [], approval_roles: [],
  });

  function load() {
    setLoading(true);
    cycleStageAccessApi.list().then(setStages).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(s: CycleStageAccess) {
    setEditingKey(s.stage_key);
    setDraft({ edit_roles: [...s.edit_roles], review_roles: [...s.review_roles], approval_roles: [...s.approval_roles] });
  }

  async function handleSave(stageKey: string) {
    setSaving(true);
    try {
      await cycleStageAccessApi.update(stageKey, draft);
      toast.success('Stage access updated');
      setEditingKey(null);
      load();
    } catch (e: unknown) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Configure which role groups have edit, review, and approval access at each planning cycle stage.
          Changes take effect for all planning cycles.
        </p>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
      ) : stages.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No stage data — check backend connection.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stages.map(s => {
            const isEditing = editingKey === s.stage_key;
            const isClosed  = s.stage_key === 'closed';
            return (
              <div key={s.stage_key} style={{ ...card, padding: 0, overflow: 'visible' }}>
                {/* Stage header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', background: '#F9FAFB',
                  borderBottom: '1px solid #E5E7EB', borderRadius: '8px 8px 0 0',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.stage_label}</div>
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(s)}
                      style={{ padding: '5px 12px', background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 5, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
                    >
                      Edit Access
                    </button>
                  )}
                </div>

                {/* View mode */}
                {!isEditing && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                    {[
                      { label: 'Edit Access',     roles: s.edit_roles },
                      { label: 'Review Access',   roles: s.review_roles },
                      { label: 'Approval Access', roles: s.approval_roles },
                    ].map(({ label, roles }, i) => (
                      <div key={label} style={{
                        padding: '12px 16px',
                        borderRight: i < 2 ? '1px solid #F0F0F0' : 'none',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                          {label}
                          {isClosed && <span style={{ marginLeft: 6, fontSize: 10 }}>🔒</span>}
                        </div>
                        <RoleChips roles={roles} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <RoleCheckboxGroup
                        label="Edit Access — who can edit data during this stage"
                        roles={ALL_STAGE_ROLES}
                        selected={draft.edit_roles}
                        onChange={next => setDraft(d => ({ ...d, edit_roles: next }))}
                      />
                      <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
                        <RoleCheckboxGroup
                          label="Review Access — who can review (read) data during this stage"
                          roles={ALL_STAGE_ROLES}
                          selected={draft.review_roles}
                          onChange={next => setDraft(d => ({ ...d, review_roles: next }))}
                        />
                      </div>
                      <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
                        <RoleCheckboxGroup
                          label="Approval Access — who can approve actions during this stage"
                          roles={ALL_STAGE_ROLES}
                          selected={draft.approval_roles}
                          onChange={next => setDraft(d => ({ ...d, approval_roles: next }))}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #F0F0F0' }}>
                      <button
                        onClick={() => setEditingKey(null)}
                        style={{ ...btnSecondary, fontSize: 13 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(s.stage_key)}
                        disabled={saving}
                        style={{ padding: '7px 18px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin page
// ---------------------------------------------------------------------------


const TABS = ['Planning Cycles', 'Cycle Stages', 'Disciplines', 'Levels', 'Contract Types', 'Regions', 'User Access', 'Gearing Ratios', 'Alerts'] as const;
type Tab = typeof TABS[number];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>('Planning Cycles');

  return (
    <div style={{ color: '#111111' }}>
      {/* Page title bar */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', borderRadius: 8, marginBottom: 16, border: '1px solid #E0E3E8', borderBottom: '3px solid #E91C24', padding: '8px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1 }}>System Admin</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #E5E5E5', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab ? `2px solid ${tk.accent}` : '2px solid transparent',
            color: activeTab === tab ? '#111111' : '#999999', fontSize: 14,
            cursor: 'pointer', fontWeight: activeTab === tab ? 600 : 400, marginBottom: -1,
          }}>{tab}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Planning Cycles' && <PlanningCyclesTab />}
      {activeTab === 'Cycle Stages'   && <CycleStagesTab />}
      {activeTab === 'Disciplines'    && <DisciplinesTab />}
      {activeTab === 'Levels'         && <LevelsTab />}
      {activeTab === 'Contract Types' && <ContractTypesTab />}
      {activeTab === 'Regions'        && <RegionsTab />}
      {activeTab === 'User Access'     && <UserAccessTab />}
      {activeTab === 'Gearing Ratios' && <GearingRatiosTab />}
      {activeTab === 'Alerts'          && <AlertsTab />}
    </div>
  );
}
