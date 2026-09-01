'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import AppShell from '../_components/AppShell';
import { PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';

import {
  createJob,
  updateJob,
} from '@/lib/recruitmentData';

const JOB_TYPES = [
  {
    value: 'full-time',
    label: 'Full-time',
  },
  {
    value: 'part-time',
    label: 'Part-time',
  },
  {
    value: 'internship',
    label: 'Internship',
  },
  {
    value: 'contract',
    label: 'Contract',
  },
  {
    value: 'temporary',
    label: 'Temporary',
  },
];

const WORK_MODES = [
  {
    value: 'remote',
    label: 'Remote',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
  },
  {
    value: 'on-site',
    label: 'On-site',
  },
];

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

export default function JobsPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState(initialJob);
  const [message, setMessage] = useState('');
  const [editingJobId, setEditingJobId] = useState(null);

  /*
   * Create Job
   */
  const mutation = useMutation({
    mutationFn: (payload) => createJob(payload),

    onSuccess: (_data, payload) => {
      setForm(initialJob);
      setEditingJobId(null);

      if (payload.status === 'published') {
        setMessage(
          'Job published successfully. Public applicants can now apply.'
        );
      } else {
        setMessage(
          'Draft job saved successfully.'
        );
      }

      queryClient.invalidateQueries({
        queryKey: ['jobs'],
      });

      queryClient.invalidateQueries({
        queryKey: ['analytics-summary'],
      });
    },

    onError: (error) => {
      setMessage(
        error?.message ||
          'Could not create job.'
      );
    },
  });

  /*
   * Update Job
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      updateJob(id, payload),

    onSuccess: (_data, variables) => {
      setForm(initialJob);
      setEditingJobId(null);

      const status =
        variables?.payload?.status;

      if (status === 'published') {
        setMessage(
          'Job published successfully.'
        );
      } else if (status === 'closed') {
        setMessage(
          'Job closed successfully.'
        );
      } else {
        setMessage(
          'Job updated successfully.'
        );
      }

      queryClient.invalidateQueries({
        queryKey: ['jobs'],
      });

      queryClient.invalidateQueries({
        queryKey: ['analytics-summary'],
      });
    },

    onError: (error) => {
      setMessage(
        error?.message ||
          'Could not update job.'
      );
    },
  });

  /*
   * Update form field
   */
  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /*
   * Build API payload
   */
  function buildPayload(statusOverride = null) {
    const salaryMin =
      form.salary_min === ''
        ? null
        : Number(form.salary_min);

    const salaryMax =
      form.salary_max === ''
        ? null
        : Number(form.salary_max);

    if (
      salaryMin !== null &&
      salaryMax !== null &&
      salaryMin > salaryMax
    ) {
      throw new Error(
        'Minimum salary cannot be greater than maximum salary.'
      );
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

      salary_currency:
        form.salary_currency || 'USD',

      show_salary_publicly:
        form.show_salary_publicly,

      application_deadline:
        form.application_deadline || null,

      status:
        statusOverride ||
        form.status ||
        'draft',
    };
  }

  /*
   * Submit Job
   */
  function submitJob(statusOverride = null) {
    setMessage('');

    try {
      const payload =
        buildPayload(statusOverride);

      if (!payload.title) {
        throw new Error(
          'Job title is required.'
        );
      }

      if (!payload.description) {
        throw new Error(
          'Job description is required.'
        );
      }

      if (editingJobId) {
        updateMutation.mutate({
          id: editingJobId,
          payload,
        });
      } else {
        mutation.mutate(payload);
      }
    } catch (error) {
      setMessage(
        error?.message ||
          'Could not save job.'
      );
    }
  }

  /*
   * Cancel edit
   */
  function cancelEdit() {
    setEditingJobId(null);
    setForm(initialJob);
    setMessage('');
  }

  const isSaving =
    mutation.isPending ||
    updateMutation.isPending;

  return (
    <AppShell>

      {/* =========================================
          PAGE HEADER
      ========================================== */}

      <div className="mb-8 animate-fade-in">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

          <div>

            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Job Management
            </h1>

            <p className="mt-2 text-sm text-[#8b95b0]">
              Create drafts, publish public career roles,
              close openings, and rank applicants through
              the existing ATS matching flow.
            </p>

          </div>

          <Link
            href="/careers"
            className="btn btn-secondary btn-sm self-start lg:self-auto"
          >
            View public careers site
          </Link>

        </div>

      </div>


      {/* =========================================
          CREATE / EDIT JOB
      ========================================== */}

      <div className="grid gap-6 items-start animate-fade-in">

        <SectionCard
          title={
            editingJobId
              ? 'Edit Job Opening'
              : 'Create Job Opening'
          }
          description="Save as draft until the role is ready, then publish it to the public career site."
        >

          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="grid gap-4"
          >

            {/* =====================================
                JOB TITLE
            ====================================== */}

            <Field
              label="Job title"
              value={form.title}
              onChange={(value) =>
                updateField(
                  'title',
                  value
                )
              }
              placeholder="e.g. Senior Frontend Architect"
              required
            />


            {/* =====================================
                DEPARTMENT + CATEGORY
            ====================================== */}

            <div className="grid gap-4 sm:grid-cols-2">

              <Field
                label="Department"
                value={form.department}
                onChange={(value) =>
                  updateField(
                    'department',
                    value
                  )
                }
                placeholder="e.g. Engineering"
              />

              <Field
                label="Job category"
                value={form.category}
                onChange={(value) =>
                  updateField(
                    'category',
                    value
                  )
                }
                placeholder="e.g. Software Engineering"
              />

            </div>


            {/* =====================================
                EMPLOYMENT + WORK MODE + LOCATION
            ====================================== */}

            <div className="grid gap-4 sm:grid-cols-3">

              <SelectField
                label="Employment type"
                value={form.job_type}
                onChange={(value) =>
                  updateField(
                    'job_type',
                    value
                  )
                }
                options={JOB_TYPES}
              />

              <SelectField
                label="Work mode"
                value={form.work_mode}
                onChange={(value) =>
                  updateField(
                    'work_mode',
                    value
                  )
                }
                options={WORK_MODES}
              />

              <Field
                label="Location"
                value={form.location}
                onChange={(value) =>
                  updateField(
                    'location',
                    value
                  )
                }
                placeholder="e.g. Remote / Jaipur"
              />

            </div>


            {/* =====================================
                JOB DESCRIPTION
            ====================================== */}

            <Field
              label="Job description"
              value={form.description}
              onChange={(value) =>
                updateField(
                  'description',
                  value
                )
              }
              placeholder="Describe responsibilities, expectations, and role impact..."
              textarea
              rows={7}
              required
            />


            {/* =====================================
                REQUIREMENTS
            ====================================== */}

            <Field
              label="Key requirements (one per line)"
              value={form.requirements}
              onChange={(value) =>
                updateField(
                  'requirements',
                  value
                )
              }
              placeholder={`React
Next.js
TypeScript
System Design`}
              textarea
              rows={4}
            />


            {/* =====================================
                SALARY + CURRENCY + DEADLINE
            ====================================== */}

            <div className="grid gap-4 sm:grid-cols-4">

              <Field
                label="Min salary"
                type="number"
                value={form.salary_min}
                onChange={(value) =>
                  updateField(
                    'salary_min',
                    value
                  )
                }
                placeholder="80000"
              />

              <Field
                label="Max salary"
                type="number"
                value={form.salary_max}
                onChange={(value) =>
                  updateField(
                    'salary_max',
                    value
                  )
                }
                placeholder="120000"
              />

              <Field
                label="Currency"
                value={form.salary_currency}
                onChange={(value) =>
                  updateField(
                    'salary_currency',
                    value.toUpperCase()
                  )
                }
                placeholder="USD"
                maxLength={3}
              />

              <Field
                label="Deadline"
                type="date"
                value={form.application_deadline}
                onChange={(value) =>
                  updateField(
                    'application_deadline',
                    value
                  )
                }
              />

            </div>


            {/* =====================================
                SHOW SALARY
            ====================================== */}

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">

              <input
                type="checkbox"
                checked={
                  form.show_salary_publicly
                }
                onChange={(event) =>
                  updateField(
                    'show_salary_publicly',
                    event.target.checked
                  )
                }
                className="h-4 w-4 rounded border-white/20 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
              />

              <span>
                Show salary publicly on career
                cards and job details
              </span>

            </label>


            {/* =====================================
                SUCCESS / ERROR MESSAGE
            ====================================== */}

            {message && (
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300 flex gap-2">

                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />

                <p>
                  {message}
                </p>

              </div>
            )}


            {/* =====================================
                ACTION BUTTONS
            ====================================== */}

            <div className="pt-2 flex flex-wrap gap-3">

              {/* Save Draft */}

              <SecondaryButton
                type="button"
                disabled={isSaving}
                onClick={() =>
                  submitJob('draft')
                }
                className="flex-1 sm:flex-none justify-center"
              >
                {editingJobId
                  ? 'Save as Draft'
                  : 'Save Draft'}
              </SecondaryButton>


              {/* Publish Job */}

              <PrimaryButton
                type="button"
                disabled={isSaving}
                onClick={() =>
                  submitJob('published')
                }
                className="flex-1 sm:flex-none justify-center"
              >
                {isSaving
                  ? 'Saving…'
                  : 'Publish Job'}
              </PrimaryButton>


              {/* Cancel Edit */}

              {editingJobId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-secondary flex-1 sm:flex-none justify-center"
                  style={{
                    color: '#fff',
                    border:
                      '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  Cancel
                </button>
              )}

            </div>

          </form>

        </SectionCard>

      </div>

    </AppShell>
  );
}


/* =====================================================
   FIELD COMPONENT
===================================================== */

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  textarea = false,
  rows = 4,
  type = 'text',
  required = false,
  maxLength,
}) {
  const inputStyle =
    'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:bg-white/[0.07] focus:shadow-md transition-all';

  return (
    <label className="block">

      <span className="mb-2 block text-xs font-semibold text-[#8b95b0] uppercase tracking-wider">
        {label}
      </span>

      {textarea ? (
        <textarea
          rows={rows}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={placeholder}
          className={inputStyle}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={placeholder}
          className={inputStyle}
          required={required}
          maxLength={maxLength}
        />
      )}

    </label>
  );
}


/* =====================================================
   SELECT FIELD COMPONENT
===================================================== */

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label className="block">

      <span className="mb-2 block text-xs font-semibold text-[#8b95b0] uppercase tracking-wider">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/50 focus:bg-[#111827] focus:shadow-md transition-all"
      >

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}

      </select>

    </label>
  );
}
