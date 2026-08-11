'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { listPublicJobs } from '@/lib/recruitmentData';

const JOB_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
];

const WORK_MODES = [
  { value: 'all', label: 'All modes' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'on-site', label: 'On-site' },
];

const initialFilters = {
  search: '',
  category: 'all',
  job_type: 'all',
  work_mode: 'all',
  location: '',
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSalary(job) {
  if (!job.show_salary_publicly || (job.salary_min == null && job.salary_max == null)) return null;
  const currency = job.salary_currency || 'USD';
  if (job.salary_min != null && job.salary_max != null) return `${currency} ${Number(job.salary_min).toLocaleString()} – ${Number(job.salary_max).toLocaleString()}`;
  if (job.salary_min != null) return `From ${currency} ${Number(job.salary_min).toLocaleString()}`;
  return `Up to ${currency} ${Number(job.salary_max).toLocaleString()}`;
}

export default function CareersPage() {
  const [filters, setFilters] = useState(initialFilters);
  const activeFilters = useMemo(() => ({ ...filters, limit: 50 }), [filters]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-careers', activeFilters],
    queryFn: () => listPublicJobs(activeFilters),
  });

  const jobs = data?.jobs || [];
  const categories = Array.from(new Set(jobs.map((job) => job.category).filter(Boolean))).sort();

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-[#04060f] text-[#f0f4ff] relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600/20 to-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-600/10 to-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-500/25">
            AI
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 block">RecruitCRM</span>
            <span className="text-[10px] text-slate-400 block font-medium">Careers</span>
          </div>
        </Link>
        <Link href="/dashboard" className="btn btn-secondary btn-sm">Recruiter login</Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-8">
        <section className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Open roles
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Build the future of hiring with us.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
            Search published openings, review role details, and submit your resume directly into our existing applicant tracking workflow.
          </p>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr]">
            <FilterInput label="Search" value={filters.search} onChange={(value) => updateFilter('search', value)} placeholder="Title, team, keywords" />
            <FilterSelect label="Category" value={filters.category} onChange={(value) => updateFilter('category', value)} options={[{ value: 'all', label: 'All categories' }, ...categories.map((category) => ({ value: category, label: category }))]} />
            <FilterSelect label="Type" value={filters.job_type} onChange={(value) => updateFilter('job_type', value)} options={JOB_TYPES} />
            <FilterSelect label="Work mode" value={filters.work_mode} onChange={(value) => updateFilter('work_mode', value)} options={WORK_MODES} />
            <FilterInput label="Location" value={filters.location} onChange={(value) => updateFilter('location', value)} placeholder="Remote, city" />
          </div>
        </section>

        <section className="mt-8">
          {isLoading ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-400">Loading open positions…</div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-sm text-rose-200">{error.message || 'Could not load careers.'}</div>
          ) : jobs.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.slug} job={job} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
              <h2 className="text-xl font-bold text-white">No open positions found</h2>
              <p className="mt-2 text-sm text-slate-400">Try changing your filters or check back soon for new published openings.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function JobCard({ job }) {
  const salary = formatSalary(job);
  const deadline = formatDate(job.application_deadline);
  return (
    <Link href={`/careers/${job.slug}`} className="group rounded-3xl border border-white/10 bg-[#080d1a]/70 p-6 transition-all hover:-translate-y-1 hover:border-indigo-400/30 hover:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
        <span>{job.category || job.department || 'General'}</span>
        <span className="text-slate-600">•</span>
        <span>{job.job_type}</span>
        <span className="text-slate-600">•</span>
        <span>{job.work_mode}</span>
      </div>
      <h2 className="mt-3 text-xl font-extrabold text-white group-hover:text-indigo-200">{job.title}</h2>
      <p className="mt-2 text-sm text-slate-400">{job.location || 'Location flexible'}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {salary && <Pill>{salary}</Pill>}
        {deadline && <Pill>Apply by {deadline}</Pill>}
        {!job.can_apply && <Pill>Applications closed</Pill>}
      </div>
      <span className="mt-6 inline-flex text-sm font-semibold text-cyan-300">View details →</span>
    </Link>
  );
}

function Pill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-300">{children}</span>;
}

function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/50" />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white focus:border-indigo-400/50">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
