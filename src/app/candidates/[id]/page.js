'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '../../_components/AppShell';
import EmptyState from '../../_components/EmptyState';
import { PrimaryButton, SecondaryButton, DangerButton } from '../../_components/PrimaryButton';
import SectionCard from '../../_components/SectionCard';
import ConfirmationModal from '../../_components/ConfirmationModal';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

const STAGE_LABELS = {
  new: 'New',
  parsed: 'Parsed',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  selected: 'Selected',
  rejected: 'Rejected'
};

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params?.id;
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [interviewTitle, setInterviewTitle] = useState('Technical Interview');
  const [interviewStart, setInterviewStart] = useState('');
  const [interviewEnd, setInterviewEnd] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const getTodayDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  function handleStartChange(value) {
    const todayStr = getTodayDateTimeString();
    if (value && value < todayStr) {
      setFeedback('Start date cannot be earlier than current time.');
      return;
    }
    setFeedback('');
    setInterviewStart(value);
    if (value && (!interviewEnd || new Date(interviewEnd) < new Date(value))) {
      const startDate = new Date(value);
      startDate.setHours(startDate.getHours() + 1);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      setInterviewEnd(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  }

  function handleEndChange(value) {
    if (interviewStart && value && new Date(value) < new Date(interviewStart)) {
      setFeedback('End date cannot be earlier than start date.');
      return;
    }
    setFeedback('');
    setInterviewEnd(value);
  }

  const { data, isLoading } = useQuery({
    enabled: Boolean(candidateId),
    queryKey: ['candidate-detail', candidateId],
    queryFn: () => apiGet(`/api/candidates/${candidateId}`, { auth: true }),
  });

  const addNote = useMutation({
    mutationFn: () => apiPost(`/api/candidates/${candidateId}/notes`, { note: noteText, tags }, { auth: true }),
    onSuccess: () => {
      setNoteText('');
      setTags([]);
      setTagInput('');
      setFeedback('Note added.');
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => setFeedback(error.message || 'Could not add note'),
  });

  function handleAddTag() {
    const clean = tagInput.trim();
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
      setTagInput('');
    }
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }

  function handleRemoveTag(tagToRemove) {
    setTags(tags.filter(t => t !== tagToRemove));
  }

  const scoreCandidate = useMutation({
    mutationFn: () => apiPost('/api/matching/score', {
      candidateId,
      title: jobTitle || 'Untitled role',
      description: jobDescription,
    }, { auth: true }),
    onSuccess: () => {
      setFeedback('Candidate scored successfully.');
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-page'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setFeedback(error.message || 'Scoring failed'),
  });

  const scheduleInterview = useMutation({
    mutationFn: () => apiPost('/api/interviews/schedule', {
      candidateId,
      title: interviewTitle,
      description: `Interview scheduled for ${candidate?.full_name || 'candidate'}`,
      start: interviewStart,
      end: interviewEnd,
      attendeeEmail: candidate?.email || '',
    }, { auth: true }),
    onSuccess: () => {
      setFeedback('Interview scheduled successfully.');
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-page'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setFeedback(error.message || 'Could not schedule interview'),
  });

  const deleteCandidate = useMutation({
    mutationFn: () => apiDelete(`/api/candidates/${candidateId}`, { auth: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-page'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      router.push('/candidates');
    },
    onError: (error) => setFeedback(error.message || 'Could not delete candidate'),
  });

  const candidate = data?.candidate;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-[#8b95b0]">
          <span className="animate-spin inline-block w-8 h-8 rounded-full border-4 border-white/20 border-t-indigo-500 mb-4" />
          <span>Loading candidate profile...</span>
        </div>
      </AppShell>
    );
  }

  if (!candidate) {
    return (
      <AppShell>
        <EmptyState title="Candidate not found" detail="Return to the board and select another profile." />
      </AppShell>
    );
  }

  const latestScore = data?.scores?.[0];
  const latestInterview = data?.interviews?.[0];

  return (
    <AppShell>
      {/* Detail header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <button 
            type="button"
            onClick={() => router.push('/candidates')}
            className="btn btn-ghost btn-xs mb-3 pl-1 font-semibold flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Candidates
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{candidate.full_name}</h1>
            <span className={`badge ${
              candidate.stage === 'selected' ? 'badge-emerald' :
              candidate.stage === 'rejected' ? 'badge-rose' :
              candidate.stage === 'shortlisted' ? 'badge-amber' :
              candidate.stage === 'interview_scheduled' ? 'badge-violet' :
              candidate.stage === 'parsed' ? 'badge-sky' : 'badge-indigo'
            }`} style={{ padding: '3px 12px' }}>
              {STAGE_LABELS[candidate.stage] || 'New'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#8b95b0] font-medium">
            {candidate.current_title || 'Candidate profile'} 
            {candidate.current_company && ` at ${candidate.current_company}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DangerButton
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            Delete Profile
          </DangerButton>
        </div>
      </div>

      {/* Main detail splits */}
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] items-start animate-fade-in">
        {/* Left Column: Basic profiles, resume text, notes */}
        <div className="space-y-6">
          <SectionCard 
            title="Candidate Information" 
            description="Overview of structural data extracted from applicant resume."
          >
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <Info label="Email" value={candidate.email || '—'} />
              <Info label="Phone" value={candidate.phone || '—'} />
              <Info label="Location" value={candidate.location || '—'} />
              <Info label="Experience" value={candidate.years_experience ? `${candidate.years_experience} Years` : '0 Years'} />
            </div>

            {candidate.summary && (
              <div className="mt-6 border-t border-white/5 pt-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Profile Summary</p>
                <p className="text-sm leading-relaxed text-slate-300 font-normal">{candidate.summary}</p>
              </div>
            )}

            {(candidate.skills || []).length > 0 && (
              <div className="mt-6 border-t border-white/5 pt-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Extracted Skills</p>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill) => (
                    <span 
                      key={skill} 
                      className="rounded px-2.5 py-1 text-xs font-semibold bg-white/5 border border-white/5 text-slate-300"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard 
            title="Extracted Document Text" 
            description="Raw plain text extracted from candidate physical file."
          >
            <div className="max-h-72 overflow-y-auto rounded-xl border border-white/5 bg-[#03050b]/80 p-4 text-xs font-mono leading-relaxed text-slate-400 whitespace-pre-wrap">
              {data?.resume?.extracted_text || 'No extracted resume text is currently available.'}
            </div>
          </SectionCard>

          <SectionCard 
            title="Recruiter Notes Feed" 
            description="Record internal evaluation notes and concern feedback."
          >
            <div className="space-y-4">
              <textarea
                rows={4}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Write your observation remarks here..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50"
              />

              {/* Tags Input Interface */}
              <div>
                <label className="form-label mb-1.5 block">Add Note Tags (Optional)</label>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Type tag (e.g. strong-comm) and press Enter"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50"
                  />
                  <SecondaryButton type="button" onClick={handleAddTag} className="px-4 py-2.5">
                    Add
                  </SecondaryButton>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/35 px-2.5 py-1 text-xs font-semibold text-indigo-300"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 text-[9px] leading-none"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <PrimaryButton 
                  type="button" 
                  disabled={!noteText.trim() || addNote.isPending} 
                  onClick={() => addNote.mutate()}
                >
                  {addNote.isPending ? 'Saving note…' : 'Save Recruiter Note'}
                </PrimaryButton>
                {feedback && <span className="text-xs text-[#8b95b0]">{feedback}</span>}
              </div>
            </div>

            {/* Timeline component for notes */}
            <div className="mt-6 border-t border-white/5 pt-6 space-y-4">
              {(data?.notes || []).length ? (
                data.notes.map((note) => (
                  <div 
                    key={note.id} 
                    className="relative pl-6 border-l border-white/10 py-1"
                  >
                    {/* timeline node */}
                    <div className="absolute top-2.5 left-[-4.5px] w-2 h-2 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/50" />
                    <p className="text-sm text-slate-300 font-normal leading-relaxed">{note.note}</p>

                    {/* Render Note Tags */}
                    {note.tags && note.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-white/5 border border-white/5 text-indigo-300 uppercase tracking-wider"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="mt-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600">No notes written for this applicant yet.</p>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: AI Ranking, Outreach tools, Stage tracker */}
        <div className="space-y-6">
          {/* AI Score evaluator card */}
          <SectionCard 
            title="AI Candidate Alignment Scoring" 
            description="Assess and score candidate experience match against specific job descriptions."
          >
            <div className="space-y-4">
              <input 
                value={jobTitle} 
                onChange={(event) => setJobTitle(event.target.value)} 
                placeholder="Role Title (e.g. Senior Backend Architect)" 
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50"
              />
              <textarea 
                rows={6} 
                value={jobDescription} 
                onChange={(event) => setJobDescription(event.target.value)} 
                placeholder="Paste the role requirements, description, and qualifications here..." 
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50"
              />
              <PrimaryButton 
                type="button" 
                disabled={!jobDescription.trim() || scoreCandidate.isPending} 
                onClick={() => scoreCandidate.mutate()}
                className="w-full justify-center"
              >
                {scoreCandidate.isPending ? 'Calculating Alignment Score…' : 'Assess & Score Candidate'}
              </PrimaryButton>
            </div>

            {latestScore && (
              <div className="mt-6 p-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
                <div className="flex items-center gap-4">
                  {/* Glowing Match metric circle */}
                  <div className="w-16 h-16 rounded-full border-2 border-cyan-400 bg-cyan-400/10 flex flex-col items-center justify-center shadow-lg shadow-cyan-400/25 flex-shrink-0">
                    <span className="text-base font-black text-white">{latestScore.score}</span>
                    <span className="text-[9px] text-cyan-300 font-bold uppercase">Match</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">AI Alignment Results</h3>
                    <p className="text-xs text-cyan-200 mt-1">Skill Match Matrix: {latestScore.skill_match_percent}%</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-cyan-500/10 pt-4 text-xs leading-relaxed text-slate-300 font-normal">
                  <p className="font-semibold text-white mb-1">AI Reasoning Assessment:</p>
                  <p>{latestScore.explanation}</p>
                </div>

                {latestScore.matched_skills?.length > 0 && (
                  <div className="mt-3 text-xs">
                    <span className="font-semibold text-white">Matched Skills: </span>
                    <span className="text-slate-300">{latestScore.matched_skills.join(', ')}</span>
                  </div>
                )}

                {latestScore.missing_skills?.length > 0 && (
                  <div className="mt-1 text-xs">
                    <span className="font-semibold text-[#fda4af]">Missing Skills: </span>
                    <span className="text-[#fca5a5]">{latestScore.missing_skills.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Communication & outreach */}
          <SectionCard 
            title="Calendar & Scheduling Workspace" 
            description="Coordinate candidate interview events and sync calendar invitations."
          >
            <div className="space-y-4">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Calendar Invite Scheduler</p>
                
                <div>
                  <label className="form-label mb-1.5 block">Meeting Title</label>
                  <input 
                    value={interviewTitle} 
                    onChange={(event) => setInterviewTitle(event.target.value)} 
                    placeholder="Technical Interview" 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="form-label mb-1.5 block text-xs">Start Date/Time</label>
                    <input 
                      type="datetime-local" 
                      value={interviewStart} 
                      onChange={(event) => handleStartChange(event.target.value)} 
                      min={getTodayDateTimeString()}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white" 
                    />
                  </div>
                  <div>
                    <label className="form-label mb-1.5 block text-xs">End Date/Time</label>
                    <input 
                      type="datetime-local" 
                      value={interviewEnd} 
                      onChange={(event) => handleEndChange(event.target.value)} 
                      min={interviewStart}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white" 
                    />
                  </div>
                </div>

                <PrimaryButton 
                  type="button" 
                  disabled={!interviewStart || !interviewEnd || new Date(interviewEnd) < new Date(interviewStart) || scheduleInterview.isPending} 
                  onClick={() => scheduleInterview.mutate()}
                  className="w-full justify-center"
                >
                  {scheduleInterview.isPending ? 'Scheduling Calendar Event…' : 'Schedule Interview & Sync Calendar'}
                </PrimaryButton>
              </div>
            </div>

            {latestInterview && (
              <div className="mt-5 p-4 rounded-xl border border-white/5 bg-white/[0.015]">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  Upcoming Event Details
                </p>
                <div className="mt-3 text-xs text-slate-300 font-medium">
                  <p className="font-semibold text-white text-sm">{latestInterview.title}</p>
                  <p className="mt-1.5 text-slate-400">Scheduled: {new Date(latestInterview.start_at).toLocaleString()}</p>
                  {latestInterview.external_event_link && (
                    <a 
                      href={latestInterview.external_event_link} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Open Calendar Link
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Stage Progression history */}
          <SectionCard 
            title="Stage Transition Logs" 
            description="Historical tracking log of stages as this candidate advances."
          >
            <div className="relative pl-4 space-y-4">
              {/* timeline thread */}
              <div className="absolute top-0 bottom-2 left-1.5 w-[1px] bg-white/10" />

              {(data?.history || []).length ? (
                data.history.map((entry) => (
                  <div key={entry.id} className="relative pl-4">
                    {/* node point */}
                    <div className="absolute top-1.5 left-[-13.5px] w-2 h-2 rounded-full border border-indigo-500/50 bg-[#080d1a]" />
                    <p className="text-xs text-slate-300">
                      <span className="text-[#8b95b0]">{entry.from_stage ? STAGE_LABELS[entry.from_stage] : 'New'}</span>
                      <span className="mx-2 text-slate-500">→</span>
                      <strong className="text-white font-bold">{STAGE_LABELS[entry.to_stage]}</strong>
                    </p>
                    <p className="mt-1 text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600 pl-2">No stage transitions logged.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => deleteCandidate.mutate()}
        title="Delete Candidate Profile"
        message={`Are you sure you want to delete ${candidate?.full_name || 'this candidate'}'s profile? This will permanently remove all associated notes, resumes, AI alignment scores, and scheduled interviews.`}
        confirmText="Delete Permanently"
        isPending={deleteCandidate.isPending}
      />
    </AppShell>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.012] p-4 hover:bg-white/[0.025] hover:border-white/10 transition-all">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
