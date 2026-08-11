'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import { PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';
import ConfirmationModal from '../_components/ConfirmationModal';
import { createJob, deleteJob, listCandidates, listJobs, rankCandidatesForJob, updateJob } from '@/lib/recruitmentData';

const JOB_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
];

const WORK_MODES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'on-site', label: 'On-site' },
];

const STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
};

const initialJob = {
  title: '',
  department: '',
  category: '',
  location: '',
  job_type: 'full-time',
  work_mode: 'on-site',
  description: '',
  requirements: '',
  salary_min: '',
  salary_max: '',
  salary_currency: 'USD',
  show_salary_publicly: false,
  application_deadline: '',
  status: 'draft',
};

const initialFilters = {
  search: '',
  status: 'all',
  category: 'all',
  job_type: 'all',
  work_mode: 'all',
};

function requirementsToText(requirements) {
  return Array.isArray(requirements) ? requirements.join('\n') : '';
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSalary(job) {
  if (!job.show_salary_publicly || (job.salary_min == null && job.salary_max == null)) return 'Salary hidden';
  const currency = job.salary_currency || 'USD';
  if (job.salary_min != null && job.salary_max != null) return `${currency} ${Number(job.salary_min).toLocaleString()} – ${Number(job.salary_max).toLocaleString()}`;
  if (job.salary_min != null) return `From ${currency} ${Number(job.salary_min).toLocaleString()}`;
  return `Up to ${currency} ${Number(job.salary_max).toLocaleString()}`;
}

function statusBadgeClass(status) {
  if (status === 'published') return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
  if (status === 'closed') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialJob);
  const [filters, setFilters] = useState(initialFilters);
  const [message, setMessage] = useState('');
  const [editingJobId, setEditingJobId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [jobToClose, setJobToClose] = useState(null);
  const [rankingJobId, setRankingJobId] = useState(null);
  const [rankingResults, setRankingResults] = useState({});

  const activeFilters = useMemo(() => ({ ...filters, limit: 100 }), [filters]);

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', activeFilters],
    queryFn: () => listJobs(activeFilters),
  });

  const candidatesQuery = useQuery({
    queryKey: ['candidates'],
    queryFn: listCandidates,
  });

  const mutation = useMutation({
    mutationFn: (payload) => createJob(payload),
    onSuccess: (_data, payload) => {
      setForm(initialJob);
      setEditingJobId(null);
      setMessage(payload.status === 'published' ? 'Job published successfully. Public applicants can now apply.' : 'Draft job saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setMessage(error.message || 'Could not create job.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateJob(id, payload),
    onSuccess: (_data, variables) => {
      setForm(initialJob);
      setEditingJobId(null);
      const status = variables.payload.status;
      setMessage(status === 'published' ? 'Job published successfully.' : status === 'closed' ? 'Job closed successfully.' : 'Job updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setMessage(error.message || 'Could not update job.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteJob(id),
    onSuccess: () => {
      setMessage('Job deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setMessage(error.message || 'Could not delete job.'),
  });

  const rankCandidatesMutation = useMutation({
    mutationFn: (jobId) => rankCandidatesForJob(jobId, { limit: 50 }),
    onMutate: (jobId) => {
      setRankingJobId(jobId);
      setMessage('Ranking candidates with production embedding matching…');
    },
    onSuccess: (result, jobId) => {
      setRankingResults((current) => ({ ...current, [jobId]: result.matches || [] }));
      setMessage(`Ranked ${result.matches?.length || 0} candidates for this job.`);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setMessage(error.message || 'Could not rank candidates for this job.'),
    onSettled: () => setRankingJobId(null),
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function buildPayload(statusOverride = null) {
    const salaryMin = form.salary_min === '' ? null : Number(form.salary_min);
    const salaryMax = form.salary_max === '' ? null : Number(form.salary_max);
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
      throw new Error('Minimum salary cannot be greater than maximum salary.');
    }

    return {
      title: form.title,
      department: form.department,
      category: form.category,
      location: form.location,
      job_type: form.job_type,
      work_mode: form.work_mode,
      description: form.description,
      requirements: form.requirements
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: form.salary_currency || 'USD',
      show_salary_publicly: form.show_salary_publicly,
      application_deadline: form.application_deadline || null,
      status: statusOverride || form.status || 'draft',
    };
  }

  function submitJob(statusOverride = null) {
    setMessage('');
    try {
      const payload = buildPayload(statusOverride);
      if (!payload.title || !payload.description) throw new Error('Job title and description are required.');
      if (editingJobId) updateMutation.mutate({ id: editingJobId, payload });
      else mutation.mutate(payload);
    } catch (error) {
      setMessage(error.message || 'Could not save job.');
    }
  }

  function startEdit(job) {
    setEditingJobId(job.id);
    setForm({
      title: job.title || '',
      department: job.department || '',
      category: job.category || job.department || '',
      location: job.location || '',
      job_type: job.job_type || 'full-time',
      work_mode: job.work_mode || 'on-site',
      description: job.description || '',
      requirements: requirementsToText(job.requirements),
      salary_min: job.salary_min ?? '',
      salary_max: job.salary_max ?? '',
      salary_currency: job.salary_currency || 'USD',
      show_salary_publicly: job.show_salary_publicly === true,
      application_deadline: toDateInput(job.application_deadline),
      status: job.status || 'draft',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingJobId(null);
    setForm(initialJob);
    setMessage('');
  }

  const jobs = jobsData?.jobs || [];
  const categories = Array.from(new Set(jobs.map((job) => job.category).filter(Boolean))).sort();

  return (
    <AppShell>
      <div className="mb-8 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Job Management
            </h1>
            <p className="mt-2 text-sm text-[#8b95b0]">
              Create drafts, publish public career roles, close openings, and rank applicants through the existing ATS matching flow.
            </p>
          </div>
          <Link href="/careers" className="btn btn-secondary btn-sm self-start lg:self-auto">
            View public careers site
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] items-start animate-fade-in">
        <SectionCard
          title={editingJobId ? 'Edit Job Opening' : 'Create Job Opening'}
          description="Save as draft until the role is ready, then publish it to the public career site."
        >
          <form onSubmit={(event) => event.preventDefault()} className="grid gap-4">
            <Field label="Job title" value={form.title} onChange={(value) => updateField('title', value)} placeholder="e.g. Senior Frontend Architect" required />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department" value={form.department} onChange={(value) => updateField('department', value)} placeholder="e.g. Engineering" />
              <Field label="Job category" value={form.category} onChange={(value) => updateField('category', value)} placeholder="e.g. Software Engineering" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Employment type" value={form.job_type} onChange={(value) => updateField('job_type', value)} options={JOB_TYPES} />
              <SelectField label="Work mode" value={form.work_mode} onChange={(value) => updateField('work_mode', value)} options={WORK_MODES} />
              <Field label="Location" value={form.location} onChange={(value) => updateField('location', value)} placeholder="e.g. Remote / Jaipur" />
            </div>

            <Field label="Job description" value={form.description} onChange={(value) => updateField('description', value)} placeholder="Describe responsibilities, expectations, and role impact..." textarea rows={7} required />

            <Field label="Key requirements (one per line)" value={form.requirements} onChange={(value) => updateField('requirements', value)} placeholder="React\nNext.js\nSystem Design" textarea rows={4} />

            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Min salary" type="number" value={form.salary_min} onChange={(value) => updateField('salary_min', value)} placeholder="80000" />
              <Field label="Max salary" type="number" value={form.salary_max} onChange={(value) => updateField('salary_max', value)} placeholder="120000" />
              <Field label="Currency" value={form.salary_currency} onChange={(value) => updateField('salary_currency', value.toUpperCase())} placeholder="USD" maxLength={3} />
              <Field label="Deadline" type="date" value={form.application_deadline} onChange={(value) => updateField('application_deadline', value)} />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.show_salary_publicly}
                onChange={(event) => updateField('show_salary_publicly', event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
              />
              Show salary publicly on career cards and job details
            </label>

            {message && (
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300 flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />
                <p>{message}</p>
              </div>
            )}

            <div className="pt-2 flex flex-wrap gap-3">
              <SecondaryButton
                type="button"
                disabled={mutation.isPending || updateMutation.isPending}
                onClick={() => submitJob('draft')}
                className="flex-1 sm:flex-none justify-center"
              >
                {editingJobId ? 'Save as Draft' : 'Save Draft'}
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={mutation.isPending || updateMutation.isPending}
                onClick={() => submitJob('published')}
                className="flex-1 sm:flex-none justify-center"
              >
                {mutation.isPending || updateMutation.isPending ? 'Saving…' : 'Publish Job'}
              </PrimaryButton>
              {editingJobId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-secondary flex-1 sm:flex-none justify-center"
                  style={{ color: '#fff', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Configured Job Openings"
          description="Filter recruiter-visible drafts, published roles, and closed openings."
        >
          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr]">
            <FilterInput label="Search" value={filters.search} onChange={(value) => updateFilter('search', value)} placeholder="Search title, category, location" />
            <FilterSelect label="Status" value={filters.status} onChange={(value) => updateFilter('status', value)} options={[{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'closed', label: 'Closed' }]} />
            <FilterSelect label="Category" value={filters.category} onChange={(value) => updateFilter('category', value)} options={[{ value: 'all', label: 'All categories' }, ...categories.map((category) => ({ value: category, label: category }))]} />
            <FilterSelect label="Type" value={filters.job_type} onChange={(value) => updateFilter('job_type', value)} options={[{ value: 'all', label: 'All types' }, ...JOB_TYPES]} />
            <FilterSelect label="Work mode" value={filters.work_mode} onChange={(value) => updateFilter('work_mode', value)} options={[{ value: 'all', label: 'All modes' }, ...WORK_MODES]} />
          </div>

          {jobsLoading ? (
            <p className="text-sm text-slate-400">Loading jobs…</p>
          ) : jobs.length ? (
            <div className="grid gap-4">
              {jobs.map((job) => {
                const matchedCandidates = (candidatesQuery.data?.candidates || [])
                  .map((candidate) => {
                    const scoreObj = candidate.job_scores?.find((score) => score.job_id === job.id);
                    return scoreObj ? { candidate, score: scoreObj.score } : null;
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.score - a.score);

                const rankedMatches = rankingResults[job.id] || [];

                return (
                  <div key={job.id} className="rounded-2xl border border-white/5 bg-[#080d1a]/50 p-5 hover:bg-white/[0.025] hover:border-white/10 transition-all group">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                            {job.title}
                          </h3>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                            {STATUS_LABELS[job.status] || job.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#8b95b0] font-medium">
                          {job.category || job.department || 'General'} · {job.job_type || 'full-time'} · {job.work_mode || 'on-site'} · {job.location || 'Location flexible'}
                        </p>
                      </div>

                      {job.status === 'published' && job.public_url && (
                        <Link href={job.public_url} className="btn btn-secondary btn-xs self-start sm:self-auto">
                          Public link
                        </Link>
                      )}
                    </div>

                    <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-300 font-normal">
                      {job.description}
                    </p>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <MetaPill label="Salary" value={formatSalary(job)} />
                      <MetaPill label="Deadline" value={formatDate(job.application_deadline)} />
                      <MetaPill label="Published" value={job.published_at ? formatDate(job.published_at) : 'Not published'} />
                    </div>

                    {job.requirements?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                        {job.requirements.map((item) => (
                          <span key={item} className="rounded px-2.5 py-0.5 text-[10px] font-bold bg-white/5 border border-white/5 text-[#8b95b0]">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                      <button type="button" onClick={() => rankCandidatesMutation.mutate(job.id)} disabled={rankingJobId === job.id} className="btn btn-primary btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5">
                        {rankingJobId === job.id ? 'Ranking Candidates…' : 'Rank Candidates'}
                      </button>
                      {job.status !== 'published' && (
                        <button type="button" onClick={() => updateMutation.mutate({ id: job.id, payload: { status: 'published' } })} className="btn btn-secondary btn-xs font-semibold px-3 py-1.5">
                          Reopen / Publish
                        </button>
                      )}
                      {job.status === 'published' && (
                        <button type="button" onClick={() => setJobToClose(job)} className="btn btn-secondary btn-xs font-semibold px-3 py-1.5">
                          Close Job
                        </button>
                      )}
                    </div>

                    {rankedMatches.length > 0 && (
                      <CandidateMatches title={`Embedding Ranked Candidates (${rankedMatches.length})`} matches={rankedMatches.slice(0, 5)} />
                    )}

                    {matchedCandidates.length > 0 && (
                      <div className="mt-4 border-t border-white/5 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Saved Matches ({matchedCandidates.length})
                        </p>
                        <div className="space-y-1.5">
                          {matchedCandidates.slice(0, 3).map(({ candidate, score }) => (
                            <div key={candidate.id} className="flex items-center justify-between text-xs bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                              <Link href={`/candidates/${candidate.id}`} className="font-semibold text-slate-300 hover:text-indigo-400 truncate max-w-[200px]">
                                {candidate.full_name}
                              </Link>
                              <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-400/20">
                                {score}% Match
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-end gap-3 border-t border-white/5 pt-3">
                      <button onClick={() => startEdit(job)} className="btn btn-secondary btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5">
                        Edit Details
                      </button>
                      <button
                        onClick={() => {
                          setJobToDelete(job);
                          setIsDeleteModalOpen(true);
                        }}
                        className="btn btn-ghost hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No jobs found" detail="Create a draft or adjust filters to manage existing job openings." />
          )}
        </SectionCard>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setJobToDelete(null);
        }}
        onConfirm={() => {
          if (jobToDelete) deleteMutation.mutate(jobToDelete.id);
          setIsDeleteModalOpen(false);
          setJobToDelete(null);
        }}
        title="Delete Job Opening"
        message={`Are you sure you want to delete the job opening "${jobToDelete?.title || 'this role'}"? This permanently removes the role and associated match/application links according to database rules.`}
        confirmText="Delete permanently"
        isPending={deleteMutation.isPending}
      />

      <ConfirmationModal
        isOpen={Boolean(jobToClose)}
        onClose={() => setJobToClose(null)}
        onConfirm={() => {
          if (jobToClose) updateMutation.mutate({ id: jobToClose.id, payload: { status: 'closed' } });
          setJobToClose(null);
        }}
        title="Close Job Opening"
        message={`Close "${jobToClose?.title || 'this role'}"? Closed jobs are removed from public listings and cannot accept new applications.`}
        confirmText="Close job"
        isPending={updateMutation.isPending}
      />
    </AppShell>
  );
}

function Field({ label, value, onChange, placeholder = '', textarea = false, rows = 4, type = 'text', required = false, maxLength }) {
  const inputStyle = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:bg-white/[0.07] focus:shadow-md transition-all';
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#8b95b0] uppercase tracking-wider">{label}</span>
      {textarea ? (
        <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputStyle} required={required} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputStyle} required={required} maxLength={maxLength} />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#8b95b0] uppercase tracking-wider">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/50 focus:bg-[#111827] focus:shadow-md transition-all">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-indigo-400/50" />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white focus:border-indigo-400/50">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function MetaPill({ label, value }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-300">{value}</p>
    </div>
  );
}

function CandidateMatches({ title, matches }) {
  return (
    <div className="mt-4 border-t border-cyan-500/10 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-2">{title}</p>
      <div className="space-y-1.5">
        {matches.map((match, index) => (
          <div key={match.candidate?.id || match.score?.candidate_id} className="flex items-center justify-between gap-3 text-xs bg-cyan-500/[0.03] hover:bg-cyan-500/[0.06] border border-cyan-500/10 rounded-xl px-3 py-2">
            <Link href={`/candidates/${match.candidate?.id || match.score?.candidate_id}`} className="font-semibold text-slate-300 hover:text-cyan-300 truncate max-w-[220px]">
              #{index + 1} {match.candidate?.full_name || 'Candidate'}
            </Link>
            <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-400/20">
              {match.score?.score ?? Math.round((match.similarity || 0) * 100)}% Match
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
