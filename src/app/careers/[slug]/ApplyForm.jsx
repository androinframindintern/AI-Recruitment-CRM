'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitPublicApplication } from '@/lib/recruitmentData';

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['.pdf', '.docx'];
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const INITIAL_FORM = {
  full_name: '',
  email: '',
  phone: '',
  cover_letter: '',
  linkedin_url: '',
  portfolio_url: '',
  website_url: '',
};

export default function ApplyForm({ slug, canApply }) {
  const resumeInputRef = useRef(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      const validationErrors = validateApplication(form, resume, canApply);
      if (Object.keys(validationErrors).length) {
        const error = new Error('Please check the highlighted fields and try again.');
        error.validationErrors = validationErrors;
        throw error;
      }

      const data = new FormData();
      data.set('full_name', form.full_name.trim());
      data.set('email', form.email.trim());
      data.set('phone', form.phone.trim());
      data.set('cover_letter', form.cover_letter.trim());
      data.set('linkedin_url', form.linkedin_url.trim());
      data.set('portfolio_url', form.portfolio_url.trim());
      data.set('website_url', form.website_url.trim());
      data.set('resume', resume);
      return submitPublicApplication(slug, data);
    },
    onSuccess: () => {
      setMessage('');
      setErrors({});
      setSubmitted(true);
      setForm(INITIAL_FORM);
      setResume(null);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    },
    onError: (error) => {
      if (error.validationErrors) {
        setErrors(error.validationErrors);
        setMessage(error.message);
        return;
      }
      setMessage(friendlyApplicationError(error));
    },
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function handleResumeChange(file) {
    setErrors((current) => ({ ...current, resume: '' }));
    setMessage('');

    if (!file) {
      setResume(null);
      return;
    }

    const fileError = validateResumeFile(file);
    if (fileError) {
      setResume(null);
      setErrors((current) => ({ ...current, resume: fileError }));
      if (resumeInputRef.current) resumeInputRef.current.value = '';
      return;
    }

    setResume(file);
  }

  function removeResume() {
    setResume(null);
    setErrors((current) => ({ ...current, resume: '' }));
    if (resumeInputRef.current) resumeInputRef.current.value = '';
  }

  const isPending = mutation.isPending;
  const fieldDisabled = isPending || submitted;

  return (
    <section id="apply" className="rounded-3xl border border-white/10 bg-[#080d1a]/80 p-6 shadow-2xl shadow-black/20">
      <h2 className="text-2xl font-extrabold text-white">Apply now</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Your resume is submitted privately into the existing ATS pipeline for recruiter review.
      </p>

      {!canApply ? (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100" role="status">
          This job is no longer accepting applications.
        </div>
      ) : submitted ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5" role="status">
          <h3 className="text-lg font-extrabold text-emerald-100">Application Submitted Successfully</h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/80">
            Thank you for applying. Your resume and application details were received securely for recruiter review.
          </p>
          <Link href="/careers" className="btn btn-secondary mt-4 w-full justify-center font-bold sm:w-auto">
            Back to Careers
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            mutation.mutate();
          }}
          className="mt-6 grid gap-4"
          aria-busy={isPending}
          noValidate
        >
          <Field label="Full name" value={form.full_name} onChange={(value) => updateField('full_name', value)} error={errors.full_name} disabled={fieldDisabled} required />
          <Field label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} error={errors.email} disabled={fieldDisabled} required />
          <Field label="Phone" type="tel" value={form.phone} onChange={(value) => updateField('phone', value)} error={errors.phone} disabled={fieldDisabled} required />
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Resume <span className="text-rose-300">*</span></span>
            <input
              ref={resumeInputRef}
              id="resume"
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(event) => handleResumeChange(event.target.files?.[0] || null)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={fieldDisabled}
              aria-invalid={Boolean(errors.resume)}
              aria-describedby="resume-help resume-error"
              required
            />
            <span id="resume-help" className="mt-1 block text-[11px] text-slate-500">PDF or DOCX only. Maximum 8 MB.</span>
            {resume && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{resume.name}</span>
                  <span className="block text-xs text-slate-500">{formatFileSize(resume.size)}</span>
                </span>
                <button type="button" onClick={removeResume} disabled={fieldDisabled} className="btn btn-secondary btn-xs flex-shrink-0">
                  Remove
                </button>
              </div>
            )}
            {errors.resume && <span id="resume-error" className="mt-2 block text-xs text-rose-300">{errors.resume}</span>}
          </label>
          <Field label="Cover letter" value={form.cover_letter} onChange={(value) => updateField('cover_letter', value)} error={errors.cover_letter} disabled={fieldDisabled} textarea rows={5} />
          <Field label="LinkedIn URL" type="url" value={form.linkedin_url} onChange={(value) => updateField('linkedin_url', value)} error={errors.linkedin_url} disabled={fieldDisabled} placeholder="https://www.linkedin.com/in/your-profile" />
          <Field label="Portfolio URL" type="url" value={form.portfolio_url} onChange={(value) => updateField('portfolio_url', value)} error={errors.portfolio_url} disabled={fieldDisabled} placeholder="https://portfolio.example.com" />
          <Field label="Website URL" type="url" value={form.website_url} onChange={(value) => updateField('website_url', value)} error={errors.website_url} disabled={fieldDisabled} placeholder="https://example.com" />

          {isPending && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-sm text-indigo-100" role="status">
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" />
              </div>
              Uploading your resume securely. Please do not close this page.
            </div>
          )}

          {message && !isPending && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100" role="alert">
              {message}
            </div>
          )}

          <button type="submit" disabled={isPending} className="btn btn-primary btn-lg justify-center font-bold">
            {isPending ? 'Submitting application…' : 'Submit application'}
          </button>
        </form>
      )}
    </section>
  );
}

function validateApplication(form, resume, canApply) {
  const errors = {};
  if (!canApply) errors.form = 'This job is no longer accepting applications.';
  if (form.full_name.trim().length < 2) errors.full_name = 'Full name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.phone.trim().length < 7) errors.phone = 'Phone number is required.';
  if (form.cover_letter.trim().length > 5000) errors.cover_letter = 'Cover letter must be 5,000 characters or fewer.';

  validateOptionalUrl(form.linkedin_url, 'linkedin_url', 'LinkedIn URL', errors);
  validateOptionalUrl(form.portfolio_url, 'portfolio_url', 'Portfolio URL', errors);
  validateOptionalUrl(form.website_url, 'website_url', 'Website URL', errors);

  const resumeError = validateResumeFile(resume);
  if (resumeError) errors.resume = resumeError;
  return errors;
}

function validateOptionalUrl(value, field, label, errors) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (trimmed.length > 2048) {
    errors[field] = `${label} must be 2,048 characters or fewer.`;
    return;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors[field] = `${label} must start with http:// or https://.`;
    }
  } catch {
    errors[field] = `${label} must start with http:// or https://.`;
  }
}

function validateResumeFile(file) {
  if (!file) return 'Resume file is required.';
  if (file.size > MAX_RESUME_BYTES) return 'Resume file must be 8 MB or smaller.';

  const extension = file.name.toLowerCase().split('.').pop();
  if (!['pdf', 'docx'].includes(extension)) return 'Resume must be a PDF or DOCX file.';
  if (file.type && !ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) return 'Resume must be a PDF or DOCX file.';
  return '';
}

function friendlyApplicationError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('already applied')) return 'You have already applied for this position.';
  if (message.includes('no longer accepting') || message.includes('not accepting')) return 'This job is no longer accepting applications.';
  if (message.includes('8 mb')) return 'Resume file must be 8 MB or smaller.';
  if (message.includes('pdf') || message.includes('docx')) return 'Resume must be a PDF or DOCX file.';
  if (message.includes('readable text') || message.includes('extract')) return 'We could not read this resume. Please upload a valid PDF or DOCX file.';
  if (message.includes('application fields')) return 'Please check the application fields and try again.';
  return 'Could not submit application. Please check your details and try again.';
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Field({ label, value, onChange, type = 'text', textarea = false, rows = 4, required = false, disabled = false, error = '', placeholder = '' }) {
  const className = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label} {required && <span className="text-rose-300">*</span>}
      </span>
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={className} disabled={disabled} aria-invalid={Boolean(error)} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={className} required={required} disabled={disabled} placeholder={placeholder} aria-invalid={Boolean(error)} />
      )}
      {error && <span className="mt-2 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}
