'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmationModal from './ConfirmationModal';
import EmptyState from './EmptyState';
import { DangerButton, GhostButton, PrimaryButton, SecondaryButton } from './PrimaryButton';
import { createCandidateAvailability, deleteCandidateAvailability, listCandidateAvailability, updateCandidateAvailability } from '@/lib/interviewData';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/lib/timezones';

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

function emptyForm() {
  return { start: '', end: '', timezone: DEFAULT_TIMEZONE, notes: '' };
}

function statusClass(status) {
  if (status === 'available') return 'badge-emerald';
  if (status === 'booked') return 'badge-violet';
  if (status === 'held') return 'badge-amber';
  if (status === 'cancelled') return 'badge-rose';
  return 'badge-slate';
}

export default function CandidateAvailabilityPanel({ candidateId, initialAvailability = [], onUseSlot, onChanged }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const availabilityQuery = useQuery({
    enabled: Boolean(candidateId),
    queryKey: ['candidate-availability', candidateId],
    queryFn: () => listCandidateAvailability(candidateId),
    initialData: initialAvailability?.length ? { availability: initialAvailability } : undefined,
  });

  const availability = availabilityQuery.data?.availability || [];

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
  }

  function startEdit(slot) {
    setEditing(slot);
    setForm({
      start: toLocalInput(slot.start_at),
      end: toLocalInput(slot.end_at),
      timezone: slot.timezone || DEFAULT_TIMEZONE,
      notes: slot.notes || '',
    });
    setFeedback('');
  }

  function validate() {
    if (!form.start || !form.end) return 'Start and end time are required.';
    if (new Date(form.end) <= new Date(form.start)) return 'End time must be greater than start time.';
    if (new Date(form.end) < new Date()) return 'Availability cannot be entirely in the past.';
    if (!form.timezone.trim()) return 'Timezone is required.';
    return '';
  }

  const saveAvailability = useMutation({
    mutationFn: () => {
      const error = validate();
      if (error) throw new Error(error);
      const payload = {
        candidateId,
        startAt: form.start,
        endAt: form.end,
        timezone: form.timezone.trim(),
        notes: form.notes.trim(),
      };
      return editing
        ? updateCandidateAvailability(editing.id, payload)
        : createCandidateAvailability(payload);
    },
    onSuccess: () => {
      setFeedback(editing ? 'Availability updated.' : 'Availability added.');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['candidate-availability', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      onChanged?.();
    },
    onError: (error) => setFeedback(error.message || 'Could not save availability.'),
  });

  const deleteAvailability = useMutation({
    mutationFn: () => deleteCandidateAvailability(deleteTarget.id),
    onSuccess: () => {
      setFeedback('Availability deleted.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['candidate-availability', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-detail', candidateId] });
      onChanged?.();
    },
    onError: (error) => setFeedback(error.message || 'Could not delete availability.'),
  });

  return (
    <>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label mb-1.5 block">Start Time</label>
            <input
              type="datetime-local"
              className="form-input w-full"
              value={form.start}
              onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))}
            />
          </div>
          <div>
            <label className="form-label mb-1.5 block">End Time</label>
            <input
              type="datetime-local"
              className="form-input w-full"
              value={form.end}
              min={form.start || undefined}
              onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
            />
          </div>
          <div>
            <label className="form-label mb-1.5 block">Preferred Time Zone</label>
            <select
              className="form-select w-full"
              value={form.timezone}
              onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            >
              {TIMEZONE_OPTIONS.map((timezone) => (
                <option key={timezone.value} value={timezone.value} className="bg-slate-900">
                  {timezone.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label mb-1.5 block">Notes</label>
            <input
              className="form-input w-full"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional candidate preference"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="button" disabled={saveAvailability.isPending} onClick={() => saveAvailability.mutate()}>
            {saveAvailability.isPending ? 'Saving…' : editing ? 'Update Availability' : 'Add Availability'}
          </PrimaryButton>
          {editing && <SecondaryButton type="button" onClick={resetForm}>Cancel Edit</SecondaryButton>}
          {feedback && <span className="text-xs text-slate-400">{feedback}</span>}
        </div>

        <div className="border-t border-white/5 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Available Dates & Time Slots</p>
            {availabilityQuery.isFetching && <span className="text-[10px] text-slate-500">Refreshing…</span>}
          </div>

          {availability.length ? (
            <div className="space-y-3">
              {availability.map((slot) => (
                <div key={slot.id} className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-white">{new Date(slot.start_at).toLocaleDateString()}</p>
                        <span className={`badge ${statusClass(slot.status)}`}>{slot.status || 'available'}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        {new Date(slot.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(slot.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{slot.timezone}
                      </p>
                      {slot.notes && <p className="mt-2 text-xs text-slate-500">{slot.notes}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {slot.status === 'available' && (
                        <GhostButton type="button" className="btn-xs" onClick={() => onUseSlot?.(slot)}>Use Slot</GhostButton>
                      )}
                      {slot.status !== 'booked' && <SecondaryButton type="button" className="btn-xs" onClick={() => startEdit(slot)}>Edit</SecondaryButton>}
                      {slot.status !== 'booked' && <DangerButton type="button" className="btn-xs" onClick={() => setDeleteTarget(slot)}>Delete</DangerButton>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No availability added" detail="Add candidate time slots so recruiters can schedule directly from preferred windows." />
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteAvailability.mutate()}
        title="Delete Availability Slot"
        message="This removes the candidate's available time slot. Scheduled interviews are not affected."
        confirmText="Delete Slot"
        isPending={deleteAvailability.isPending}
      />
    </>
  );
}
