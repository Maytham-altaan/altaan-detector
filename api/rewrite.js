/* POST /api/rewrite
   Body: { text, style }   Auth: Bearer <session-token>
   Returns: { rewritten, usage:{used,limit,period} }
   - Verifies session
   - Checks per-period word limit (free: daily, premium: monthly)
   - Calls the Anthropic Messages API with a humanize prompt
   - Adds word count to usage and returns new totals */

import { withCors, readJSON } from "./_lib/cors.js";
import { getAuthEmail } from "./_lib/auth.js";
import { getUser, getUsage, addUsage } from "./_lib/store.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.REWRITE_MODEL || "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a humanizing paraphraser. Your job is to rewrite AI-generated text so it reads like a real person wrote it.

Rules:
- Preserve the meaning exactly.
- Use plainer, more direct vocabulary. Avoid words AI overuses: leverage, harness, paramount, robust, comprehensive, ever-evolving, foster, navigate (as a metaphor), unprecedented, transformative, holistic, groundbreaking, fascinating, dive into, in today's world, plays a crucial role, it is important to note.
- Vary sentence length. Mix short sentences with longer ones.
- Drop hedging filler ("it is important to", "needless to say").
- Don't add new information. Don't change facts. Don't add disclaimers.
- Output ONLY the rewritten text. No preamble, no quotes, no labels.`;

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

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

  /* Call Anthropic */
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
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Rewrite this so it reads as human-written (style: ${style}):\n\n${text}` },
      ],
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error("Anthropic error", r.status, errText);
    return res.status(502).json({ error: "AI provider error" });
  }
  const data = await r.json();
  const rewritten = (data.content && data.content[0] && data.content[0].text || "").trim();
  if (!rewritten) return res.status(502).json({ error: "Empty rewrite" });

  /* Bill the actual output word count */
  const outWords = countWords(rewritten);
  const used = await addUsage(email, user.plan, outWords);

  res.status(200).json({
    rewritten,
    usage: { used, limit: usage.limit, period: usage.period },
  });
});
