import fetch from 'node:fetch';

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function generateChatCompletion(prompt, isJson = false) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: isJson ? { type: 'json_object' } : undefined,
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI API request failed');
  }

  return data?.choices?.[0]?.message?.content || '{}';
}

export async function parseResumeWithOpenAI(resumeText) {
  if (!hasOpenAIKey()) {
    return {
      full_name: 'Demo Candidate',
      email: 'candidate@example.com',
      phone: '',
      summary: 'OpenAI API key is not configured yet.',
      current_company: '',
      current_title: '',
      years_experience: 0,
      skills: [],
      education: [],
      experience: [],
      location: '',
    };
  }

  const prompt = `Extract a structured recruitment profile from this resume text. Return only JSON with keys: full_name, email, phone, summary, current_company, current_title, years_experience, skills, education, experience, location. education should be an array of objects with degree, institution, year. experience should be an array of objects with company, title, start_date, end_date, highlights. Ensure to output valid JSON.\n\nResume:\n${resumeText.slice(0, 15000)}`;
  
  const raw = await generateChatCompletion(prompt, true);
  return JSON.parse(raw);
}

export async function scoreCandidateMatch({ candidate, job }) {
  if (!hasOpenAIKey()) {
    const candidateSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
    const jobText = `${job.title || ''} ${job.description || ''}`.toLowerCase();
    const matchedSkills = candidateSkills.filter((skill) => jobText.includes(String(skill).toLowerCase()));
    const skillMatch = candidateSkills.length ? Math.round((matchedSkills.length / candidateSkills.length) * 100) : 0;
    return {
      score: Math.max(45, Math.min(95, skillMatch || 60)),
      skill_match_percent: skillMatch,
      matched_skills: matchedSkills,
      missing_skills: [],
      explanation: 'Demo score generated because OpenAI API key is not configured yet.',
    };
  }

  const prompt = `You are scoring a candidate for a job. Return only JSON with keys: score, skill_match_percent, matched_skills, missing_skills, explanation. score must be 0-100. Ensure to output valid JSON.\n\nJob:\n${JSON.stringify(job)}\n\nCandidate:\n${JSON.stringify(candidate)}`;
  const raw = await generateChatCompletion(prompt, true);
  return JSON.parse(raw);
}

export async function generateEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Generate a pseudo-deterministic vector for demo mode based on char codes
    const vector = new Array(1536).fill(0);
    const cleanText = String(text || '').toLowerCase();
    for (let i = 0; i < Math.min(cleanText.length, 1536); i++) {
      vector[i] = (cleanText.charCodeAt(i) % 100) / 100;
    }
    return vector;
  }

  const cleanText = String(text || '').slice(0, 8000).trim();
  if (!cleanText) return new Array(1536).fill(0);

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: cleanText,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('OpenAI embedding failed, using zero fallback:', data?.error?.message);
      return new Array(1536).fill(0);
    }

    return data?.data?.[0]?.embedding || new Array(1536).fill(0);
  } catch (err) {
    console.error('OpenAI Embedding exception:', err);
    return new Array(1536).fill(0);
  }
}
