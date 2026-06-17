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
      setMessage('Job description created successfully. You can now score candidates against it.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error.message || 'Could not create job description'),
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
      {/* Page Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Job Openings
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0]">
          Manage and configure role descriptions to match candidates with AI alignment scores.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] items-start animate-fade-in">
        {/* Create job card */}
        <SectionCard 
          title="Create Job Requirement" 
          description="Create role metrics to unlock candidate matching assessments."
        >
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field 
              label="Role Title" 
              value={form.title} 
              onChange={(value) => updateField('title', value)} 
              placeholder="e.g. Senior Frontend Architect" 
            />
            
            <div className="grid gap-4 sm:grid-cols-2">
              <Field 
                label="Department" 
                value={form.department} 
                onChange={(value) => updateField('department', value)} 
                placeholder="e.g. Engineering" 
              />
              <Field 
                label="Location" 
                value={form.location} 
                onChange={(value) => updateField('location', value)} 
                placeholder="e.g. Remote / Jaipur" 
              />
            </div>

            <Field 
              label="Role Description" 
              value={form.description} 
              onChange={(value) => updateField('description', value)} 
              placeholder="Provide a description of job responsibilities and expectations..." 
              textarea 
              rows={6} 
            />

            <Field 
              label="Key Requirements (One per line)" 
              value={form.requirements} 
              onChange={(value) => updateField('requirements', value)} 
              placeholder="React&#10;Next.js&#10;System Design" 
              textarea 
              rows={4} 
            />

            {message && (
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300 flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />
                <p>{message}</p>
              </div>
            )}

            <div className="pt-2">
              <PrimaryButton 
                type="submit" 
                disabled={mutation.isPending} 
                className="w-full sm:w-auto"
              >
                {mutation.isPending ? 'Creating Role…' : 'Create Job Requirement'}
              </PrimaryButton>
            </div>
          </form>
        </SectionCard>

        {/* Jobs list card */}
        <SectionCard 
          title="Configured Job Openings" 
          description="Ready for candidate alignment matching scores."
        >
          {jobs.length ? (
            <div className="grid gap-4">
              {jobs.map((job) => (
                <div 
                  key={job.id} 
                  className="rounded-2xl border border-white/5 bg-[#080d1a]/50 p-5 hover:bg-white/[0.025] hover:border-white/10 transition-all group"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {job.title}
                      </h3>
                      <p className="mt-1 text-xs text-[#8b95b0] font-medium">
                        {job.department || 'General'} · {job.location || 'Remote'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border border-cyan-400/20 bg-cyan-400/5 text-cyan-200 self-start sm:self-auto">
                      <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                      Ready for AI Matching
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-slate-300 font-normal">
                    {job.description}
                  </p>

                  {job.requirements?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                      {job.requirements.map((item) => (
                        <span 
                          key={item} 
                          className="rounded px-2.5 py-0.5 text-[10px] font-bold bg-white/5 border border-white/5 text-[#8b95b0]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState 
              title="No jobs configured" 
              detail="Create a job configuration on the left to activate AI applicant matching scores." 
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, placeholder, textarea = false, rows = 4 }) {
  const inputStyle = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:bg-white/[0.07] focus:shadow-md transition-all';
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#8b95b0] uppercase tracking-wider">{label}</span>
      {textarea ? (
        <textarea 
          rows={rows} 
          value={value} 
          onChange={(event) => onChange(event.target.value)} 
          placeholder={placeholder} 
          className={inputStyle} 
          required 
        />
      ) : (
        <input 
          value={value} 
          onChange={(event) => onChange(event.target.value)} 
          placeholder={placeholder} 
          className={inputStyle} 
          required 
        />
      )}
    </label>
  );
}
