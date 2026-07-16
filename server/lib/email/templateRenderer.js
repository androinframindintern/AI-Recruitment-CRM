const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'demo-template-shortlisted',
    name: 'shortlisted_default',
    type: 'shortlisted',
    is_default: true,
    subject: 'You have been shortlisted for {{job_title}} at {{company_name}}',
    body: `Hi {{candidate_name}},

We are excited to let you know that you have been shortlisted for the {{job_title}} position at {{company_name}}.

Our team was impressed by your background and we would like to move forward in the process.

We will be in touch shortly with next steps.

Best regards,
{{recruiter_name}}`,
  },
  {
    id: 'demo-template-interview-scheduled',
    name: 'interview_scheduled_default',
    type: 'interview_scheduled',
    is_default: true,
    subject: 'Interview Scheduled: {{job_title}} on {{interview_date}}',
    body: `Hi {{candidate_name}},

Your interview for the {{job_title}} position has been scheduled.

Date & Time: {{interview_date}} at {{interview_time}}
Duration: {{duration}} minutes
Format: {{interview_format}}

{{calendar_link}}

Please let us know if you need to reschedule.

Best regards,
{{recruiter_name}}`,
  },
  {
    id: 'demo-template-rejected',
    name: 'rejected_default',
    type: 'rejected',
    is_default: true,
    subject: 'Update on your application for {{job_title}}',
    body: `Hi {{candidate_name}},

Thank you for taking the time to apply for the {{job_title}} position at {{company_name}}.

After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our current needs.

We appreciate your interest and encourage you to apply for future openings.

Best regards,
{{recruiter_name}}`,
  },
];

export function findDefaultTemplate(type) {
  return DEFAULT_EMAIL_TEMPLATES.find((template) => template.type === type) || DEFAULT_EMAIL_TEMPLATES[0];
}

export function renderTemplate(template = '', variables = {}) {
  return String(template || '').replace(PLACEHOLDER_PATTERN, (_match, key) => {
    const value = variables[key];
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  });
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function textToHtml(value = '') {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function compactBodyPreview(value = '', maxLength = 220) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}
