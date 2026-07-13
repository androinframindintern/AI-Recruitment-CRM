const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function stripFence(text: string) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY is not set in Supabase Edge Function secrets' }, 500);

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
    const apiUrl = Deno.env.get('GEMINI_API_URL') || 'https://generativelanguage.googleapis.com/v1beta';
    const { resumeText = '', fileName = 'resume' } = await req.json().catch(() => ({}));
    const cleanText = String(resumeText || '').trim();

    if (!cleanText) return jsonResponse({ error: 'resumeText is required' }, 400);

    const prompt = `Extract a structured recruitment profile from this resume text. Return only valid JSON with exactly these keys:
{
  "full_name": "",
  "email": "",
  "phone": "",
  "summary": "",
  "current_company": "",
  "current_title": "",
  "years_experience": 0,
  "skills": [],
  "education": [{ "degree": "", "institution": "", "year": "" }],
  "experience": [{ "company": "", "title": "", "start_date": "", "end_date": "", "location": "", "highlights": [] }],
  "location": ""
}
Rules:
- Return JSON only. No markdown.
- skills must be an array of concise strings.
- education must always be an array of objects. If no education is found, return [].
- experience must always be an array of objects. Include internships, freelance, executive roles, and fresher status when present. If no experience is found, return [].
- highlights must always be an array of strings.
- years_experience must be a number. Estimate from dated roles if explicit years are missing.
- current_title and current_company should come from the most recent role when available.
- If a field is missing, use an empty string, 0, or [] according to the schema.

File name: ${fileName}

Resume text:
${cleanText.slice(0, 18000)}`;

    const response = await fetch(`${apiUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return jsonResponse({ error: data?.error?.message || 'Gemini request failed', details: data?.error || data }, 502);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '{}';
    const parsed = JSON.parse(stripFence(text));

    return jsonResponse({ profile: parsed });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Resume parsing failed' }, 500);
  }
});
