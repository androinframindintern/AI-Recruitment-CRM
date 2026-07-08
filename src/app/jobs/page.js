'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import { PrimaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';
import ConfirmationModal from '../_components/ConfirmationModal';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

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
  const [editingJobId, setEditingJobId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [rankingJobId, setRankingJobId] = useState(null);
  const [rankingResults, setRankingResults] = useState({});
  
  const { data: jobsData } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiGet('/api/jobs', { auth: true }),
  });

  const candidatesQuery = useQuery({
    queryKey: ['candidates'],
    queryFn: () => apiGet('/api/candidates', { auth: true }),
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

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiPatch(`/api/jobs/${id}`, payload, { auth: true }),
    onSuccess: () => {
      setForm(initialJob);
      setEditingJobId(null);
      setMessage('Job description updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error.message || 'Could not update job description'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/api/jobs/${id}`, { auth: true }),
    onSuccess: () => {
      setMessage('Job deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => setMessage(error.message || 'Could not delete job'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }) => apiPatch(`/api/jobs/${id}`, { is_active }, { auth: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const rankCandidatesMutation = useMutation({
    mutationFn: (jobId) => apiPost(`/api/matching/jobs/${jobId}/candidates`, {
      limit: 50,
      backfillMissing: true,
    }, { auth: true }),
    onMutate: (jobId) => {
      setRankingJobId(jobId);
      setMessage('Ranking candidates using job and profile embeddings…');
    },
    onSuccess: (result, jobId) => {
      setRankingResults((current) => ({ ...current, [jobId]: result.matches || [] }));
      setMessage(`Ranked ${result.matches?.length || 0} candidates for this job.`);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setMessage(error.message || 'Could not rank candidates for this job'),
    onSettled: () => setRankingJobId(null),
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    
    const payload = {
      ...form,
      requirements: form.requirements
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    if (editingJobId) {
      updateMutation.mutate({ id: editingJobId, payload });
    } else {
      mutation.mutate(payload);
    }
  }

  function startEdit(job) {
    setEditingJobId(job.id);
    setForm({
      title: job.title || '',
      department: job.department || '',
      location: job.location || '',
      description: job.description || '',
      requirements: Array.isArray(job.requirements) ? job.requirements.join('\n') : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingJobId(null);
    setForm(initialJob);
    setMessage('');
  }

  const jobs = jobsData?.jobs || [];

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
        {/* Create / Edit job card */}
        <SectionCard 
          title={editingJobId ? "Edit Job Requirement" : "Create Job Requirement"} 
          description={editingJobId ? "Update role metrics for candidate matching." : "Create role metrics to unlock candidate matching assessments."}
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

            <div className="pt-2 flex gap-3">
              <PrimaryButton 
                type="submit" 
                disabled={mutation.isPending || updateMutation.isPending} 
                className="flex-1 sm:flex-none justify-center"
              >
                {editingJobId 
                  ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                  : (mutation.isPending ? 'Creating Role…' : 'Create Job Requirement')
                }
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

        {/* Jobs list card */}
        <SectionCard 
          title="Configured Job Openings" 
          description="Ready for candidate alignment matching scores."
        >
          {jobs.length ? (
            <div className="grid gap-4">
              {jobs.map((job) => {
                // Find candidates matched to this specific job
                const matchedCandidates = (candidatesQuery.data?.candidates || [])
                  .map(cand => {
                    const scoreObj = cand.job_scores?.find(s => s.job_id === job.id);
                    return scoreObj ? { candidate: cand, score: scoreObj.score } : null;
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.score - a.score);

                const rankedMatches = rankingResults[job.id] || [];

                return (
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
                      
                      <button
                        onClick={() => toggleStatusMutation.mutate({ id: job.id, is_active: job.is_active === false })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all self-start sm:self-auto ${
                          job.is_active !== false 
                            ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300 hover:bg-emerald-400/10'
                            : 'border-slate-500/20 bg-slate-500/5 text-slate-400 hover:bg-slate-500/10'
                        }`}
                      >
                        <span className={`w-1 h-1 rounded-full ${job.is_active !== false ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                        {job.is_active !== false ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-300 font-normal">
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

                    <div className="mt-4 border-t border-white/5 pt-3">
                      <button
                        type="button"
                        onClick={() => rankCandidatesMutation.mutate(job.id)}
                        disabled={rankingJobId === job.id}
                        className="btn btn-primary btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
                      >
                        {rankingJobId === job.id ? 'Ranking Candidates…' : 'Rank Candidates'}
                      </button>
                    </div>

                    {rankedMatches.length > 0 && (
                      <div className="mt-4 border-t border-cyan-500/10 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-2">
                          Embedding Ranked Candidates ({rankedMatches.length})
                        </p>
                        <div className="space-y-1.5">
                          {rankedMatches.slice(0, 5).map((match, index) => (
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
                    )}

                    {/* Matched Candidates List */}
                    {matchedCandidates.length > 0 && (
                      <div className="mt-4 border-t border-white/5 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Candidates Matched ({matchedCandidates.length})
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

                    {/* Edit / Delete Actions */}
                    <div className="mt-4 flex items-center justify-end gap-3 border-t border-white/5 pt-3">
                      <button
                        onClick={() => startEdit(job)}
                        className="btn btn-secondary btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
                      >
                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Edit Details
                      </button>
                      <button
                        onClick={() => {
                          setJobToDelete(job);
                          setIsDeleteModalOpen(true);
                        }}
                        className="btn btn-ghost hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 btn-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState 
              title="No jobs configured" 
              detail="Create a job configuration on the left to activate AI applicant matching scores." 
            />
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
          if (jobToDelete) {
            deleteMutation.mutate(jobToDelete.id);
          }
          setIsDeleteModalOpen(false);
          setJobToDelete(null);
        }}
        title="Delete Job Opening"
        message={`Are you sure you want to delete the job opening "${jobToDelete?.title || 'this role'}"? This will permanently remove the role and all associated candidate match scores.`}
        confirmText="Delete permanently"
        isPending={deleteMutation.isPending}
      />
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
