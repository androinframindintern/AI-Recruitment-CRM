'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPublicJob } from '@/lib/recruitmentData';
import ApplyForm from './ApplyForm';

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatSalary(job) {
  if (!job?.show_salary_publicly || (job.salary_min == null && job.salary_max == null)) return null;
  const currency = job.salary_currency || 'USD';
  if (job.salary_min != null && job.salary_max != null) return `${currency} ${Number(job.salary_min).toLocaleString()} – ${Number(job.salary_max).toLocaleString()}`;
  if (job.salary_min != null) return `From ${currency} ${Number(job.salary_min).toLocaleString()}`;
  return `Up to ${currency} ${Number(job.salary_max).toLocaleString()}`;
}

function plainText(value) {
  return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

export default function CareerDetailPage() {
  const params = useParams();
  const slug = String(params?.slug || '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-career', slug],
    queryFn: () => getPublicJob(slug),
    enabled: Boolean(slug),
  });

  const job = data?.job;
  const salary = formatSalary(job);
  const deadline = formatDate(job?.application_deadline);
  const publishedAt = formatDate(job?.published_at);

  return (
    <div className="min-h-screen bg-[#04060f] text-[#f0f4ff] relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600/20 to-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-600/10 to-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/careers" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-500/25">
            AI
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 block">RecruitCRM</span>
            <span className="text-[10px] text-slate-400 block font-medium">Careers</span>
          </div>
        </Link>
        <Link href="/careers" className="btn btn-secondary btn-sm">All openings</Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-8">
        {isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-400">Loading job details…</div>
        ) : error || !job ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <h1 className="text-2xl font-extrabold text-white">Job not found</h1>
            <p className="mt-2 text-sm text-slate-400">This role may be closed, unpublished, or no longer available.</p>
            <Link href="/careers" className="btn btn-primary btn-sm mt-6">View open roles</Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_0.42fr] lg:items-start">
            <article className="rounded-3xl border border-white/10 bg-[#080d1a]/75 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                <span>{job.category || job.department || 'General'}</span>
                <span className="text-slate-600">•</span>
                <span>{job.job_type}</span>
                <span className="text-slate-600">•</span>
                <span>{job.work_mode}</span>
              </div>

              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{job.title}</h1>
              <p className="mt-3 text-base text-slate-400">{job.location || 'Location flexible'}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {job.can_apply ? (
                  <a href="#apply" className="btn btn-primary btn-lg font-bold">Apply Now</a>
                ) : (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-100">Applications closed</span>
                )}
                <Link href="/careers" className="btn btn-secondary btn-lg">All openings</Link>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <Meta label="Salary" value={salary || 'Not publicly disclosed'} />
                <Meta label="Deadline" value={deadline || 'No deadline'} />
                <Meta label="Posted" value={publishedAt || 'Recently'} />
              </div>

              <section className="mt-8 border-t border-white/10 pt-8">
                <h2 className="text-xl font-bold text-white">About this role</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
                  {plainText(job.description).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>

              {job.requirements?.length > 0 && (
                <section className="mt-8 border-t border-white/10 pt-8">
                  <h2 className="text-xl font-bold text-white">Requirements</h2>
                  <ul className="mt-4 grid gap-3 text-sm text-slate-300">
                    {job.requirements.map((requirement) => (
                      <li key={requirement} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-400" />
                        <span>{requirement}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>

            <aside className="lg:sticky lg:top-6">
              <ApplyForm slug={job.slug} canApply={job.can_apply} />
            </aside>

            <JobPostingJsonLd job={job} />
          </div>
        )}
      </main>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function JobPostingJsonLd({ job }) {
  if (!job) return null;
  const json = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.published_at,
    validThrough: job.application_deadline,
    employmentType: String(job.job_type || '').toUpperCase().replace('-', '_'),
    applicantLocationRequirements: job.work_mode === 'remote' ? { '@type': 'Country', name: 'Remote' } : undefined,
    jobLocationType: job.work_mode === 'remote' ? 'TELECOMMUTE' : undefined,
    jobLocation: job.location ? {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.location },
    } : undefined,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'AI Recruitment CRM',
    },
    baseSalary: job.show_salary_publicly && (job.salary_min != null || job.salary_max != null) ? {
      '@type': 'MonetaryAmount',
      currency: job.salary_currency || 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salary_min ?? undefined,
        maxValue: job.salary_max ?? undefined,
        unitText: 'YEAR',
      },
    } : undefined,
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
