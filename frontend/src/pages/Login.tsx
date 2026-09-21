import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../hooks/useAuth';
import equinixFortressRed from '../assets/equinix-fortress-red.svg';

const ROLES = [
  'Workforce Planning',
  'PMO',
  'Department Lead',
  'Function Lead',
  'Head of Commercial',
  'Head of Department',
  'EVP',
];

const IS_REVIEW = process.env.REACT_APP_REVIEW_BADGE === 'true';

export default function Login() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [nameError, setNameError] = useState('');

  function handleContinue() {
    if (!name.trim()) {
      setNameError('Please enter your name');
      return;
    }
    const trimmed = name.trim();
    const email = trimmed.toLowerCase().replace(/\s+/g, '.') + '@equinix.com';
    login({ name: trimmed, email, role });
    navigate('/dashboard', { replace: true });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleContinue();
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(160deg, #E91C24 0%, #411980 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 400,
        background: '#FFFFFF',
        borderRadius: 12,
        padding: IS_REVIEW ? '0 0 48px' : '48px 40px',
        textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* Evaluation badge — review builds only */}
        {IS_REVIEW && (
          <div style={{
            background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '7px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            marginBottom: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            Evaluation Version — Not for Production Use
          </div>
        )}

        <div style={{ padding: IS_REVIEW ? '32px 40px 0' : '0' }}>
        {/* Logo */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <img src={equinixFortressRed} alt="Equinix" style={{ height: 28, width: 'auto' }} />
        </div>

        <h1 style={{ color: '#111827', fontSize: 20, fontWeight: 700, lineHeight: 1.3, margin: '0 0 8px' }}>
          GDC Planning
        </h1>
        <p style={{ color: '#5A657B', fontSize: 13, margin: '0 0 4px' }}>
          GDC Workforce Planning Platform
        </p>

        <div style={{ width: 36, height: 3, background: '#E91C24', margin: '16px auto 28px', borderRadius: 2 }} />

        {/* Your Name */}
        <div style={{ marginBottom: 14, textAlign: 'left' }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700, color: '#5A657B',
            marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          }}>
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setNameError(''); }}
            onKeyDown={handleKeyDown}
            placeholder=""
            autoFocus
            style={{
              width: '100%',
              padding: '10px 13px',
              background: '#FFFFFF',
              border: `1px solid ${nameError ? '#E91C24' : '#E0E3E8'}`,
              borderRadius: 6,
              color: '#111827',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
          {nameError && (
            <span style={{ fontSize: 11, color: '#E91C24', marginTop: 4, display: 'block' }}>
              {nameError}
            </span>
          )}
        </div>

        {/* Role */}
        <div style={{ marginBottom: 28, textAlign: 'left' }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700, color: '#5A657B',
            marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          }}>
            Role
          </label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 13px',
              background: '#F2F3F4',
              border: '1px solid #E0E3E8',
              borderRadius: 6,
              color: '#111827',
              fontSize: 14,
              outline: 'none',
              cursor: 'pointer',
              boxSizing: 'border-box' as const,
            }}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Continue button */}
        <button
          type="button"
          onClick={handleContinue}
          style={{
            display: 'block',
            width: '100%',
            padding: '13px 0',
            background: '#E91C24',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Continue →
        </button>
        </div>{/* end inner padding wrapper */}
      </div>
    </div>
  );
}
