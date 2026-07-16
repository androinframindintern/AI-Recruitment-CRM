'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listEmailTemplates, updateEmailTemplate } from '@/lib/emailData';
import { PrimaryButton } from './PrimaryButton';
import SectionCard from './SectionCard';

const TEMPLATE_TYPES = [
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'rejected', label: 'Rejected' },
];

export default function EmailTemplateSettingsPanel() {
  const queryClient = useQueryClient();
  const [type, setType] = useState('shortlisted');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const templatesQuery = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => listEmailTemplates(),
  });

  const selectedTemplate = useMemo(() => {
    const templates = templatesQuery.data?.templates || [];
    return templates.find((template) => template.type === type && !template.is_default)
      || templates.find((template) => template.type === type && template.is_default)
      || templates.find((template) => template.type === type)
      || null;
  }, [templatesQuery.data?.templates, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSubject(selectedTemplate?.subject || '');
      setBody(selectedTemplate?.body || '');
      setNotice('');
      setError('');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedTemplate]);

  const saveTemplate = useMutation({
    mutationFn: () => updateEmailTemplate(selectedTemplate.id, { type, subject, body }),
    onMutate: () => {
      setNotice('');
      setError('');
    },
    onSuccess: () => {
      setNotice('Template saved. Default templates are copied into your editable workspace.');
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (caught) => setError(caught.message || 'Could not save template.'),
  });

  return (
    <SectionCard
      title="Email Templates"
      description="Edit shortlisted and rejection templates. Placeholders like {{candidate_name}}, {{job_title}}, {{company_name}}, and {{recruiter_name}} are replaced during preview."
    >
      <div className="space-y-4">
        {notice && <div className="alert alert-success">{notice}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div>
          <label className="form-label mb-1.5 block">Template Type</label>
          <select className="form-select w-full" value={type} onChange={(event) => setType(event.target.value)}>
            {TEMPLATE_TYPES.map((item) => <option key={item.value} value={item.value} className="bg-slate-900">{item.label}</option>)}
          </select>
        </div>

        <div>
          <label className="form-label mb-1.5 block">Subject</label>
          <input className="form-input w-full" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" />
        </div>

        <div>
          <label className="form-label mb-1.5 block">Body</label>
          <textarea className="form-input w-full min-h-60" rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Template body" />
        </div>

        <PrimaryButton
          type="button"
          disabled={!selectedTemplate || !subject.trim() || !body.trim() || saveTemplate.isPending}
          onClick={() => saveTemplate.mutate()}
        >
          {saveTemplate.isPending ? 'Saving Template…' : 'Save Template'}
        </PrimaryButton>

        {templatesQuery.isLoading && <div className="h-16 rounded-xl skeleton" />}
      </div>
    </SectionCard>
  );
}
