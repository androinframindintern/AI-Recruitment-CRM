'use client';

import { useEffect, useState } from 'react';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';

function defaultForm(preview) {
  return {
    recipientEmail: preview?.recipientEmail || '',
    subject: preview?.subject || '',
    body: preview?.body || '',
  };
}

export default function EmailPreviewModal({
  isOpen,
  typeLabel = 'Email',
  preview,
  isPending = false,
  onClose,
  onSend,
}) {
  const [form, setForm] = useState(() => defaultForm(preview));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => {
      setForm(defaultForm(preview));
      setError('');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, preview]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isPending) onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  function updateField(field, value) {
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.recipientEmail.trim()) return setError('Recipient email is required.');
    if (!/^\S+@\S+\.\S+$/.test(form.recipientEmail.trim())) return setError('Enter a valid recipient email.');
    if (!form.subject.trim()) return setError('Subject is required.');
    if (!form.body.trim()) return setError('Body is required.');
    try {
      await onSend?.({
        to: form.recipientEmail.trim(),
        subject: form.subject.trim(),
        body: form.body.trim(),
      });
    } catch (caught) {
      setError(caught?.message || 'Could not send email.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in"
      onClick={() => !isPending && onClose?.()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#080d1a] border border-white/10 rounded-2xl p-6 shadow-2xl animate-scale-in relative"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-indigo-500 to-cyan-500" />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Preview {typeLabel}</h3>
            <p className="mt-1 text-sm text-slate-400">
              Review and edit the message before sending it through SMTP.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>Close</button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="form-label mb-1.5 block">Recipient</label>
            <input
              className="form-input w-full"
              type="email"
              value={form.recipientEmail}
              onChange={(event) => updateField('recipientEmail', event.target.value)}
              placeholder="candidate@example.com"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="form-label mb-1.5 block">Subject</label>
            <input
              className="form-input w-full"
              value={form.subject}
              onChange={(event) => updateField('subject', event.target.value)}
              placeholder="Email subject"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="form-label mb-1.5 block">Body</label>
            <textarea
              className="form-input w-full min-h-72"
              rows={12}
              value={form.body}
              onChange={(event) => updateField('body', event.target.value)}
              placeholder="Email body"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <SecondaryButton type="button" disabled={isPending} onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending || !form.recipientEmail.trim() || !form.subject.trim() || !form.body.trim()}>
            {isPending ? 'Sending…' : 'Send Email'}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
