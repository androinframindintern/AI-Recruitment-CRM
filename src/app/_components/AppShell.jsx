'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuthUser } from '@/lib/useAuthUser';
import { safeSignOut } from '@/lib/supabaseClient';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/candidates',
    label: 'Candidates',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/jobs',
    label: 'Jobs',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const ROLE_BADGE = {
  admin:     { cls: 'badge-indigo', label: 'Admin' },
  recruiter: { cls: 'badge-sky',    label: 'Recruiter' },
};

function getInitials(name) {
  return (name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function SidebarContent({ pathname, profile, loading, signingOut, onNav, onSignOut }) {
  return (
    <aside
      className="flex flex-col h-full"
      style={{
        background: 'linear-gradient(180deg, rgba(6,8,20,0.98) 0%, rgba(4,6,15,0.99) 100%)',
        borderRight: '1px solid rgba(255,255,255,0.055)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* ── Brand ── */}
      <div style={{ padding: '20px 16px 12px' }}>
        <Link
          href="/dashboard"
          onClick={onNav}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(6,182,212,0.08))',
            border: '1px solid rgba(99,102,241,0.22)',
            transition: 'all 180ms',
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em',
              boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
            }}
          >
            AI
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#818cf8', marginBottom: 2 }}>
              Recruitment CRM
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
              Smart Hiring
            </p>
          </div>
        </Link>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <p style={{ padding: '4px 10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(139,149,176,0.45)' }}>
          Menu
        </p>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={onNav}
            >
              <span className="nav-icon" style={{ opacity: active ? 1 : 0.60, flexShrink: 0, display: 'flex' }}>
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {active && (
                <span
                  style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: '#818cf8',
                    boxShadow: '0 0 8px rgba(129,140,248,0.6)',
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── User Card ── */}
      <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
        {loading ? (
          <div className="skeleton" style={{ height: 60, borderRadius: 14 }} />
        ) : (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#fff',
                boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
              }}
            >
              {getInitials(profile?.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.full_name || 'Demo Recruiter'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {profile?.email || 'demo@recruitcrm.local'}
              </p>
            </div>
            <span className={`badge ${ROLE_BADGE[profile?.role]?.cls || 'badge-sky'}`} style={{ fontSize: 9 }}>
              {ROLE_BADGE[profile?.role]?.label || 'Recruiter'}
            </span>
          </div>
        )}

        <button
          onClick={onSignOut}
          disabled={signingOut}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--text-muted)', fontSize: '0.8rem', gap: 8 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useAuthUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const currentPage = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  async function handleSignOut() {
    setSigningOut(true);
    await safeSignOut();
    router.push('/login');
  }

  const sidebarProps = {
    pathname,
    profile,
    loading,
    signingOut,
    onNav: () => setMobileOpen(false),
    onSignOut: handleSignOut,
  };

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg-base)' }}>

      {/* ── Desktop Sidebar ── */}
      <div
        className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-50"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <SidebarContent {...sidebarProps} />
      </div>

      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(2,5,20,0.80)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div
            className="absolute left-0 top-0 bottom-0 flex flex-col animate-slide-left"
            style={{ width: 'var(--sidebar-w)' }}
          >
            <SidebarContent {...sidebarProps} />
          </div>
        </div>
      )}

      {/* ── Main Area ── */}
      <div
        className="flex-1 flex flex-col min-h-dvh lg:pl-[264px]"
      >
        {/* Top Header */}
        <header
          className="sticky top-0 z-40 flex items-center gap-4"
          style={{
            height: 60,
            paddingLeft: 'max(16px, env(safe-area-inset-left))',
            paddingRight: 'max(24px, env(safe-area-inset-right))',
            background: 'rgba(4,6,15,0.88)',
            borderBottom: '1px solid rgba(255,255,255,0.055)',
            backdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden btn btn-ghost btn-icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open navigation"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          </button>

          {/* Page title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {currentPage?.label || 'AI Recruitment CRM'}
            </h1>
            <p className="hidden sm:block" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Smart hiring automation
            </p>
          </div>

          {/* Right: status pill */}
          <div
            className="hidden sm:flex items-center gap-2"
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(16,185,129,0.07)',
              border: '1px solid rgba(16,185,129,0.18)',
              fontSize: 11,
              fontWeight: 600,
              color: '#6ee7b7',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                animation: 'pulse-glow 2s ease-in-out infinite',
                display: 'inline-block',
              }}
            />
            System online
          </div>
        </header>

        {/* ── Page Content ── */}
        <main
          className="flex-1 animate-fade-in"
          style={{
            padding: '28px 28px 48px',
            marginLeft: 0,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
