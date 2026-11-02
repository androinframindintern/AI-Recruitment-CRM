
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  supabase,
  isSupabaseConfigured,
} from '@/lib/supabaseClient';

import { getCurrentProfile } from '@/lib/recruitmentData';

const ACCOUNT_TYPES = [
  {
    value: 'candidate',
    title: 'Normal user / job seeker',
    detail: 'View public jobs and apply only.',
  },
  {
    value: 'recruiter',
    title: 'Company / hiring account',
    detail: 'Manage jobs, candidates, interviews, and CRM workflows.',
  },
];

const FEATURES = [
  'Manage your recruitment activities',
  'Track applications and candidates',
  'Access your personalized dashboard',
];

function normalizeRole(role) {
  return ['admin', 'recruiter', 'candidate'].includes(role)
    ? role
    : 'candidate';
}

function dashboardPathForRole(role) {
  return normalizeRole(role) === 'candidate'
    ? '/careers'
    : '/dashboard';
}

function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}) {
  return (
    <div>
      <label htmlFor={id} className="form-label block mb-2">
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl px-4 py-3 outline-none transition-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: '#fff',
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('demo@recruitcrm.local');
  const [password, setPassword] = useState('demo1234');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState('candidate');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Simulated console diagnostics only.
  // These logs do not make real API or database requests.
  useEffect(() => {
    let active = true;
    let retryCount = 0;
    let timer;

    const showDiagnostics = () => {
      if (!active) return;

      retryCount++;

      console.groupCollapsed(
        `%c[SIMULATED BACKEND DIAGNOSTICS] #${retryCount}`,
        'color: #ef4444; font-weight: bold;'
      );

      console.error('[SIMULATED AUTH WARNING]', {
        endpoint: '/api/auth/login',
        status: 503,
        message: 'Simulated authentication service warning',
        retry: retryCount,
      });

      console.error(
        '[SIMULATED DATABASE WARNING] Connection diagnostic warning.'
      );

      console.warn(
        '[SIMULATED API GATEWAY] Upstream service diagnostic warning.'
      );

      console.groupEnd();

      timer = setTimeout(showDiagnostics, 3000);
    };

    timer = setTimeout(showDiagnostics, 2000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError('');
    setSuccess('');
    setBusy(true);

    try {
      if (!isSupabaseConfigured()) {
        throw new Error(
          'Supabase is not configured. Please check your environment variables.'
        );
      }

      if (mode === 'signin') {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) throw signInError;
      } else {
        const signupRole =
          accountType === 'recruiter'
            ? 'recruiter'
            : 'candidate';

        const { data, error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                role: signupRole,
              },
            },
          });

        if (signUpError) throw signUpError;

        if (!data.session) {
          setSuccess(
            'Account created successfully. Please check your email to verify your account before signing in.'
          );
          return;
        }
      }

      const profile = await getCurrentProfile().catch(() => null);

      router.push(
        dashboardPathForRole(profile?.role)
      );
    } catch (caught) {
      console.error('[AUTHENTICATION ERROR]', caught);

      setError(
        caught?.message ||
          (mode === 'signin'
            ? 'Could not sign in. Please check your email and password.'
            : 'Could not create your account. Please try again.')
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setSuccess('');
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.18), transparent)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-bold text-white"
          >
            <span
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 42,
                height: 42,
                background: 'rgba(99,102,241,0.18)',
                color: '#a5b4fc',
              }}
            >
              R
            </span>
            RecruitCRM
          </Link>

          <p
            className="mt-3 text-sm"
            style={{ color: '#64748b' }}
          >
            Your recruitment workspace
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-7 sm:p-9">

          <div className="text-center mb-7">
            <h1 className="text-3xl font-extrabold text-white">
              {mode === 'signin'
                ? 'Welcome Back'
                : 'Create Account'}
            </h1>

            <p
              className="mt-2 text-sm"
              style={{ color: '#64748b' }}
            >
              {mode === 'signin'
                ? 'Sign in to your account'
                : 'Choose a normal user or company account'}
            </p>
          </div>

          {/* Mode Switch */}
          <div
            className="grid grid-cols-2 gap-2 rounded-xl p-1 mb-7"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="rounded-lg py-2.5 text-sm font-semibold transition-all"
              style={{
                background:
                  mode === 'signin'
                    ? 'rgba(99,102,241,0.22)'
                    : 'transparent',
                color: mode === 'signin' ? '#c7d2fe' : '#64748b',
              }}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="rounded-lg py-2.5 text-sm font-semibold transition-all"
              style={{
                background:
                  mode === 'signup'
                    ? 'rgba(99,102,241,0.22)'
                    : 'transparent',
                color: mode === 'signup' ? '#c7d2fe' : '#64748b',
              }}
            >
              Sign Up
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div
              className="rounded-xl p-3 mb-5 text-sm"
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="rounded-xl p-3 mb-5 text-sm"
              style={{
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.25)',
                color: '#86efac',
              }}
            >
              {success}
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            id="auth-form"
          >
            {mode === 'signup' && (
              <>
                <FormField
                  id="full-name"
                  label="Full name"
                  value={fullName}
                  onChange={setFullName}
                  placeholder={
                    accountType === 'recruiter'
                      ? 'Jane Recruiter'
                      : 'Alex Applicant'
                  }
                  autoComplete="name"
                />

                <div>
                  <p className="form-label mb-3">
                    Account type
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {ACCOUNT_TYPES.map((type) => {
                      const active =
                        accountType === type.value;

                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() =>
                            setAccountType(type.value)
                          }
                          className="rounded-2xl p-4 text-left transition-all"
                          style={{
                            background: active
                              ? 'rgba(99,102,241,0.16)'
                              : 'rgba(255,255,255,0.035)',
                            border: active
                              ? '1px solid rgba(129,140,248,0.55)'
                              : '1px solid rgba(255,255,255,0.08)',
                            color: active ? '#c7d2fe' : '#94a3b8',
                          }}
                        >
                          <span className="block text-sm font-semibold text-white">
                            {type.title}
                          </span>

                          <span
                            className="mt-1 block text-xs leading-5"
                            style={{
                              color: active ? '#a5b4fc' : '#64748b',
                            }}
                          >
                            {type.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <FormField
              id="email"
              label="Email address"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />

            <FormField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              type="password"
              autoComplete={
                mode === 'signin'
                  ? 'current-password'
                  : 'new-password'
              }
            />

            {mode === 'signin' && (
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm transition-colors"
                  style={{ color: '#a5b4fc' }}
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                  Please wait…
                </>
              ) : mode === 'signin' ? (
                'Continue →'
              ) : (
                'Create account →'
              )}
            </button>
          </form>

          {/* Features */}
          <div
            className="mt-7 pt-6"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{ color: '#64748b' }}
            >
              Your workspace includes
            </p>

            <div className="space-y-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-3 text-sm"
                  style={{ color: '#94a3b8' }}
                >
                  <span style={{ color: '#818cf8' }}>✓</span>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: '#475569' }}
        >
          By continuing, you agree to use RecruitCRM responsibly.
        </p>
      </div>
    </main>
  );
}
