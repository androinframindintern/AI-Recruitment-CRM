const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function stripFence(text) {
  return String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

async function generateContent(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured');

  const response = await fetch(`${API_URL}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini request failed');
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  return stripFence(text);
}

export async function parseResumeWithGemini(resumeText) {
  if (!hasGeminiKey()) {
    return {
      full_name: 'Demo Candidate',
      email: 'candidate@example.com',
      phone: '',
      summary: 'Gemini API key is not configured yet.',
      current_company: '',
      current_title: '',
      years_experience: 0,
      skills: [],
      education: [],
      experience: [],
      location: '',
    };
  }

  const prompt = `Extract a structured recruitment profile from this resume text. Return only JSON with keys: full_name, email, phone, summary, current_company, current_title, years_experience, skills, education, experience, location. education should be an array of objects with degree, institution, year. experience should be an array of objects with company, title, start_date, end_date, highlights.\n\nResume:\n${resumeText.slice(0, 18000)}`;
  const raw = await generateContent(prompt);
  return JSON.parse(raw);
}

export async function scoreCandidateMatch({ candidate, job }) {
  if (!hasGeminiKey()) {
    const candidateSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
    const jobText = `${job.title || ''} ${job.description || ''}`.toLowerCase();
    const matchedSkills = candidateSkills.filter((skill) => jobText.includes(String(skill).toLowerCase()));
    const skillMatch = candidateSkills.length ? Math.round((matchedSkills.length / candidateSkills.length) * 100) : 0;
    return {
      score: Math.max(45, Math.min(95, skillMatch || 60)),
      skill_match_percent: skillMatch,
      matched_skills: matchedSkills,
      missing_skills: [],
      explanation: 'Demo score generated because Gemini API key is not configured yet.',
    };
  }

  const prompt = `You are scoring a candidate for a job. Return only JSON with keys: score, skill_match_percent, matched_skills, missing_skills, explanation. score must be 0-100.\n\nJob:\n${JSON.stringify(job)}\n\nCandidate:\n${JSON.stringify(candidate)}`;
  const raw = await generateContent(prompt);
  return JSON.parse(raw);
}
