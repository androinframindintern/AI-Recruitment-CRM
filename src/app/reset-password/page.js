'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { apiPost } from '@/lib/api';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/auth/reset', { email }, { auth: false });
      setSent(true);
    } catch {
      // Still show success to prevent enumeration
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.18), transparent)',
        }}
      />

      <div className="w-full max-w-md relative z-10">
        <div className="glass-card p-8 sm:p-10">
          {/* Logo */}
          <Link href="/login" className="flex items-center gap-3 mb-8">
            <div
              className="flex items-center justify-center rounded-xl text-white font-bold text-sm"
              style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #6366f1, #0ea5e9)' }}
            >
              AI
            </div>
            <span className="text-sm font-semibold" style={{ color: '#818cf8' }}>
              AI Recruitment CRM
            </span>
          </Link>

          {sent ? (
            /* Success state */
            <div className="text-center py-6">
              <div
                className="mx-auto flex items-center justify-center rounded-full mb-5"
                style={{ width: 64, height: 64, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">Check your inbox</h1>
              <p className="mt-3 text-sm" style={{ color: '#64748b' }}>
                If that email is registered, you&apos;ll receive a password reset link shortly.
              </p>
              <Link href="/login" className="btn btn-secondary btn-sm mt-6 inline-flex">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">Reset your password</h1>
              <p className="mt-2 text-sm" style={{ color: '#64748b' }}>
                Enter your account email and we&apos;ll send a reset link.
              </p>

              <form onSubmit={handleRequest} className="mt-7 space-y-4" id="reset-form">
                <div>
                  <label htmlFor="reset-email" className="form-label">Email address</label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="form-input"
                  />
                </div>

                {error && (
                  <div className="alert alert-error text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  id="reset-submit"
                  disabled={busy || !email}
                  className="btn btn-primary w-full"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                      Sending…
                    </span>
                  ) : 'Send reset link'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm" style={{ color: '#818cf8' }}>
                  ← Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
