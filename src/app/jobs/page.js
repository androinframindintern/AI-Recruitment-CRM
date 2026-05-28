'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import { PrimaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';
import { apiGet, apiPost } from '@/lib/api';

const initialJob = {
  title: '',
  department: '',
  location: '',
  description: '',
  requirements: '',
};

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialJob);
  const [message, setMessage] = useState('');
  const { data } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiGet('/api/jobs', { auth: true }),
  });

  const mutation = useMutation({
    mutationFn: (payload) => apiPost('/api/jobs', payload, { auth: true }),
    onSuccess: () => {
      setForm(initialJob);
      setMessage('Job created successfully. You can now score candidates against it.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error.message || 'Could not create job'),
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    mutation.mutate({
      ...form,
      requirements: form.requirements
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  const jobs = data?.jobs || [];

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Create job description" description="This role becomes available for AI candidate scoring and recruiter workflows.">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field label="Role title" value={form.title} onChange={(value) => updateField('title', value)} placeholder="Senior Frontend Engineer" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department" value={form.department} onChange={(value) => updateField('department', value)} placeholder="Engineering" />
              <Field label="Location" value={form.location} onChange={(value) => updateField('location', value)} placeholder="Remote / Jaipur" />
            </div>
            <Field label="Job description" value={form.description} onChange={(value) => updateField('description', value)} placeholder="Paste the role description, responsibilities, and expectations." textarea rows={8} />
            <Field label="Key requirements" value={form.requirements} onChange={(value) => updateField('requirements', value)} placeholder="React\nNext.js\nSystem design" textarea rows={6} />
            {message ? <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">{message}</p> : null}
            <PrimaryButton type="submit" disabled={mutation.isPending} className="justify-self-start">
              {mutation.isPending ? 'Saving…' : 'Create job'}
            </PrimaryButton>
          </form>
        </SectionCard>

        <SectionCard title="Open roles" description="Use these job descriptions when ranking candidates.">
          {jobs.length ? (
            <div className="grid gap-3">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{job.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">{job.department || 'General'} {job.location ? `· ${job.location}` : ''}</p>
                    </div>
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">Ready for AI score</span>
                  </div>
                  <p className="mt-3 line-clamp-5 text-sm leading-6 text-slate-300">{job.description}</p>
                  {job.requirements?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.requirements.map((item) => (
                        <span key={item} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{item}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No jobs yet" detail="Create the first role so candidates can be ranked against it." />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, placeholder, textarea = false, rows = 4 }) {
  const shared = 'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500';
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      {textarea ? (
        <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={shared} required />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={shared} required />
      )}
    </label>
  );
}
