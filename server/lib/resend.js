import { Resend } from 'resend';

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function renderTemplate({ candidateName, jobTitle, type, when, meetingLink }) {
  if (type === 'interview_scheduled') {
    return {
      subject: `Interview scheduled${jobTitle ? ` for ${jobTitle}` : ''}`,
      html: `<div><p>Hi ${candidateName || 'Candidate'},</p><p>Your interview${jobTitle ? ` for <strong>${jobTitle}</strong>` : ''} has been scheduled${when ? ` on ${when}` : ''}.</p>${meetingLink ? `<p>Meeting link: <a href="${meetingLink}">${meetingLink}</a></p>` : ''}<p>Best regards,<br/>Recruitment Team</p></div>`,
    };
  }

  if (type === 'rejected') {
    return {
      subject: `Update on your application${jobTitle ? ` for ${jobTitle}` : ''}`,
      html: `<div><p>Hi ${candidateName || 'Candidate'},</p><p>Thank you for your interest${jobTitle ? ` in the ${jobTitle} role` : ''}. We will not be moving forward at this stage.</p><p>We appreciate your time.</p></div>`,
    };
  }

  return {
    subject: `Application shortlisted${jobTitle ? ` for ${jobTitle}` : ''}`,
    html: `<div><p>Hi ${candidateName || 'Candidate'},</p><p>Your profile has been shortlisted${jobTitle ? ` for <strong>${jobTitle}</strong>` : ''}.</p><p>We will contact you with the next steps shortly.</p></div>`,
  };
}

export async function sendRecruitmentEmail(payload) {
  const client = getClient();
  const email = renderTemplate(payload);
  if (!client) {
    return {
      id: `demo-${Date.now()}`,
      status: 'demo',
      ...email,
    };
  }

  const response = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Recruitment CRM <onboarding@resend.dev>',
    to: payload.to,
    subject: email.subject,
    html: email.html,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Resend send failed');
  }

  return {
    id: response.data?.id || `resend-${Date.now()}`,
    status: 'sent',
    ...email,
  };
}
