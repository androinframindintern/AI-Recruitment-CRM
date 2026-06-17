'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { apiGet, apiPost } from '@/lib/api';

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
    title: 'AI Resume Parsing',
    detail: 'Upload PDF/DOCX — AI extracts structured candidate profiles instantly.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: 'AI Ranking Engine',
    detail: 'Score candidates 0-100 against job descriptions with skill match explanations.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Interview Scheduling',
    detail: 'Google Calendar sync, auto-invite emails, and reminder automation.',
  },
];

function FormField({ id, label, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="form-input"
          style={{ paddingRight: isPassword ? 44 : 16 }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: '#475569', lineHeight: 1 }}
            tabIndex={-1}
          >
            {show ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('demo@recruitcrm.local');
  const [password, setPassword] = useState('demo1234');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      // Demo bypass
      if (email === 'demo@recruitcrm.local') {
        router.push('/dashboard');
        return;
      }

      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        if (!fullName.trim()) {
          setError('Full name is required');
          setBusy(false);
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), role: 'recruiter' } },
        });
        if (signUpError) throw signUpError;
      }

      await apiGet('/api/me', { auth: true }).catch(() => null);
      router.push('/dashboard');
    } catch (caught) {
      if (mode === 'signin') {
        const exists = await apiPost('/api/me/check-email', { email }, { auth: false }).catch(() => ({ exists: true }));
        setError(exists.exists ? 'Incorrect password. Please try again.' : 'This email is not registered. Create an account instead.');
      } else {
        setError(caught?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.20), transparent), radial-gradient(ellipse 50% 40% at 80% 15%, rgba(14,165,233,0.14), transparent)',
        }}
      />

      <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-[1.1fr_0.9fr] relative z-10">

        {/* LEFT: marketing panel */}
        <div
          className="glass-card p-8 sm:p-12 flex flex-col justify-between hidden lg:flex"
          style={{ minHeight: 560 }}
        >
          <div>
            {/* Brand */}
            <div className="flex items-center gap-3 mb-8">
              <div
                className="flex items-center justify-center rounded-2xl text-white font-bold"
                style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #6366f1, #0ea5e9)', fontSize: 18 }}
              >
                AI
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#818cf8' }}>
                  AI Recruitment CRM
                </p>
                <p className="text-sm font-medium text-white">Smart Hiring Platform</p>
              </div>
            </div>

            <h1 className="text-4xl font-bold text-white leading-tight">
              Hire smarter,{' '}
              <span className="gradient-text">not harder.</span>
            </h1>
            <p className="mt-4 text-base leading-7" style={{ color: '#64748b' }}>
              AI-powered resume parsing, candidate ranking, interview scheduling, and hiring analytics — all in one CRM built for modern teams.
            </p>

            <div className="mt-10 space-y-5">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{
                      width: 40, height: 40,
                      background: 'rgba(99,102,241,0.12)',
                      border: '1px solid rgba(99,102,241,0.22)',
                      color: '#818cf8',
                    }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Demo hint */}
          <div
            className="mt-8 rounded-2xl p-4 text-sm"
            style={{
              background: 'rgba(14,165,233,0.08)',
              border: '1px solid rgba(14,165,233,0.18)',
              color: '#7dd3fc',
            }}
          >
            <p className="font-semibold mb-1">⚡ Quick demo access</p>
            <p style={{ color: '#94a3b8' }}>Email: <code className="text-sky-300">demo@recruitcrm.local</code> · Any password</p>
          </div>
        </div>

        {/* RIGHT: auth form */}
        <div className="glass-card p-8 sm:p-10 flex flex-col">
          {/* Mode toggle */}
          <div
            className="flex rounded-xl p-1 mb-8"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {['signin', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={
                  mode === m
                    ? { background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }
                    : { color: '#475569', border: '1px solid transparent' }
                }
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#64748b' }}>
              {mode === 'signin'
                ? 'Sign in to your recruitment workspace'
                : 'Start managing your hiring pipeline today'}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4" id="auth-form">
              {mode === 'signup' && (
                <FormField
                  id="full-name"
                  label="Full name"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Jane Recruiter"
                  autoComplete="name"
                />
              )}
              <FormField
                id="email"
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                autoComplete="email"
              />
              <FormField
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />

              {mode === 'signin' && (
                <div className="text-right">
                  <Link
                    href="/reset-password"
                    className="text-xs font-medium"
                    style={{ color: '#818cf8' }}
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              {error && (
                <div className="alert alert-error">
                  <div className="flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                </div>
              )}

              <button
                type="submit"
                id="auth-submit"
                disabled={busy}
                className="btn btn-primary btn-lg w-full"
                style={{ marginTop: 8 }}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                    Please wait…
                  </span>
                ) : mode === 'signin' ? 'Continue to dashboard →' : 'Create account →'}
              </button>
            </form>
          </div>

          {/* Mobile demo hint */}
          <div
            className="mt-6 rounded-2xl p-4 text-sm lg:hidden"
            style={{
              background: 'rgba(14,165,233,0.08)',
              border: '1px solid rgba(14,165,233,0.18)',
              color: '#7dd3fc',
            }}
          >
            <p className="font-semibold">⚡ Demo login</p>
            <p className="mt-1" style={{ color: '#94a3b8' }}>
              Email: <code className="text-sky-300">demo@recruitcrm.local</code> · Any password
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
