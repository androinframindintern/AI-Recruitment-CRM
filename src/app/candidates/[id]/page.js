'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import AppShell from '../../_components/AppShell';
import EmptyState from '../../_components/EmptyState';
import { PrimaryButton, SecondaryButton } from '../../_components/PrimaryButton';
import SectionCard from '../../_components/SectionCard';
import { apiGet, apiPost } from '@/lib/api';

export default function CandidateDetailPage() {
  const params = useParams();
  const candidateId = params?.id;
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [emailType, setEmailType] = useState('shortlisted');
  const [emailAddress, setEmailAddress] = useState('');
  const [interviewTitle, setInterviewTitle] = useState('Recruiter Interview');
  const [interviewStart, setInterviewStart] = useState('');
  const [interviewEnd, setInterviewEnd] = useState('');
  const [feedback, setFeedback] = useState('');

  const { data, isLoading } = useQuery({
    enabled: Boolean(candidateId),
    queryKey: ['candidate-detail', candidateId],
    queryFn: () => apiGet(`/api/candidates/${candidateId}`, { auth: true }),
  });

  const addNote = useMutation({
    mutationFn: () => apiPost(`/api/candidates/${candidateId}/notes`, { note: noteText, tags: [] }, { auth: true }),
    onSuccess: () => {
      setNoteText('');
      setFeedback('Note added.');
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (error) => setFeedback(error.message || 'Could not add note'),
  });

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

  const sendEmail = useMutation({
    mutationFn: () => apiPost('/api/emails/send', {
      candidateId,
      type: emailType,
      to: emailAddress || candidate?.email,
      candidateName: candidate?.full_name,
      jobTitle,
      when: interviewStart,
    }, { auth: true }),
    onSuccess: () => {
      setFeedback('Email action completed.');
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
    },
    onError: (error) => setFeedback(error.message || 'Email send failed'),
  });

  const scheduleInterview = useMutation({
    mutationFn: () => apiPost('/api/interviews/schedule', {
      candidateId,
      title: interviewTitle,
      description: `Interview scheduled for ${candidate?.full_name || 'candidate'}`,
      start: interviewStart,
      end: interviewEnd,
      attendeeEmail: emailAddress || candidate?.email || '',
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

  const candidate = data?.candidate;

  if (isLoading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-slate-300">Loading candidate profile…</div>
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
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <SectionCard title={candidate.full_name} description={`${candidate.current_title || 'Candidate profile'}${candidate.current_company ? ` · ${candidate.current_company}` : ''}`}>
            <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
              <Info label="Email" value={candidate.email || '—'} />
              <Info label="Phone" value={candidate.phone || '—'} />
              <Info label="Location" value={candidate.location || '—'} />
              <Info label="Stage" value={candidate.stage || '—'} />
              <Info label="Experience" value={`${candidate.years_experience || 0} years`} />
              <Info label="Latest score" value={latestScore ? `${latestScore.score}/100` : 'Not scored'} />
            </div>
            {candidate.summary ? <p className="mt-5 text-sm leading-7 text-slate-300">{candidate.summary}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {(candidate.skills || []).map((skill) => (
                <span key={skill} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{skill}</span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Resume extraction" description="Text extracted from the uploaded document before AI structuring.">
            <div className="max-h-72 overflow-auto rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm leading-7 text-slate-300 whitespace-pre-wrap">
              {data?.resume?.extracted_text || 'No extracted resume text available.'}
            </div>
          </SectionCard>

          <SectionCard title="Recruiter notes" description="Capture internal observations and hiring context.">
            <textarea
              rows={5}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Add recruiter notes, concerns, strengths, or next steps"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton type="button" disabled={!noteText.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                {addNote.isPending ? 'Saving…' : 'Add note'}
              </PrimaryButton>
              {feedback ? <p className="text-sm text-slate-400">{feedback}</p> : null}
            </div>
            <div className="mt-5 space-y-3">
              {(data?.notes || []).length ? data.notes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                  <p>{note.note}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{new Date(note.created_at).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No notes yet.</p>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="AI candidate scoring" description="Paste a job description and generate a score with reasoning.">
            <div className="grid gap-4">
              <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Role title" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <textarea rows={8} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the job description or responsibilities here" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <PrimaryButton type="button" disabled={!jobDescription.trim() || scoreCandidate.isPending} onClick={() => scoreCandidate.mutate()}>
                {scoreCandidate.isPending ? 'Scoring…' : 'Run AI score'}
              </PrimaryButton>
            </div>
            {latestScore ? (
              <div className="mt-5 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5 text-sm text-cyan-100">
                <p className="text-3xl font-semibold text-white">{latestScore.score}/100</p>
                <p className="mt-1">Skill match: {latestScore.skill_match_percent}%</p>
                <p className="mt-4 leading-7">{latestScore.explanation}</p>
                {latestScore.matched_skills?.length ? <p className="mt-4">Matched skills: {latestScore.matched_skills.join(', ')}</p> : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Communication and scheduling" description="Trigger follow-up emails and create interview events.">
            <div className="grid gap-4">
              <input value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder={candidate.email || 'candidate@example.com'} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <div className="grid gap-4 sm:grid-cols-2">
                <select value={emailType} onChange={(event) => setEmailType(event.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                  <option value="shortlisted" className="bg-slate-900">Shortlisted</option>
                  <option value="interview_scheduled" className="bg-slate-900">Interview scheduled</option>
                  <option value="rejected" className="bg-slate-900">Rejected</option>
                </select>
                <SecondaryButton type="button" disabled={sendEmail.isPending || !(emailAddress || candidate.email)} onClick={() => sendEmail.mutate()}>
                  {sendEmail.isPending ? 'Sending…' : 'Send email'}
                </SecondaryButton>
              </div>
              <input value={interviewTitle} onChange={(event) => setInterviewTitle(event.target.value)} placeholder="Interview title" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <div className="grid gap-4 sm:grid-cols-2">
                <input type="datetime-local" value={interviewStart} onChange={(event) => setInterviewStart(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                <input type="datetime-local" value={interviewEnd} onChange={(event) => setInterviewEnd(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              </div>
              <PrimaryButton type="button" disabled={!interviewStart || !interviewEnd || scheduleInterview.isPending} onClick={() => scheduleInterview.mutate()}>
                {scheduleInterview.isPending ? 'Scheduling…' : 'Schedule interview'}
              </PrimaryButton>
            </div>
            {latestInterview ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                <p className="font-semibold text-white">Latest interview</p>
                <p className="mt-2">{latestInterview.title}</p>
                <p>{new Date(latestInterview.start_at).toLocaleString()}</p>
                {latestInterview.external_event_link ? <a href={latestInterview.external_event_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-300">Open calendar event</a> : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Stage history" description="Track how the candidate moved through the hiring process.">
            <div className="space-y-3">
              {(data?.history || []).length ? data.history.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                  <p><span className="font-semibold text-white">{entry.from_stage || 'new'}</span> → <span className="font-semibold text-white">{entry.to_stage}</span></p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No stage changes recorded yet.</p>}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  );
}
