'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPostForm } from '@/lib/api';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import { PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';

const STAGES = [
  { id: 'new', label: 'New' },
  { id: 'parsed', label: 'Parsed' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'interview_scheduled', label: 'Interview Scheduled' },
  { id: 'selected', label: 'Selected' },
  { id: 'rejected', label: 'Rejected' },
];

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [resumeFile, setResumeFile] = useState(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const candidatesQuery = useQuery({
    queryKey: ['candidates'],
    queryFn: () => apiGet('/api/candidates', { auth: true }),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      return apiPostForm('/api/candidates/upload', formData, { auth: true });
    },
    onSuccess: () => {
      setResumeFile(null);
      setNotice('Resume uploaded and parsed successfully.');
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setNotice(error.message || 'Resume upload failed'),
  });

  const stageMutation = useMutation({
    mutationFn: ({ candidateId, stage }) => apiPatch(`/api/candidates/${candidateId}/stage`, { stage }, { auth: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
  });

  const filteredCandidates = useMemo(() => {
    const candidates = candidatesQuery.data?.candidates || [];
    const term = search.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((candidate) => {
      const haystack = `${candidate.full_name} ${candidate.email} ${candidate.current_title} ${candidate.current_company} ${(candidate.skills || []).join(' ')}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [candidatesQuery.data?.candidates, search]);

  const grouped = STAGES.map((stage) => ({
    ...stage,
    candidates: filteredCandidates.filter((candidate) => candidate.stage === stage.id),
  }));

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <SectionCard title="Upload resume" description="PDF or DOCX resumes are parsed into structured candidate profiles using the AI extraction pipeline.">
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
            <input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950" />
            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton type="button" disabled={!resumeFile || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
                {uploadMutation.isPending ? 'Parsing…' : 'Upload and parse'}
              </PrimaryButton>
              {resumeFile ? <span className="text-sm text-slate-400">{resumeFile.name}</span> : null}
            </div>
            {notice ? <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">{notice}</p> : null}
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">Search candidates</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, title, or skill" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Pipeline board" description="Move candidates through the ATS stages and open the profile page for scoring, notes, email, and interview actions.">
          {filteredCandidates.length ? (
            <div className="grid gap-4 xl:grid-cols-3">
              {grouped.map((stage) => (
                <div key={stage.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-white">{stage.label}</h3>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{stage.candidates.length}</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {stage.candidates.length ? stage.candidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-white">{candidate.full_name}</h4>
                            <p className="mt-1 text-sm text-slate-400">{candidate.current_title || 'Candidate'} {candidate.current_company ? `· ${candidate.current_company}` : ''}</p>
                          </div>
                          <span className="text-sm text-cyan-300">{candidate.latest_score?.score ? `${candidate.latest_score.score}/100` : '—'}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(candidate.skills || []).slice(0, 4).map((skill) => (
                            <span key={skill} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{skill}</span>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link href={`/candidates/${candidate.id}`} className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-950">Open</Link>
                          <select
                            value={candidate.stage}
                            onChange={(event) => stageMutation.mutate({ candidateId: candidate.id, stage: event.target.value })}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                          >
                            {STAGES.map((option) => (
                              <option key={option.id} value={option.id} className="bg-slate-900">{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-500">No candidates in this stage.</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No candidate profiles yet" detail="Upload the first resume to start building the ATS board." action={<SecondaryButton type="button" onClick={() => document.querySelector('input[type=file]')?.click()}>Select resume</SecondaryButton>} />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
