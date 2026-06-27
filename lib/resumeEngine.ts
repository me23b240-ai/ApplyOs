const STOPWORDS = new Set([
  "the","a","an","and","or","to","for","of","in","on","with","at","by",
  "is","are","was","were","be","been","being","this","that","as","from",
]);

export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w);
}

export function getMatchedKeywords(resume: string, jobDesc: string): string[] {
  const keywords = extractKeywords(jobDesc);
  const lower = resume.toLowerCase();
  return keywords.filter((k) => lower.includes(k));
}

export function getMissingKeywords(resume: string, jobDesc: string): string[] {
  const keywords = extractKeywords(jobDesc);
  const lower = resume.toLowerCase();
  return keywords.filter((k) => !lower.includes(k));
}

export async function analyzeResume(
  resume: string,
  jobDesc: string
): Promise<string> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) throw new Error("HF_API_KEY is not set.");

  const prompt = `<s>[INST] You are an expert resume coach. Analyze the resume against the job description and return ONLY a valid JSON object with this exact structure, no other text:
{"overallScore":85,"summary":"Two sentence summary here.","sections":[{"name":"Professional Summary","score":80,"status":"Needs Work","feedback":"Feedback here.","suggestions":["suggestion 1","suggestion 2","suggestion 3"]},{"name":"Experience","score":75,"status":"Needs Work","feedback":"Feedback here.","suggestions":["suggestion 1","suggestion 2","suggestion 3"]},{"name":"Skills","score":90,"status":"Good","feedback":"Feedback here.","suggestions":["suggestion 1","suggestion 2","suggestion 3"]},{"name":"Education","score":85,"status":"Good","feedback":"Feedback here.","suggestions":["suggestion 1","suggestion 2","suggestion 3"]}],"missingKeywords":["keyword1","keyword2","keyword3","keyword4","keyword5"],"quickWins":["quick win 1","quick win 2","quick win 3"]}

RESUME:
${resume.slice(0, 1500)}

JOB DESCRIPTION:
${jobDesc.slice(0, 800)}

Return only the JSON, nothing else. [/INST]`;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.3,
          return_full_text: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} — ${err}`);
  }

  const data = await response.json();

  // HF returns array of generated text
  const raw = Array.isArray(data)
    ? data[0]?.generated_text
    : data?.generated_text;

  if (!raw) throw new Error("Empty response from HuggingFace");

  // Extract JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return jsonMatch[0].trim();
}