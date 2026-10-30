import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  hireRequestsApi, refDataApi, peopleApi,
  type HireRequest, type Person, type Discipline, type Level, type ContractType, type Region, type Country,
  type CreateHireRequestBody, type ApproveHireRequestBody,
} from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TYPES_DEFAULT = ['Net New', 'Backfill', 'Conversion', 'Contractor Extension', 'Contractor to Perm'];
const STAGE_LABELS  = ['Submitted', 'Dept Review', 'Commercial Review', 'Final Approval'];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 11px', background: '#FFFFFF',
  border: '1px solid #D5D5D5', borderRadius: 6,
  color: '#111111', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' };
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#666666',
  marginBottom: 4, letterSpacing: '0.07em', textTransform: 'uppercase',
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px', background: '#E91C24', color: '#FFFFFF',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const BTN_SECONDARY: React.CSSProperties = {
  padding: '8px 18px', background: '#FFFFFF', color: '#555555',
  border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Pending:  { bg: '#FFF1CC', color: '#FDB90D', border: '#FEDC86' },
  Approved: { bg: '#DFFBE5', color: '#2A8346', border: '#33A85C' },
  Rejected: { bg: '#FFEBEE', color: '#AD050C', border: '#E91C24' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#F0F0F0', color: '#555555', border: '#D0D0D0' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function RequestTypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: '#F0F0FF', color: '#4455CC', border: '1px solid #BBCCE8',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

function StageProgress({ stage, status }: { stage: number; status: string }) {
  const isApproved = status === 'Approved';
  const isRejected = status === 'Rejected';
  const activeStep = isApproved ? 4 : stage - 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 10 }}>
      {STAGE_LABELS.map((lbl, i) => {
        const done    = isApproved || (!isRejected && i < activeStep);
        const current = !isApproved && !isRejected && i === activeStep;
        const dotColor  = isRejected ? '#E0E0E0'
                        : done       ? '#33A85C'
                        : current    ? '#FDB90D'
                        : '#D0D0D0';
        const textColor = isRejected ? '#BBBBBB'
                        : done       ? '#33A85C'
                        : current    ? '#FDB90D'
                        : '#AAAAAA';
        return (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center' }}>
            <div title={lbl} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: done ? '#33A85C' : current ? '#FFF8E1' : '#F0F0F0',
                border: `2px solid ${dotColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: dotColor,
              }}>
                {done && !isRejected ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 9, color: textColor, whiteSpace: 'nowrap' }}>{lbl}</span>
            </div>
            {i < 3 && (
              <div style={{
                width: 28, height: 2, marginBottom: 14,
                background: done && !isRejected ? '#33A85C' : '#E0E0E0',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#FFFFFF', borderRadius: 10, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #E5E5E5',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#111111', marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  request_type: string; discipline_id: string; level_id: string;
  contract_type_id: string; region_id: string; country_id: string;
  project_id: string; justification: string;
  hiring_manager_id: string; hub_lead_id: string;
}
const emptyForm: FormState = {
  request_type: 'Net New', discipline_id: '', level_id: '', contract_type_id: '',
  region_id: '', country_id: '', project_id: '', justification: '',
  hiring_manager_id: '', hub_lead_id: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HireRequests() {
  const [requests, setRequests]     = useState<HireRequest[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [levels, setLevels]         = useState<Level[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [regions, setRegions]       = useState<Region[]>([]);
  const [countries, setCountries]   = useState<Country[]>([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState<FormState>(emptyForm);
  const [saving, setSaving]       = useState(false);

  const [rejectTarget, setRejectTarget] = useState<HireRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting]       = useState(false);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [people, setPeople] = useState<Person[]>([]);
  const [modalTab, setModalTab] = useState<'request' | 'approval'>('request');
  const [approveTarget, setApproveTarget] = useState<HireRequest | null>(null);
  const [approvalForm, setApprovalForm] = useState({ tbh_code: '', candidate_name: '', confirmed_start_date: '', position_notes: '' });
  const [approving, setApproving] = useState(false);

  const [requestTypes, setRequestTypes] = useState<string[]>(REQUEST_TYPES_DEFAULT);

  useEffect(() => {
    Promise.all([
      refDataApi.disciplines().catch(() => [] as Discipline[]),
      refDataApi.levels().catch(() => [] as Level[]),
      refDataApi.contractTypes().catch(() => [] as ContractType[]),
      refDataApi.regions().catch(() => [] as Region[]),
      refDataApi.countries().catch(() => [] as Country[]),
      refDataApi.refListByName('request_type').catch(() => [] as { value: string }[]),
    ]).then(([d, l, c, r, co, rt]) => {
      setDisciplines(d); setLevels(l); setContractTypes(c); setRegions(r); setCountries(co);
      if (rt.length > 0) setRequestTypes(rt.map((e: { value: string }) => e.value));
    });
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await hireRequestsApi.list({ status: statusFilter || undefined, limit: 200 });
      setRequests(data);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const filteredCountries = useMemo(
    () => form.region_id ? countries.filter(c => String(c.region_id) === form.region_id) : countries,
    [form.region_id, countries]
  );

  useEffect(() => {
    if (!modalOpen) return;
    const params: { limit: number; is_active: 'true'; discipline_id?: number; region_id?: number } = { limit: 500, is_active: 'true' };
    if (form.discipline_id) params.discipline_id = parseInt(form.discipline_id, 10);
    if (form.region_id)     params.region_id     = parseInt(form.region_id, 10);
    peopleApi.list(params).then(setPeople).catch(() => {});
  }, [modalOpen, form.discipline_id, form.region_id]);

  function setField(k: keyof FormState, v: string) {
    setForm(f => ({ ...f, [k]: v, ...(k === 'region_id' ? { country_id: '' } : {}) }));
  }

  async function handleSubmit() {
    if (!form.request_type) return;
    setSaving(true);
    try {
      const body: CreateHireRequestBody = {
        request_type:      form.request_type,
        discipline_id:     form.discipline_id     ? parseInt(form.discipline_id, 10)     : null,
        level_id:          form.level_id          ? parseInt(form.level_id, 10)          : null,
        contract_type_id:  form.contract_type_id  ? parseInt(form.contract_type_id, 10)  : null,
        region_id:         form.region_id         ? parseInt(form.region_id, 10)         : null,
        country_id:        form.country_id        ? parseInt(form.country_id, 10)        : null,
        justification:     form.justification     || null,
        hiring_manager_id: form.hiring_manager_id ? parseInt(form.hiring_manager_id, 10) : null,
        hub_lead_id:       form.hub_lead_id       ? parseInt(form.hub_lead_id, 10)       : null,
      };
      await hireRequestsApi.create(body);
      closeModal();
      setForm(emptyForm);
      loadRequests();
    } finally { setSaving(false); }
  }

  function openApprovalModal(r: HireRequest) {
    setApproveTarget(r);
    setApprovalForm({ tbh_code: '', candidate_name: '', confirmed_start_date: '', position_notes: '' });
    setModalTab('approval');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setApproveTarget(null);
    setModalTab('request');
  }

  async function handleApproveWithDetails() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const body: ApproveHireRequestBody = {
        tbh_code:             approvalForm.tbh_code             || null,
        candidate_name:       approvalForm.candidate_name       || null,
        confirmed_start_date: approvalForm.confirmed_start_date || null,
        position_notes:       approvalForm.position_notes       || null,
      };
      await hireRequestsApi.approve(approveTarget.id, body);
      closeModal();
      loadRequests();
    } finally { setApproving(false); }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await hireRequestsApi.reject(rejectTarget.id, rejectReason || undefined);
      setRejectTarget(null); setRejectReason('');
      loadRequests();
    } finally { setRejecting(false); }
  }

  const counts = useMemo(() => ({
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'Pending').length,
    approved: requests.filter(r => r.status === 'Approved').length,
    rejected: requests.filter(r => r.status === 'Rejected').length,
  }), [requests]);

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ color: '#111111', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF', borderBottom: '3px solid #E91C24', padding: '8px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1 }}>Hire Requests</div>
          <button style={{ ...BTN_PRIMARY, padding: '4px 10px', fontSize: 11, borderRadius: 4 }} onClick={() => { setForm(emptyForm); setModalTab('request'); setApproveTarget(null); setModalOpen(true); }}>
            + New Request
          </button>
        </div>
        <div style={{ padding: '0 16px', background: '#FFFFFF', borderBottom: '1px solid #E5E5E5' }}>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E5E5' }}>
          {[
            { label: `All`,      value: '',         count: counts.all },
            { label: `Pending`,  value: 'Pending',  count: counts.pending },
            { label: `Approved`, value: 'Approved', count: counts.approved },
            { label: `Rejected`, value: 'Rejected', count: counts.rejected },
          ].map(({ label, value, count }) => (
            <button key={value} onClick={() => setStatusFilter(value)} style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: statusFilter === value ? '2px solid #E91C24' : '2px solid transparent',
              color: statusFilter === value ? '#111111' : '#888888',
              fontSize: 13, cursor: 'pointer', fontWeight: statusFilter === value ? 700 : 400,
              marginBottom: -1,
            }}>
              {label}
              <span style={{
                marginLeft: 6, padding: '1px 7px', borderRadius: 10, fontSize: 11,
                background: statusFilter === value ? '#E91C24' : '#F0F0F0',
                color: statusFilter === value ? '#FFFFFF' : '#666666',
              }}>
                {count}
              </span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#AD050C' }}>
            {error}
            <button style={{ ...BTN_SECONDARY, marginLeft: 12 }} onClick={loadRequests}>Retry</button>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#888888', fontSize: 14 }}>
            No hire requests found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(r => {
              const isExpanded_ = expanded.has(r.id);
              return (
                <div key={r.id} style={{
                  background: '#FFFFFF', border: '1px solid #E5E5E5',
                  borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                }}>
                  {/* Card top */}
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Type + status + ID */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <RequestTypeBadge type={r.request_type} />
                          <StatusBadge status={r.status} />
                          <span style={{ fontSize: 11, color: '#AAAAAA' }}>#{r.id}</span>
                        </div>

                        {/* Key details chips */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {r.discipline_name     && <Chip label="Discipline"   value={r.discipline_name} />}
                          {r.level_name          && <Chip label="Level"        value={r.level_name} />}
                          {r.contract_type_code  && <Chip label="Contract"     value={r.contract_type_code} />}
                          {r.region_name         && <Chip label="Region"       value={r.region_name} />}
                          {r.country_name        && <Chip label="Country"      value={r.country_name} />}
                          {r.project_name        && <Chip label="Project"      value={r.project_name} />}
                          {r.hiring_manager_name && <Chip label="Hiring Mgr"  value={r.hiring_manager_name} />}
                          {r.hub_lead_name       && <Chip label="Hub Lead"     value={r.hub_lead_name} />}
                        </div>

                        {/* Stage progress */}
                        <StageProgress stage={r.stage} status={r.status} />

                        {/* Submitter + date */}
                        {r.submitted_by_name && (
                          <div style={{ fontSize: 11, color: '#888888', marginTop: 6 }}>
                            Submitted by <strong style={{ color: '#555555' }}>{r.submitted_by_name}</strong>
                            {' · '}
                            {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
                        {r.status === 'Pending' && (
                          <>
                            <button onClick={() => openApprovalModal(r)} style={{
                              padding: '5px 12px', background: '#EBF7EF', color: '#33A85C',
                              border: '1px solid #A8DDB5', borderRadius: 4, fontSize: 12,
                              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}>
                              ✓ Approve Stage {r.stage}
                            </button>
                            <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} style={{
                              padding: '5px 12px', background: '#FEF3F2', color: '#AD050C',
                              border: '1px solid #FBBDBA', borderRadius: 4, fontSize: 12,
                              fontWeight: 600, cursor: 'pointer',
                            }}>
                              ✕ Reject
                            </button>
                          </>
                        )}
                        <button onClick={() => toggleExpanded(r.id)} style={{
                          padding: '4px 10px', background: 'transparent',
                          border: '1px solid #E0E0E0', borderRadius: 4,
                          fontSize: 11, color: '#888888', cursor: 'pointer',
                        }}>
                          {isExpanded_ ? 'Less ▲' : 'More ▼'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded justification */}
                  {isExpanded_ && (
                    <div style={{
                      padding: '12px 18px', borderTop: '1px solid #F0F0F0',
                      background: '#FAFAFA',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Justification
                      </div>
                      <div style={{ fontSize: 13, color: '#333333', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {r.justification || <span style={{ color: '#AAAAAA', fontStyle: 'italic' }}>No justification provided</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Request / Approval modal ── */}
      {modalOpen && (
        <Modal
          title={approveTarget ? `Request #${approveTarget.id} — ${approveTarget.request_type}` : 'Submit Hire Request'}
          onClose={closeModal}
        >
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E5E5', marginBottom: 20, marginTop: -4 }}>
            {(['request', 'approval'] as const).map(tab => {
              const label = tab === 'request' ? 'Request' : 'Approval';
              const disabled = tab === 'approval' && !approveTarget;
              return (
                <button
                  key={tab}
                  onClick={() => { if (!disabled) setModalTab(tab); }}
                  style={{
                    padding: '8px 16px', background: 'transparent', border: 'none',
                    borderBottom: modalTab === tab ? '2px solid #E91C24' : '2px solid transparent',
                    color: modalTab === tab ? '#111111' : disabled ? '#CCCCCC' : '#888888',
                    fontSize: 13, cursor: disabled ? 'default' : 'pointer',
                    fontWeight: modalTab === tab ? 700 : 400, marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {modalTab === 'request' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Request Type *</label>
                <select style={SELECT} value={form.request_type} onChange={e => setField('request_type', e.target.value)}>
                  {requestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Level</label>
                  <select style={SELECT} value={form.level_id} onChange={e => setField('level_id', e.target.value)}>
                    <option value="">— Any —</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.level_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Discipline</label>
                  <select style={SELECT} value={form.discipline_id} onChange={e => setField('discipline_id', e.target.value)}>
                    <option value="">— Any —</option>
                    {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Contract Type</label>
                  <select style={SELECT} value={form.contract_type_id} onChange={e => setField('contract_type_id', e.target.value)}>
                    <option value="">— Any —</option>
                    {contractTypes.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Region</label>
                  <select style={SELECT} value={form.region_id} onChange={e => setField('region_id', e.target.value)}>
                    <option value="">— Any —</option>
                    {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              {form.region_id && (
                <div>
                  <label style={LABEL}>Country</label>
                  <select style={SELECT} value={form.country_id} onChange={e => setField('country_id', e.target.value)}>
                    <option value="">— Any —</option>
                    {filteredCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Hiring Manager</label>
                  <select style={SELECT} value={form.hiring_manager_id} onChange={e => setField('hiring_manager_id', e.target.value)}>
                    <option value="">— Select —</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {(form.region_id || form.discipline_id) && (
                    <div style={{ fontSize: 10, color: '#999999', marginTop: 3 }}>
                      Filtered by selected {[form.region_id && 'region', form.discipline_id && 'discipline'].filter(Boolean).join(' + ')}
                    </div>
                  )}
                </div>
                <div>
                  <label style={LABEL}>Hub Lead</label>
                  <select style={SELECT} value={form.hub_lead_id} onChange={e => setField('hub_lead_id', e.target.value)}>
                    <option value="">— Select —</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={LABEL}>Justification / Business Case</label>
                <textarea
                  style={{ ...INPUT, height: 80, resize: 'vertical' as const, fontFamily: 'inherit' }}
                  value={form.justification}
                  onChange={e => setField('justification', e.target.value)}
                  placeholder="Why is this hire needed? What project / workload does it support?"
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 18, borderTop: '1px solid #EEEEEE' }}>
                <button style={BTN_SECONDARY} onClick={closeModal} disabled={saving}>Cancel</button>
                <button style={BTN_PRIMARY} onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          ) : !approveTarget ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#AAAAAA', fontSize: 13 }}>
              Use the ✓ Approve button on a pending request to open this tab.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Request summary */}
              <div style={{ background: '#F8F9FB', borderRadius: 6, padding: '12px 14px', border: '1px solid #E5E5E5' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Request Summary</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <RequestTypeBadge type={approveTarget.request_type} />
                  {approveTarget.discipline_name  && <Chip label="Discipline"   value={approveTarget.discipline_name} />}
                  {approveTarget.level_name       && <Chip label="Level"        value={approveTarget.level_name} />}
                  {approveTarget.region_name      && <Chip label="Region"       value={approveTarget.region_name} />}
                  {approveTarget.hiring_manager_name && <Chip label="Hiring Mgr" value={approveTarget.hiring_manager_name} />}
                  {approveTarget.hub_lead_name    && <Chip label="Hub Lead"     value={approveTarget.hub_lead_name} />}
                </div>
                <StageProgress stage={approveTarget.stage} status={approveTarget.status} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>TBH Code</label>
                  <input style={INPUT} value={approvalForm.tbh_code} onChange={e => setApprovalForm(f => ({ ...f, tbh_code: e.target.value }))} placeholder="e.g. TBH-2026-001" />
                </div>
                <div>
                  <label style={LABEL}>Confirmed Start Date</label>
                  <input style={{ ...INPUT, cursor: 'pointer' }} type="date" value={approvalForm.confirmed_start_date} onChange={e => setApprovalForm(f => ({ ...f, confirmed_start_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={LABEL}>Candidate Name</label>
                <input style={INPUT} value={approvalForm.candidate_name} onChange={e => setApprovalForm(f => ({ ...f, candidate_name: e.target.value }))} placeholder="Name of the selected candidate" />
              </div>

              <div>
                <label style={LABEL}>Position Notes</label>
                <textarea style={{ ...INPUT, height: 72, resize: 'vertical' as const, fontFamily: 'inherit' }} value={approvalForm.position_notes} onChange={e => setApprovalForm(f => ({ ...f, position_notes: e.target.value }))} placeholder="Any additional notes about this position…" />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 18, borderTop: '1px solid #EEEEEE' }}>
                <button style={BTN_SECONDARY} onClick={closeModal} disabled={approving}>Cancel</button>
                <button
                  onClick={() => { setRejectTarget(approveTarget); setRejectReason(''); closeModal(); }}
                  style={{ padding: '8px 18px', background: '#FEF3F2', color: '#AD050C', border: '1px solid #FBBDBA', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  disabled={approving}
                >
                  ✕ Reject
                </button>
                <button style={BTN_PRIMARY} onClick={handleApproveWithDetails} disabled={approving}>
                  {approving ? 'Approving…' : `✓ Approve Stage ${approveTarget.stage}`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Reject modal ── */}
      {rejectTarget && (
        <Modal title={`Reject Request #${rejectTarget.id}`} onClose={() => setRejectTarget(null)}>
          <p style={{ color: '#444444', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
            <RequestTypeBadge type={rejectTarget.request_type} />
            {rejectTarget.discipline_name && ` · ${rejectTarget.discipline_name}`}
            {rejectTarget.level_name && ` · ${rejectTarget.level_name}`}
          </p>
          <div>
            <label style={LABEL}>Rejection Reason (optional)</label>
            <textarea
              style={{ ...INPUT, height: 72, resize: 'vertical' as const, fontFamily: 'inherit' }}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, paddingTop: 18, borderTop: '1px solid #EEEEEE' }}>
            <button style={BTN_SECONDARY} onClick={() => setRejectTarget(null)} disabled={rejecting}>Cancel</button>
            <button style={{ ...BTN_PRIMARY, background: '#AD050C' }} onClick={handleReject} disabled={rejecting}>
              {rejecting ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared chip
// ---------------------------------------------------------------------------

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 4, fontSize: 11,
      background: '#F5F5F5', color: '#444444', border: '1px solid #E5E5E5',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: '#888888', marginRight: 3 }}>{label}:</span>
      <strong>{value}</strong>
    </span>
  );
}
