'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { apiGet, apiPost } from '@/lib/api';
import { PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';

export default function LoginPage() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('demo@recruitcrm.local');
  const [password, setPassword] = useState('demo1234');
  const [fullName, setFullName] = useState('Demo Recruiter');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (email === 'demo@recruitcrm.local') {
        router.push('/dashboard');
        return;
      }

      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role: 'recruiter' } },
        });
        if (signUpError) throw signUpError;
      }

      await apiGet('/api/me', { auth: true }).catch(() => null);
      router.push('/dashboard');
    } catch (caught) {
      if (mode === 'signin') {
        const exists = await apiPost('/api/me/check-email', { email }, { auth: false }).catch(() => ({ exists: true }));
        setError(exists.exists ? 'Incorrect password. Please try again.' : 'This email is not registered yet.');
      } else {
        setError(caught?.message || 'Authentication failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[36px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-slate-950/20 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Recruitment command center</p>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight">Launch your hiring demo in minutes.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Use the built-in demo login immediately, then connect Supabase auth later when you want real recruiter accounts.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ['Upload resumes', 'PDF and DOCX parsing with AI structure extraction.'],
              ['Rank instantly', 'Score candidates against jobs with an explainable match result.'],
              ['Automate follow-up', 'Schedule interviews and send recruiter emails from one place.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[36px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/20 sm:p-10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{mode === 'signin' ? 'Sign in' : 'Create account'}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Create recruiter access'}</h2>
            </div>
            <SecondaryButton type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
            </SecondaryButton>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === 'signup' ? (
              <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Jane Recruiter" />
            ) : null}
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
            <PrimaryButton type="submit" disabled={busy} className="w-full py-3">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Continue to dashboard' : 'Create recruiter account'}
            </PrimaryButton>
          </form>

          <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
            <p className="font-semibold">Quick demo login</p>
            <p className="mt-2">Email: demo@recruitcrm.local</p>
            <p>Password: any value</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
        required
      />
    </label>
  );
}
