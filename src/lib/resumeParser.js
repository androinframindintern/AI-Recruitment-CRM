'use client';

import { isSupabaseConfigured, safeGetSession } from './supabaseClient';

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express', 'Supabase',
  'PostgreSQL', 'MongoDB', 'MySQL', 'HTML', 'CSS', 'Tailwind', 'Redux', 'GraphQL',
  'REST API', 'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'C#', '.NET',
  'PHP', 'Laravel', 'Ruby', 'Rails', 'Go', 'Rust', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Git', 'CI/CD', 'Figma', 'UI/UX', 'Sales', 'Marketing', 'SEO',
  'Recruitment', 'HR', 'Excel', 'Power BI', 'Tableau', 'Machine Learning', 'AI',
];

function cleanText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodePdfString(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractBasicPdfText(arrayBuffer) {
  const raw = new TextDecoder('latin1').decode(arrayBuffer);
  const chunks = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)\s*Tj/g;
  const arrayPattern = /\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g;

  for (const match of raw.matchAll(literalPattern)) {
    chunks.push(decodePdfString(match[0].replace(/\)\s*Tj$/, '').slice(1)));
  }

  for (const match of raw.matchAll(arrayPattern)) {
    const text = Array.from(match[1].matchAll(/\((?:\\.|[^\\)])*\)/g))
      .map((item) => decodePdfString(item[0].slice(1, -1)))
      .join('');
    if (text.trim()) chunks.push(text);
  }

  if (chunks.length) return cleanText(chunks.join('\n'));

  return cleanText(raw
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' '));
}

export async function extractTextFromResumeFile(file) {
  if (!file) throw new Error('Resume file is required.');

  const name = file.name || '';
  const type = file.type || '';
  const lowerName = name.toLowerCase();

  if (type.startsWith('text/') || lowerName.endsWith('.txt')) {
    return cleanText(await file.text());
  }

  if (lowerName.endsWith('.docx')) {
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default || mammothModule;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return cleanText(result.value || '');
  }

  if (lowerName.endsWith('.pdf') || type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    return extractBasicPdfText(arrayBuffer);
  }

  if (lowerName.endsWith('.doc')) {
    throw new Error('Old .doc files cannot be parsed in browser-only mode. Please upload DOCX/PDF or save as DOCX first.');
  }

  return cleanText(await file.text().catch(() => ''));
}

function pickName(lines, fileName) {
  const blocked = /resume|curriculum|vitae|cv|email|phone|mobile|address|linkedin|github|profile|summary/i;
  const candidate = lines.find((line) => {
    const clean = line.trim();
    return clean.length >= 3
      && clean.length <= 60
      && !blocked.test(clean)
      && !/@/.test(clean)
      && !/\d{4,}/.test(clean);
  });

  if (candidate) return candidate.replace(/[^a-zA-Z .'-]/g, '').trim();
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Candidate';
}

function pickTitle(text) {
  const titlePatterns = [
    'Frontend Developer', 'Front End Developer', 'Backend Developer', 'Full Stack Developer',
    'Software Engineer', 'Web Developer', 'React Developer', 'Node.js Developer',
    'UI UX Designer', 'Product Manager', 'Project Manager', 'Data Analyst', 'Data Scientist',
    'HR Recruiter', 'Recruiter', 'Sales Executive', 'Marketing Manager', 'Business Analyst',
  ];
  const lower = text.toLowerCase();
  return titlePatterns.find((title) => lower.includes(title.toLowerCase())) || 'Applicant';
}

function pickExperience(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/i)
    || text.match(/(?:experience|exp)\D{0,20}(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  return match ? Number(match[1]) : 0;
}

function pickSkills(text) {
  const lower = text.toLowerCase();
  const found = COMMON_SKILLS.filter((skill) => lower.includes(skill.toLowerCase()));
  return Array.from(new Set(found)).slice(0, 20);
}

function pickLocation(lines) {
  const locationLine = lines.find((line) => /\b(india|remote|jaipur|delhi|mumbai|pune|bangalore|bengaluru|hyderabad|chennai|kolkata|gurgaon|noida|ahmedabad)\b/i.test(line));
  return locationLine?.slice(0, 80).trim() || '';
}

export function parseCandidateFromResumeText(text, fileName = 'resume') {
  const clean = cleanText(text);
  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean);
  const email = clean.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
  const phone = clean.match(/(?:\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim() || '';
  const skills = pickSkills(clean);

  return {
    full_name: pickName(lines.slice(0, 12), fileName),
    email,
    phone,
    summary: clean.slice(0, 600),
    current_title: pickTitle(clean),
    years_experience: pickExperience(clean),
    location: pickLocation(lines.slice(0, 20)),
    skills,
    resumeText: clean,
    fileName,
  };
}

function normalizeGeminiProfile(profile, resumeText, fileName) {
  const fallback = parseCandidateFromResumeText(resumeText, fileName);
  return {
    ...fallback,
    full_name: String(profile?.full_name || fallback.full_name || '').trim(),
    email: String(profile?.email || fallback.email || '').trim(),
    phone: String(profile?.phone || fallback.phone || '').trim(),
    summary: String(profile?.summary || fallback.summary || '').trim(),
    current_company: String(profile?.current_company || '').trim(),
    current_title: String(profile?.current_title || fallback.current_title || '').trim(),
    years_experience: Number(profile?.years_experience ?? fallback.years_experience ?? 0),
    location: String(profile?.location || fallback.location || '').trim(),
    skills: Array.isArray(profile?.skills) && profile.skills.length ? profile.skills.map(String) : fallback.skills,
    education: Array.isArray(profile?.education) ? profile.education : [],
    experience: Array.isArray(profile?.experience) ? profile.experience : [],
    resumeText,
    fileName,
  };
}

export async function parseCandidateWithGemini(resumeText, fileName = 'resume') {
  const clean = cleanText(resumeText);
  if (!clean) throw new Error('Could not extract text from this resume.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isSupabaseConfigured() || !url || !anonKey) {
    return parseCandidateFromResumeText(clean, fileName);
  }

  const { data: sessionData } = await safeGetSession();
  const token = sessionData?.session?.access_token || anonKey;
  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/parse-resume`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resumeText: clean, fileName }),
  }).catch((error) => {
    throw new Error(`Could not reach Supabase Edge Function parse-resume. Deploy it first, then try again. Browser error: ${error.message}`);
  });

  const data = await response.json().catch(async () => ({ error: await response.text().catch(() => '') }));

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    if (response.status === 404) {
      throw new Error('Supabase Edge Function parse-resume is not deployed. Run: supabase functions deploy parse-resume');
    }
    throw new Error(`Gemini resume parsing failed in Supabase Edge Function: ${message}`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return normalizeGeminiProfile(data?.profile || {}, clean, fileName);
}
