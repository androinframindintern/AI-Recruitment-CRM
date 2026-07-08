const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const EMBEDDING_DIMENSIONS = 768;

let contentBackoffUntil = 0;
let embeddingBackoffUntil = 0;

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function scoringEnabled() {
  return String(process.env.GEMINI_SCORING_ENABLED || '').trim().toLowerCase() === 'true';
}

function stripFence(text) {
  return String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

function parseRetryDelay(error) {
  const retryDelay = error?.details?.find((detail) => detail?.['@type']?.includes('RetryInfo'))?.retryDelay;
  const match = String(retryDelay || error?.message || '').match(/([0-9.]+)s/);
  if (!match) return 60_000;
  return Math.max(1_000, Math.ceil(Number(match[1]) * 1000));
}

function isQuotaError(error) {
  const status = String(error?.providerStatus || error?.status || error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status.includes('429') || status.includes('RESOURCE_EXHAUSTED') || message.includes('quota') || message.includes('rate limit');
}

function createScoringError(code, message, status = 503, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.provider = 'gemini';
  error.isAiScoringError = true;
  if (cause) error.cause = cause;
  return error;
}

function createEmbeddingError(code, message, status = 503, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.provider = 'gemini';
  error.isEmbeddingError = true;
  if (cause) error.cause = cause;
  return error;
}

function createGeminiError(data) {
  const providerError = data?.error || {};
  const error = new Error(providerError.message || 'Gemini request failed');
  error.provider = 'gemini';
  error.providerStatus = providerError.status;
  error.providerCode = providerError.code;
  error.details = providerError.details;
  error.retryDelay = parseRetryDelay(providerError);
  return error;
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
    const error = createGeminiError(data);
    if (isQuotaError(error)) {
      contentBackoffUntil = Date.now() + error.retryDelay;
    }
    throw error;
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  return stripFence(text);
}

function normalizeScore(value, field) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw createScoringError(
      'AI_SCORING_INVALID_RESPONSE',
      `Gemini returned an invalid ${field}. No fallback score was generated.`,
      502,
    );
  }
  return Math.round(score);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function validateMatchScore(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createScoringError(
      'AI_SCORING_INVALID_RESPONSE',
      'Gemini returned invalid JSON for candidate scoring. No fallback score was generated.',
      502,
      error,
    );
  }

  const explanation = String(parsed?.explanation || '').trim();
  if (!explanation) {
    throw createScoringError(
      'AI_SCORING_INVALID_RESPONSE',
      'Gemini returned a score without an explanation. No fallback score was generated.',
      502,
    );
  }

  return {
    score: normalizeScore(parsed?.score, 'score'),
    skill_match_percent: normalizeScore(parsed?.skill_match_percent, 'skill_match_percent'),
    matched_skills: normalizeStringArray(parsed?.matched_skills),
    missing_skills: normalizeStringArray(parsed?.missing_skills),
    explanation,
  };
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

export async function scoreCandidateMatch({ candidate, job, resumeText = '' }) {
  if (!scoringEnabled()) {
    throw createScoringError(
      'AI_SCORING_DISABLED',
      'Gemini AI scoring is disabled. Set GEMINI_SCORING_ENABLED=true. No fallback score was generated.',
      503,
    );
  }

  if (!hasGeminiKey()) {
    throw createScoringError(
      'AI_SCORING_NOT_CONFIGURED',
      'Gemini AI scoring is not configured. Add GEMINI_API_KEY. No fallback score was generated.',
      503,
    );
  }

  if (Date.now() < contentBackoffUntil) {
    throw createScoringError(
      'AI_SCORING_QUOTA_EXHAUSTED',
      'Gemini quota or rate limit was reached. No fallback score was generated.',
      429,
    );
  }

  const prompt = `You are an expert recruiting evaluator. Score this candidate for this job using the structured profile and extracted resume text. Return only JSON with keys: score, skill_match_percent, matched_skills, missing_skills, explanation. score and skill_match_percent must be numbers from 0 to 100. matched_skills and missing_skills must be arrays of strings. explanation must be a concise hiring-relevant assessment.\n\nJob:\n${JSON.stringify(job)}\n\nCandidate profile:\n${JSON.stringify(candidate)}\n\nExtracted resume text excerpt:\n${String(resumeText || '').slice(0, 12000)}`;

  try {
    const raw = await generateContent(prompt);
    return validateMatchScore(raw);
  } catch (error) {
    if (error?.isAiScoringError) throw error;

    if (isQuotaError(error)) {
      contentBackoffUntil = Date.now() + (error.retryDelay || 60_000);
      throw createScoringError(
        'AI_SCORING_QUOTA_EXHAUSTED',
        'Gemini quota or rate limit was reached. No fallback score was generated.',
        429,
        error,
      );
    }

    throw createScoringError(
      'AI_SCORING_UNAVAILABLE',
      'Gemini AI scoring failed. No fallback score was generated.',
      502,
      error,
    );
  }
}

export async function generateEmbedding(text) {
  if (!hasGeminiKey()) {
    throw createEmbeddingError(
      'EMBEDDING_NOT_CONFIGURED',
      'Gemini embeddings are not configured. Add GEMINI_API_KEY.',
      503,
    );
  }

  if (Date.now() < embeddingBackoffUntil) {
    throw createEmbeddingError(
      'EMBEDDING_QUOTA_EXHAUSTED',
      'Gemini embedding quota or rate limit was reached.',
      429,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const cleanText = String(text || '').slice(0, 8000).trim();
  if (!cleanText) {
    throw createEmbeddingError('EMBEDDING_EMPTY_TEXT', 'Cannot generate embedding for empty text.', 400);
  }

  try {
    const response = await fetch(`${API_URL}/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text: cleanText }],
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = createGeminiError(data);
      if (isQuotaError(error)) {
        embeddingBackoffUntil = Date.now() + error.retryDelay;
        throw createEmbeddingError('EMBEDDING_QUOTA_EXHAUSTED', 'Gemini embedding quota or rate limit was reached.', 429, error);
      }
      throw createEmbeddingError('EMBEDDING_UNAVAILABLE', 'Gemini embedding request failed.', 502, error);
    }

    const values = data?.embedding?.values;
    const valid = Array.isArray(values)
      && values.length === EMBEDDING_DIMENSIONS
      && values.every((value) => Number.isFinite(Number(value)));

    if (!valid) {
      throw createEmbeddingError(
        'EMBEDDING_INVALID_RESPONSE',
        `Gemini returned an invalid embedding. Expected ${EMBEDDING_DIMENSIONS} numeric values.`,
        502,
      );
    }

    return values.map(Number);
  } catch (err) {
    if (err?.isEmbeddingError) throw err;
    throw createEmbeddingError('EMBEDDING_UNAVAILABLE', 'Gemini embedding request failed.', 502, err);
  }
}
