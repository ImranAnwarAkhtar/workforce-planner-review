import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { refDataApi, planningCyclesApi, cycleApproversApi, gearingApi, type Discipline, type Level, type ContractType, type Region, type PlanningCycle, type CycleApprover, type GearingConstant } from '../services/api';
import { usePlanningCycle } from '../context/PlanningCycleContext';
import axios from 'axios';

const BASE = (process.env.REACT_APP_API_URL ?? 'http://localhost:3001') + '/api';
const rawClient = axios.create({ baseURL: BASE });

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tk = { bg2: '#FFFFFF', border: '#E5E5E5', accent: '#E91C24', muted: '#666666' };
const card: React.CSSProperties = { background: tk.bg2, border: `1px solid ${tk.border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tk.muted, background: '#F8F9FA', borderBottom: `1px solid ${tk.border}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #F0F0F0', fontSize: 14, color: '#333333' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'transparent', color: '#555555', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 13, cursor: 'pointer' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.07em' };

function errMsg(e: unknown): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Operation failed';
}

interface User { id: number; name: string; email: string; role: string; is_active: boolean }

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
              {saving ? 'Saving…' : 'Create'}
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
                      <button onClick={() => handleUpdate(d.id)} disabled={saving} style={saveBtn}>{saving ? '…' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              return (
                <tr key={d.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{d.name}</td>
                  <td style={{ ...td, color: '#555', fontFamily: 'monospace', fontSize: 12 }}>{d.code ?? '—'}</td>
                  <td style={td}>
                    {deletingId === d.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(d.id)} disabled={saving} style={delConfirmBtn}>{saving ? '…' : 'Yes'}</button>
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
              {saving ? 'Saving…' : 'Create'}
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
                      <button onClick={() => handleUpdate(l.id)} disabled={saving} style={saveBtn}>{saving ? '…' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              );
              return (
                <tr key={l.id}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{l.level_name}</td>
                  <td style={td}><span style={{ padding: '1px 7px', borderRadius: 8, background: '#F0ECFF', color: '#6644BB', border: '1px solid #C5B8F0', fontSize: 11, fontWeight: 600 }}>{l.short_code}</span></td>
                  <td style={td}>{l.level_number ?? '—'}</td>
                  <td style={td}>
                    {deletingId === l.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(l.id)} disabled={saving} style={delConfirmBtn}>{saving ? '…' : 'Yes'}</button>
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
              {saving ? 'Saving…' : 'Create'}
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
                      <button onClick={() => handleUpdate(c.id)} disabled={saving} style={saveBtn}>{saving ? '…' : 'Save'}</button>
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
                  <td style={td}>{c.category ?? '—'}</td>
                  <td style={td}>
                    {hex
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, background: `#${hex}`, border: '1px solid #E0E0E0' }} />
                          <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{hex}</span>
                        </div>
                      : <span style={{ color: '#AAA' }}>—</span>}
                  </td>
                  <td style={td}>
                    {deletingId === c.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#AD050C' }}>Delete?</span>
                        <button onClick={() => handleDelete(c.id)} disabled={saving} style={delConfirmBtn}>{saving ? '…' : 'Yes'}</button>
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
              {saving ? 'Saving…' : 'Create'}
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
                      <button onClick={() => handleUpdate(r.id)} disabled={saving} style={saveBtn}>{saving ? '…' : 'Save'}</button>
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
                        <button onClick={() => handleDelete(r.id)} disabled={saving} style={delConfirmBtn}>{saving ? '…' : 'Yes'}</button>
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

function UsersTab() {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    rawClient.get<{ data: User[] }>('/admin/users')
      .then(r => setData(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div style={card}>
      {error && <div style={{ padding: '12px 16px', fontSize: 13, color: '#996600', background: '#FFFBEB', borderBottom: '1px solid #F5DFA0' }}>⚠ Requires PMO role — data may not be available</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>ID</th><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}>Active</th></tr></thead>
        <tbody>
          {loading ? <LoadingRows cols={5} /> : data.length === 0 ? (
            <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#555' }}>No users or insufficient permissions</td></tr>
          ) : data.map(u => (
            <tr key={u.id}>
              <td style={td}>{u.id}</td>
              <td style={{ ...td, color: '#111111', fontWeight: 500 }}>{u.name}</td>
              <td style={td}>{u.email}</td>
              <td style={td}><span style={{ padding: '1px 8px', borderRadius: 10, background: '#F0ECFF', color: '#6644BB', border: '1px solid #C5B8F0', fontSize: 11, fontWeight: 600 }}>{u.role}</span></td>
              <td style={td}>
                <span style={{ color: u.is_active ? '#33A85C' : '#E91C24', fontSize: 12, fontWeight: 600 }}>
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    return `${fmt(c.start_date)} – ${fmt(c.end_date)}`;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Manage planning cycles and their workflow stages. Use the Stage column to advance a cycle — editing access updates automatically based on the stage.
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
                <option value="">— Start blank —</option>
                {cycles.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={btnSecondary}>Cancel</button>
            <button
              onClick={handleCreate} disabled={saving || !form.name || !form.start_date || !form.end_date}
              style={{ padding: '7px 16px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: (!form.name || !form.start_date || !form.end_date) ? 0.6 : 1 }}
            >{saving ? 'Creating…' : form.copy_from_cycle_id ? 'Create & Copy' : 'Create'}</button>
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
                              {saving ? '…' : 'Save'}
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
                          {isSavingStage && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Saving…</span>}
                        </div>
                      </td>
                      <td style={td}>
                        {(STAGE_ACCESS[cycle.status]?.length ?? 0) > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {STAGE_ACCESS[cycle.status].map(r => {
                              const chip = ROLE_CHIP[r] ?? { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' };
                              return (
                                <span key={r} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}` }}>
                                  {r}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {cycle.status === 'closed' ? '🔒 Fully locked' : '🔒 Locked for editing'}
                          </span>
                        )}
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
                              >×</button>
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
                                style={{ padding: '3px 8px', background: 'none', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: '#666' }}>✕</button>
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

function GearingRatiosTab() {
  const [data, setData]           = useState<GearingConstant[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ min_divisor: '', max_divisor: '' });
  const [saving, setSaving]       = useState(false);

  function load() {
    setLoading(true);
    gearingApi.list().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdate(id: number) {
    const minVal = parseFloat(editForm.min_divisor);
    const maxVal = parseFloat(editForm.max_divisor);
    if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0) {
      toast.error('Min and Max divisors must be positive numbers'); return;
    }
    setSaving(true);
    try {
      await rawClient.put(`/gearing/${id}`, { min_divisor: minVal, max_divisor: maxVal });
      load(); setEditingId(null);
    } catch (e: unknown) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  const saveBtn: React.CSSProperties = { padding: '5px 12px', background: tk.accent, color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
        Gearing constants control the min/max headcount ratios per discipline and project type. The divisor is the number of staff one lead can oversee (e.g. 4 = 1:4 ratio).
      </p>
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Discipline</th>
              <th style={th}>Project Type</th>
              <th style={{ ...th, width: 130 }}>Min Divisor</th>
              <th style={{ ...th, width: 130 }}>Max Divisor</th>
              <th style={{ ...th, width: 160 }}>Last Updated By</th>
              <th style={{ ...th, width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows cols={6} /> : data.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#555' }}>No gearing constants configured</td></tr>
            ) : data.map(g => {
              if (editingId === g.id) return (
                <tr key={g.id} style={{ background: '#FAFAFA' }}>
                  <td style={{ ...td, color: '#111', fontWeight: 500 }}>{g.discipline_name}</td>
                  <td style={td}>{g.project_type}</td>
                  <td style={td}>
                    <input type="number" step="0.1" min="0.1"
                      value={editForm.min_divisor}
                      onChange={e => setEditForm(f => ({ ...f, min_divisor: e.target.value }))}
                      style={{ ...inp, width: 90 }} />
                  </td>
                  <td style={td}>
                    <input type="number" step="0.1" min="0.1"
                      value={editForm.max_divisor}
                      onChange={e => setEditForm(f => ({ ...f, max_divisor: e.target.value }))}
                      style={{ ...inp, width: 90 }} />
                  </td>
                  <td style={td} />
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleUpdate(g.id)} disabled={saving} style={saveBtn}>{saving ? '…' : 'Save'}</button>
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
                  <td style={td}>{g.min_divisor}</td>
                  <td style={td}>{g.max_divisor}</td>
                  <td style={{ ...td, fontSize: 12, color: '#888' }}>
                    {g.updated_by_name
                      ? `${g.updated_by_name} · ${fmtDate(g.updated_at)}`
                      : fmtDate(g.updated_at)}
                  </td>
                  <td style={td}>
                    <button
                      onClick={() => { setEditingId(g.id); setEditForm({ min_divisor: String(g.min_divisor), max_divisor: String(g.max_divisor) }); }}
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
// Admin page
// ---------------------------------------------------------------------------

const TABS = ['Planning Cycles', 'Disciplines', 'Levels', 'Contract Types', 'Regions', 'Users', 'Gearing Ratios'] as const;
type Tab = typeof TABS[number];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>('Planning Cycles');

  return (
    <div style={{ color: '#111111' }}>
      {/* Page title bar */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', borderRadius: 8, marginBottom: 16, border: '1px solid #E0E3E8', borderBottom: '3px solid #E91C24', padding: '8px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1 }}>Admin</div>
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
      {activeTab === 'Disciplines'    && <DisciplinesTab />}
      {activeTab === 'Levels'         && <LevelsTab />}
      {activeTab === 'Contract Types' && <ContractTypesTab />}
      {activeTab === 'Regions'        && <RegionsTab />}
      {activeTab === 'Users'          && <UsersTab />}
      {activeTab === 'Gearing Ratios' && <GearingRatiosTab />}
    </div>
  );
}
