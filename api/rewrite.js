/* POST /api/rewrite
   Body: { text, style }   Auth: Bearer <session-token>
   Returns: { rewritten, usage:{used,limit,period} }

   The AI provider is configurable via LLM_PROVIDER env var:
     - "groq"      (default) — uses Groq's OpenAI-compatible API. Has a real
                   free tier (no credit card needed). Model defaults to
                   Llama 3.3 70B Versatile.
     - "anthropic" — uses Claude API. Requires ANTHROPIC_API_KEY. Paid per use.

   For the Iraqi MVP we default to Groq because it's free up to ~14k
   requests/day, which covers the first hundred-ish premium users at no
   marginal cost. */

import { withCors, readJSON } from "./_lib/cors.js";
import { getAuthEmail } from "./_lib/auth.js";
import { getUser, getUsage, addUsage } from "./_lib/store.js";

const PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();
const GROQ_KEY = process.env.GROQ_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.REWRITE_MODEL || (
  PROVIDER === "anthropic" ? "claude-haiku-4-5" : "llama-3.3-70b-versatile"
);

const SYSTEM_PROMPT = `You are a humanizing paraphraser. Your job is to rewrite AI-generated text so it reads like a real person wrote it.

Rules:
- Preserve the meaning exactly. Do not add or remove information.
- Use plainer, more direct vocabulary. Avoid words AI overuses: leverage, harness, paramount, robust, comprehensive, ever-evolving, foster, navigate (as a metaphor), unprecedented, transformative, holistic, groundbreaking, fascinating, dive into, in today's world, plays a crucial role, it is important to note, delve, intricate, multifaceted, tapestry, realm, myriad, plethora, pivotal, paradigm, synergy.
- Vary sentence length. Mix short sentences (5-8 words) with medium ones. Don't write 4 sentences that are all the same length — that pattern is the strongest AI tell.
- Drop hedging filler ("it is important to note that", "needless to say", "it should be noted").
- Avoid triadic lists ("X, Y, and Z"). Use pairs or single examples instead.
- Use contractions where natural (it's, that's, you're).
- Don't add disclaimers, qualifications, or transitional phrases that weren't in the original.
- Output ONLY the rewritten text. No preamble, no quotes, no labels, no "Here is the rewritten text:".`;

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

/* --- Provider adapters: each returns { text } or throws --- */

async function callGroq({ system, userMsg }) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: userMsg },
      ],
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error("Groq error", r.status, errText);
    throw new Error(`AI provider error (${r.status})`);
  }
  const data = await r.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message
                && data.choices[0].message.content || "").trim();
  if (!text) throw new Error("Empty rewrite from Groq");
  return text;
}

async function callAnthropic({ system, userMsg }) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error("Anthropic error", r.status, errText);
    throw new Error(`AI provider error (${r.status})`);
  }
  const data = await r.json();
  const text = (data.content && data.content[0] && data.content[0].text || "").trim();
  if (!text) throw new Error("Empty rewrite from Anthropic");
  return text;
}

async function rewriteWithProvider(args) {
  if (PROVIDER === "anthropic") return await callAnthropic(args);
  return await callGroq(args);
}

/* --- Handler --- */

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "Not signed in" });

  const { text, style = "neutral" } = await readJSON(req);
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Missing text" });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: "Text too long. Max 4000 chars per request." });
  }

  const user = (await getUser(email)) || { email, plan: "free" };
  const usage = await getUsage(email, user.plan);
  const inWords = countWords(text);

  if (usage.used + inWords > usage.limit) {
    return res.status(402).json({
      error: "Usage limit reached",
      usage,
      upgrade: user.plan !== "premium",
    });
  }

  let rewritten;
  try {
    rewritten = await rewriteWithProvider({
      system: SYSTEM_PROMPT,
      userMsg: `Rewrite this so it reads as human-written (style: ${style}):\n\n${text}`,
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || "AI provider error" });
  }

  /* Bill the actual output word count */
  const outWords = countWords(rewritten);
  const used = await addUsage(email, user.plan, outWords);

  res.status(200).json({
    rewritten,
    usage: { used, limit: usage.limit, period: usage.period },
    provider: PROVIDER,
    model: MODEL,
  });
});
