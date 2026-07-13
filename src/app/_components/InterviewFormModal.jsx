'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCandidateAvailability } from '@/lib/interviewData';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/lib/timezones';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';

const EMPTY_DEFAULTS = {};

const INTERVIEW_TYPES = [
  { value: 'hr', label: 'HR Interview' },
  { value: 'technical', label: 'Technical Interview' },
  { value: 'final', label: 'Final Interview' },
  { value: 'manager', label: 'Manager Round' },
  { value: 'custom', label: 'Custom' },
];

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 16);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultForm(initialInterview, defaults = {}) {
  return {
    candidateId: initialInterview?.candidate_id || defaults.candidateId || '',
    jobId: initialInterview?.job_id || defaults.jobId || '',
    availabilityId: initialInterview?.availability_id || defaults.availabilityId || '',
    title: initialInterview?.title || defaults.title || 'Technical Interview',
    interviewType: initialInterview?.interview_type || defaults.interviewType || 'technical',
    attendeeEmail: initialInterview?.attendee_email || defaults.attendeeEmail || '',
    interviewerEmail: initialInterview?.interviewer_email || defaults.interviewerEmail || '',
    start: toLocalInput(initialInterview?.start_at || defaults.start),
    end: toLocalInput(initialInterview?.end_at || defaults.end),
    timezone: initialInterview?.timezone || defaults.timezone || DEFAULT_TIMEZONE,
    location: initialInterview?.location || defaults.location || '',
    notes: initialInterview?.description || defaults.notes || '',
    createMeetLink: Boolean(defaults.createMeetLink),
    sendUpdates: Boolean(defaults.sendUpdates),
  };
}

function todayLocalMin() {
  return toLocalInput(new Date().toISOString());
}

export default function InterviewFormModal({
  isOpen,
  mode = 'create',
  initialInterview = null,
  candidates = [],
  jobs = [],
  availability = [],
  defaults = EMPTY_DEFAULTS,
  isPending = false,
  onSubmit,
  onClose,
}) {
  const [form, setForm] = useState(() => defaultForm(initialInterview, defaults));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => {
      setForm(defaultForm(initialInterview, defaults));
      setError('');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialInterview, defaults]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isPending) onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPending, onClose]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === form.candidateId) || null,
    [candidates, form.candidateId],
  );

  const availabilityQuery = useQuery({
    enabled: isOpen && Boolean(form.candidateId) && availability.length === 0,
    queryKey: ['candidate-availability', form.candidateId],
    queryFn: () => listCandidateAvailability(form.candidateId),
  });

  const availableSlots = useMemo(() => {
    const slotSource = availability.length ? availability : (availabilityQuery.data?.availability || []);
    return slotSource.filter((slot) => slot.candidate_id === form.candidateId && slot.status === 'available');
  }, [availability, availabilityQuery.data?.availability, form.candidateId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyAvailabilitySlot(slotId) {
    const slot = availability.find((item) => item.id === slotId);
    if (!slot) {
      updateField('availabilityId', '');
      return;
    }
    setForm((current) => ({
      ...current,
      availabilityId: slot.id,
      start: toLocalInput(slot.start_at),
      end: toLocalInput(slot.end_at),
      timezone: slot.timezone || current.timezone,
    }));
  }

  function handleStartChange(value) {
    setError('');
    setForm((current) => {
      const next = { ...current, start: value, availabilityId: current.availabilityId && value !== current.start ? '' : current.availabilityId };
      if (value && (!current.end || new Date(current.end) <= new Date(value))) {
        const end = new Date(value);
        end.setHours(end.getHours() + 1);
        next.end = toLocalInput(end.toISOString());
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (!form.candidateId) return setError('Candidate is required.');
    if (!form.title.trim()) return setError('Interview title is required.');
    if (!form.start || !form.end) return setError('Start and end time are required.');
    if (new Date(form.end) <= new Date(form.start)) return setError('End time must be greater than start time.');
    if (mode === 'create' && new Date(form.start) < new Date()) return setError('Interviews cannot be scheduled in the past.');

    await onSubmit?.({
      candidateId: form.candidateId,
      jobId: form.jobId || null,
      availabilityId: form.availabilityId || null,
      title: form.title.trim(),
      interviewType: form.interviewType,
      attendeeEmail: form.attendeeEmail || selectedCandidate?.email || '',
      interviewerEmail: form.interviewerEmail,
      start: form.start,
      end: form.end,
      timezone: form.timezone || 'UTC',
      location: form.location.trim(),
      notes: form.notes.trim(),
      createMeetLink: form.createMeetLink,
      sendUpdates: form.sendUpdates,
    });
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in"
      onClick={() => !isPending && onClose?.()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#080d1a] border border-white/10 rounded-2xl p-6 shadow-2xl animate-scale-in relative"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {mode === 'edit' ? 'Edit Interview' : 'Schedule Interview'}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Coordinate candidate availability, recruiter schedule, and Google Calendar sync.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>Close</button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label mb-1.5 block">Candidate</label>
            <select className="form-select w-full" value={form.candidateId} onChange={(event) => updateField('candidateId', event.target.value)} required>
              <option value="" className="bg-slate-900">Select candidate</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id} className="bg-slate-900">
                  {candidate.full_name || candidate.email || candidate.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label mb-1.5 block">Job Position</label>
            <select className="form-select w-full" value={form.jobId} onChange={(event) => updateField('jobId', event.target.value)}>
              <option value="" className="bg-slate-900">No linked job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id} className="bg-slate-900">
                  {job.title}{job.department ? ` (${job.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label mb-1.5 block">Interview Type</label>
            <select className="form-select w-full" value={form.interviewType} onChange={(event) => updateField('interviewType', event.target.value)}>
              {INTERVIEW_TYPES.map((type) => <option key={type.value} value={type.value} className="bg-slate-900">{type.label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label mb-1.5 block">Interviewer</label>
            <input className="form-input w-full" value={form.interviewerEmail} onChange={(event) => updateField('interviewerEmail', event.target.value)} placeholder="interviewer@company.com" type="email" />
          </div>

          <div className="sm:col-span-2">
            <label className="form-label mb-1.5 block">Meeting Title</label>
            <input className="form-input w-full" value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Technical Interview" required />
          </div>

          {availableSlots.length > 0 && (
            <div className="sm:col-span-2">
              <label className="form-label mb-1.5 block">Candidate Available Time Slots</label>
              <select className="form-select w-full" value={form.availabilityId} onChange={(event) => applyAvailabilitySlot(event.target.value)}>
                <option value="" className="bg-slate-900">Choose manually</option>
                {availableSlots.map((slot) => (
                  <option key={slot.id} value={slot.id} className="bg-slate-900">
                    {new Date(slot.start_at).toLocaleString()} – {new Date(slot.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({slot.timezone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="form-label mb-1.5 block">Start Time</label>
            <input className="form-input w-full" type="datetime-local" min={mode === 'create' ? todayLocalMin() : undefined} value={form.start} onChange={(event) => handleStartChange(event.target.value)} required />
          </div>

          <div>
            <label className="form-label mb-1.5 block">End Time</label>
            <input className="form-input w-full" type="datetime-local" min={form.start || undefined} value={form.end} onChange={(event) => updateField('end', event.target.value)} required />
          </div>

          <div>
            <label className="form-label mb-1.5 block">Time Zone</label>
            <select className="form-select w-full" value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)} required>
              {TIMEZONE_OPTIONS.map((timezone) => (
                <option key={timezone.value} value={timezone.value} className="bg-slate-900">
                  {timezone.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label mb-1.5 block">Meeting Location</label>
            <input className="form-input w-full" value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Google Meet, Office, Zoom link..." />
          </div>

          <div className="sm:col-span-2">
            <label className="form-label mb-1.5 block">Interview Notes</label>
            <textarea className="form-input w-full" rows={4} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Agenda, preparation notes, hiring panel context..." />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <input type="checkbox" checked={form.createMeetLink} onChange={(event) => updateField('createMeetLink', event.target.checked)} />
            Create Google Meet link when Google Calendar is connected
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <input type="checkbox" checked={form.sendUpdates} onChange={(event) => updateField('sendUpdates', event.target.checked)} />
            Send Google Calendar attendee updates
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <SecondaryButton type="button" disabled={isPending} onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Schedule Interview'}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
