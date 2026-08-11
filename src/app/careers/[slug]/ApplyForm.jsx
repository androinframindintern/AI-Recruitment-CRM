'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitPublicApplication } from '@/lib/recruitmentData';

const ACCEPTED_TYPES = ['.pdf', '.doc', '.docx', '.txt'];

export default function ApplyForm({ slug, canApply }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', cover_letter: '' });
  const [resume, setResume] = useState(null);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!canApply) throw new Error('This job is not accepting applications.');
      if (!form.full_name.trim()) throw new Error('Full name is required.');
      if (!form.email.trim()) throw new Error('Email is required.');
      if (!resume) throw new Error('Resume file is required.');
      if (resume.size > 8 * 1024 * 1024) throw new Error('Resume must be 8 MB or smaller.');

      const data = new FormData();
      data.set('full_name', form.full_name.trim());
      data.set('email', form.email.trim());
      data.set('phone', form.phone.trim());
      data.set('cover_letter', form.cover_letter.trim());
      data.set('resume', resume);
      return submitPublicApplication(slug, data);
    },
    onSuccess: (result) => {
      setMessage(result.message || 'Application submitted successfully.');
      setForm({ full_name: '', email: '', phone: '', cover_letter: '' });
      setResume(null);
      const input = document.getElementById('resume');
      if (input) input.value = '';
    },
    onError: (error) => setMessage(error.message || 'Could not submit application.'),
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section id="apply" className="rounded-3xl border border-white/10 bg-[#080d1a]/80 p-6 shadow-2xl shadow-black/20">
      <h2 className="text-2xl font-extrabold text-white">Apply now</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Your resume is submitted privately into the existing ATS pipeline for recruiter review.
      </p>

      {!canApply ? (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          This job is no longer accepting applications.
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            mutation.mutate();
          }}
          className="mt-6 grid gap-4"
        >
          <Field label="Full name" value={form.full_name} onChange={(value) => updateField('full_name', value)} required />
          <Field label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} required />
          <Field label="Phone" value={form.phone} onChange={(value) => updateField('phone', value)} />
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Resume</span>
            <input
              id="resume"
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(event) => setResume(event.target.files?.[0] || null)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-indigo-400"
              required
            />
            <span className="mt-1 block text-[11px] text-slate-500">PDF, DOC, DOCX, or TXT. Maximum 8 MB.</span>
          </label>
          <Field label="Cover letter" value={form.cover_letter} onChange={(value) => updateField('cover_letter', value)} textarea rows={5} />

          {message && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
              {message}
            </div>
          )}

          <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-lg justify-center font-bold">
            {mutation.isPending ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', textarea = false, rows = 4, required = false }) {
  const className = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.07]';
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={className} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={className} required={required} />
      )}
    </label>
  );
}
