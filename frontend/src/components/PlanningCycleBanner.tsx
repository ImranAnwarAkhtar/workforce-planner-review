import { usePlanningCycle } from '../context/PlanningCycleContext';

const STATUS_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  draft:        { label: 'Draft',        bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' },
  active:       { label: 'Active',       bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' },
  under_review: { label: 'Under Review', bg: '#FEF9C3', color: '#CA8A04', border: '#FDE047' },
  approved:     { label: 'Approved',     bg: '#DBEAFE', color: '#2563EB', border: '#93C5FD' },
  closed:       { label: 'Closed',       bg: '#F3F4F6', color: '#9CA3AF', border: '#D1D5DB' },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PlanningCycleBanner() {
  const { selectedCycle } = usePlanningCycle();
  if (!selectedCycle) return null;

  const meta = STATUS_META[selectedCycle.status] ?? STATUS_META.draft;

  return (
    <div style={{
      flexShrink: 0,
      background: '#F8F9FB',
      borderBottom: '1px solid #E0E3E8',
      padding: '5px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A657B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#5A657B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Planning Cycle
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{selectedCycle.name}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
      }}>
        {meta.label}
      </span>
      <span style={{ fontSize: 11, color: '#6B7280' }}>
        {fmtDate(selectedCycle.start_date)} – {fmtDate(selectedCycle.end_date)}
      </span>
    </div>
  );
}
