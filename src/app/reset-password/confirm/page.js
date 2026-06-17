'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

function PasswordField({ id, label, value, onChange, placeholder, show, onToggleShow }) {
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          autoComplete="new-password"
          className="form-input"
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={onToggleShow}
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
      </div>
    </div>
  );
}

export default function ResetPasswordConfirmPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Supabase sets the recovery session automatically when the page mounts with recovery hash tokens.
  // We can check if a session exists to verify the link was valid.
  useEffect(() => {
    if (isSupabaseConfigured()) {
      supabase.auth.getSession().then(({ data }) => {
        if (!data?.session) {
          // If no session exists, the recovery token might be missing or expired, but we let them try anyway,
          // or we can display a subtle warning if they land here with no hash parameters.
          const hasHash = window.location.hash || window.location.search.includes('code=');
          if (!hasHash) {
            setError('No reset session detected. Ensure you used the link from your email.');
          }
        }
      });
    }
  }, []);

  async function handleResetSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setBusy(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }

    try {
      if (!isSupabaseConfigured()) {
        // Demo Mode Fallback
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setSuccess(true);
      } else {
        // Real Supabase Auth Update
        const { error: updateError } = await supabase.auth.updateUser({
          password: password,
        });
        if (updateError) throw updateError;
        setSuccess(true);
      }
    } catch (caught) {
      setError(caught?.message || 'Failed to update password. Try requesting a new reset link.');
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

          {success ? (
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
              <h1 className="text-xl font-bold text-white">Password updated!</h1>
              <p className="mt-3 text-sm" style={{ color: '#64748b' }}>
                Your password has been successfully reset. You can now log in using your new password.
              </p>
              <Link href="/login" className="btn btn-primary btn-sm mt-6 inline-flex w-full">
                Continue to sign in →
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
              <p className="mt-2 text-sm" style={{ color: '#64748b' }}>
                Enter your new security credentials below.
              </p>

              <form onSubmit={handleResetSubmit} className="mt-7 space-y-4" id="reset-confirm-form">
                <PasswordField
                  id="password"
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  show={showPassword}
                  onToggleShow={() => setShowPassword(!showPassword)}
                />

                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="••••••••"
                  show={showConfirmPassword}
                  onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
                />

                {error && (
                  <div className="alert alert-error text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  id="reset-confirm-submit"
                  disabled={busy || !password || !confirmPassword}
                  className="btn btn-primary w-full"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                      Updating…
                    </span>
                  ) : 'Reset Password'}
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
