import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import Sidebar from './Sidebar';
import { TabProvider, useTabContext } from '../context/TabContext';

const Dashboard     = lazy(() => import('../pages/Dashboard'));
const Projects      = lazy(() => import('../pages/Projects'));
const Allocations   = lazy(() => import('../pages/Allocations'));
const People        = lazy(() => import('../pages/People'));
const Headcount     = lazy(() => import('../pages/Headcount'));
const Requests      = lazy(() => import('../pages/Requests'));
const ChangeRequests = lazy(() => import('../pages/ChangeRequests'));
const Recruitment   = lazy(() => import('../pages/Recruitment'));
const Admin         = lazy(() => import('../pages/Admin'));
const Import        = lazy(() => import('../pages/Import'));
const Summary       = lazy(() => import('../pages/Summary'));

const PAGE_MAP: Record<string, React.ComponentType<any>> = {
  '/dashboard':       Dashboard,
  '/projects':        Projects,
  '/allocations':     Allocations,
  '/summary':         Summary,
  '/people':          People,
  '/headcount':       Headcount,
  '/requests':        Requests,
  '/change-requests': ChangeRequests,
  '/recruitment':     Recruitment,
  '/admin':           Admin,
  '/import':          Import,
};

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabContext();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      background: '#FFFFFF',
      borderBottom: '1px solid #E0E3E8',
      flexShrink: 0,
      overflowX: 'auto',
      height: 36,
      scrollbarWidth: 'none',
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const isHov    = hovered === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onMouseEnter={() => setHovered(tab.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px 0 14px',
              cursor: 'pointer',
              borderRight: '1px solid #E0E3E8',
              borderBottom: isActive ? '2px solid #E91C24' : '2px solid transparent',
              background: isActive ? '#FAFAFA' : isHov ? '#F7F8FA' : 'transparent',
              color: isActive ? '#111827' : '#5A657B',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              userSelect: 'none',
              transition: 'background 0.1s',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
            {tab.isDirty && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FDB90D', flexShrink: 0 }} title="Unsaved changes" />
            )}
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                onMouseEnter={e => { e.stopPropagation(); }}
                title="Close tab"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', padding: '1px 2px',
                  fontSize: 15, lineHeight: 1, opacity: isActive || isHov ? 0.7 : 0,
                  display: 'flex', alignItems: 'center',
                  borderRadius: 3, marginLeft: 2,
                  transition: 'opacity 0.1s, background 0.1s',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* Spacer to fill remaining width */}
      <div style={{ flex: 1, borderBottom: '2px solid transparent' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner layout (uses tab context)
// ---------------------------------------------------------------------------

function LayoutInner() {
  const [collapsed, setCollapsed]   = useState(false);
  const { tabs, activeTabId }       = useTabContext();
  const activatedRef                = useRef<Set<string>>(new Set([activeTabId]));
  const [, forceUpdate]             = useState(0);

  useEffect(() => {
    if (!activatedRef.current.has(activeTabId)) {
      const next = new Set(activatedRef.current);
      next.add(activeTabId);
      activatedRef.current = next;
      forceUpdate(n => n + 1);
    }
  }, [activeTabId]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar spacer */}
      <div style={{ width: collapsed ? 56 : 240, flexShrink: 0, transition: 'width 0.25s ease' }} />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TabBar />
        <main style={{ flex: 1, overflow: 'hidden', padding: 28, background: '#FFFFFF', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<div style={{ padding: 40, color: '#8B93A3', fontSize: 13 }}>Loading…</div>}>
            {tabs.filter(t => activatedRef.current.has(t.id)).map(tab => {
              const Component = PAGE_MAP[tab.route];
              if (!Component) return null;
              return (
                <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <Component tabId={tab.id} />
                </div>
              );
            })}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export default function Layout() {
  const initialRoute = window.location.pathname;
  return (
    <TabProvider initialRoute={initialRoute}>
      <LayoutInner />
    </TabProvider>
  );
}
