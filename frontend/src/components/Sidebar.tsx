import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getUser } from '../hooks/useAuth';
import { useTabContext } from '../context/TabContext';
import equinixFortressWhite from '../assets/equinix-fortress-white.svg';

const ICONS: Record<string, string> = {
  summary:     'M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.1h-15V5h15v14.1zm0-16.1h-15c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  dashboard:   'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  projects:    'M3 3h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h12v2H3zm0 4h12v2H3z',
  people:      'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  allocations: 'M3 3h18v18H3zm2 2v14h14V5zm2 2h4v4H7zm0 6h10v2H7zm0 4h10v2H7zm6-10h4v4h-4z',
  headcount:   'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z',
  requests:    'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  changes:     'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z',
  recruitment: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  admin:       'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5z',
  import:      'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
};

// Equinix brand gradient per section
const ROUTE_GRADIENTS: Record<string, string> = {
  '/dashboard':       'linear-gradient(160deg, #E91C24 0%, #411980 100%)',
  '/projects':        'linear-gradient(160deg, #E91C24 0%, #00408C 100%)',
  '/allocations':     'linear-gradient(160deg, #086AE3 0%, #00737A 50%, #33A85C 100%)',
  '/people':          'linear-gradient(160deg, #7739D9 0%, #411980 100%)',
  '/headcount':       'linear-gradient(160deg, #086AE3 0%, #411980 100%)',
  '/requests':        'linear-gradient(160deg, #FE9234 0%, #E91C24 100%)',
  '/change-requests': 'linear-gradient(160deg, #E91C24 0%, #2F3541 100%)',
  '/recruitment':     'linear-gradient(160deg, #33A85C 0%, #086AE3 100%)',
  '/admin':           'linear-gradient(160deg, #2F3541 0%, #111111 100%)',
  '/import':          'linear-gradient(160deg, #00737A 0%, #086AE3 100%)',
  '/summary':         'linear-gradient(160deg, #33A85C 0%, #1A4A7A 100%)',
};

// People moved below Allocations
const NAV = [
  { to: '/dashboard',       label: 'Dashboard',          icon: 'dashboard'   },
  { to: '/projects',        label: 'Projects',           icon: 'projects'    },
  { to: '/allocations',     label: 'Resources',          icon: 'allocations' },
  { to: '/summary',         label: 'Summary',            icon: 'summary'     },
  { to: '/headcount',       label: 'Headcount Requests', icon: 'headcount'   },
  { to: '/change-requests', label: 'Change Requests',    icon: 'changes'     },
  { to: '/recruitment',     label: 'Talent Acquisition', icon: 'recruitment' },
  { to: '/people',          label: 'People',             icon: 'people'      },
  { to: '/admin',           label: 'Admin',              icon: 'admin'       },
  { to: '/import',          label: 'Import Data',        icon: 'import'      },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [hovered, setHovered]     = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const navigate                  = useNavigate();
  const user                      = getUser();
  const { openTab, activeRoute }  = useTabContext();

  const isExpanded = !collapsed || hovered;
  const gradient   = ROUTE_GRADIENTS[activeRoute] ?? ROUTE_GRADIENTS['/dashboard'];

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function handleNav(to: string) {
    // If already on this route and it's the active tab → open a second instance
    openTab(to, activeRoute === to);
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: 0, top: 0,
        height: '100vh',
        width: isExpanded ? 240 : 56,
        background: gradient,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease, background 0.4s ease',
        overflow: 'hidden',
        zIndex: 200,
        boxShadow: collapsed && hovered ? '4px 0 32px rgba(0,0,0,0.35)' : '2px 0 16px rgba(0,0,0,0.2)',
      }}
    >
      {/* Logo + toggle */}
      <div style={{
        height: 68,
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center',
        padding: isExpanded ? '0 14px' : '0',
        justifyContent: isExpanded ? 'flex-start' : 'center',
        gap: isExpanded ? 10 : 0,
        flexShrink: 0, overflow: 'hidden',
      }}>
        <img src={equinixFortressWhite} alt="Equinix" style={{ height: 20, width: 'auto', flexShrink: 0, display: 'block' }} />

        <div style={{
          opacity: isExpanded ? 1 : 0,
          maxWidth: isExpanded ? 200 : 0,
          overflow: 'hidden',
          transition: 'opacity 0.15s ease, max-width 0.25s ease',
          whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>
          <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, marginTop: 2, letterSpacing: '0.02em' }}>
            GDC Planning
          </div>
        </div>

        <button
          onClick={onToggle}
          title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
          style={{
            opacity: isExpanded ? 1 : 0,
            maxWidth: isExpanded ? 26 : 0,
            pointerEvents: isExpanded ? 'auto' : 'none',
            overflow: 'hidden',
            transition: 'opacity 0.15s ease, max-width 0.25s ease',
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 5,
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer', flexShrink: 0, padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {collapsed
              ? <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z" />
              : <path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z" />
            }
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8, overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(({ to, label, icon }) => {
          const isActive = activeRoute === to;
          const isHov    = hoveredNav === to;
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              onMouseEnter={() => setHoveredNav(to)}
              onMouseLeave={() => setHoveredNav(null)}
              title={!isExpanded ? label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '10px 19px',
                background: isActive
                  ? 'rgba(255,255,255,0.18)'
                  : isHov ? 'rgba(255,255,255,0.09)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${isActive ? '#FFFFFF' : 'transparent'}`,
                color: '#FFFFFF',
                opacity: isActive ? 1 : 0.78,
                cursor: 'pointer',
                fontSize: 14, fontWeight: isActive ? 600 : 400,
                textAlign: 'left',
                whiteSpace: 'nowrap', overflow: 'hidden',
                transition: 'background 0.12s, opacity 0.12s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d={ICONS[icon]} />
              </svg>
              <span style={{ opacity: isExpanded ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', padding: '14px 14px', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#FFFFFF',
            flexShrink: 0, letterSpacing: '0.03em',
          }}>
            {user ? initials(user.name) : '?'}
          </div>
          <div style={{ overflow: 'hidden', opacity: isExpanded ? 1 : 0, transition: 'opacity 0.15s ease', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name ?? 'Demo User'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              {user?.role ?? ''}
            </div>
          </div>
        </div>

        <div style={{ maxHeight: isExpanded ? 44 : 0, opacity: isExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.25s ease, opacity 0.15s ease', marginTop: isExpanded ? 12 : 0 }}>
          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: '7px 0', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.85)', fontSize: 12, borderRadius: 4, cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
