/* ================================================================
   ALTAAN DETECTOR — Analysis engine
   ----------------------------------------------------------------
   Pure functions for tokenising, detecting AI phrases, sentence
   splitting, sentence-level AI scoring, verdict bucketing, and
   morphology-aware word swapping.
   ================================================================ */

import { LEXICON, PHRASES, AI_OPENERS, HEDGES } from "../data/lexicon.js";

/* ---------------------------------------------------------------
   TOKENISER  — words + gaps, so the text rebuilds exactly
   --------------------------------------------------------------- */
export function tokenize(text) {
  const tokens = [];
  const re = /([A-Za-z][A-Za-z'’-]*)|([^A-Za-z]+)/g;
  let m, id = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      const word = m[1];
      const clean = word.toLowerCase().replace(/['’]/g, "'").replace(/-/g, "");
      const cleanHyphen = word.toLowerCase().replace(/['’]/g, "'");
      const def = LEXICON[clean] || LEXICON[cleanHyphen];
      tokens.push({
        id: id++, type: "word", text: word, clean, cleanHyphen,
        score: def ? def.w : 0, alt: def ? def.alt : null,
      });
    } else {
      tokens.push({ id: id++, type: "gap", text: m[2] });
    }
  }
  return tokens;
}

export function detectPhrases(tokens) {
  const wordIdx = tokens.map((t, i) => (t.type === "word" ? i : -1)).filter(i => i >= 0);
  const hits = [];
  const used = new Set();
  for (let p = 0; p < wordIdx.length; p++) {
    for (let len = 6; len >= 2; len--) {
      if (p + len > wordIdx.length) continue;
      const slice = [];
      for (let k = 0; k < len; k++) slice.push(wordIdx[p + k]);
      if (slice.some(i => used.has(i))) continue;
      const startTok = slice[0], endTok = slice[len - 1];
      const phraseText = tokens.slice(startTok, endTok + 1).map(t => t.text).join("")
        .toLowerCase().replace(/['’]/g, "'").trim();
      const def = PHRASES[phraseText];
      if (def) {
        hits.push({ startTok, endTok, def, key: phraseText });
        slice.forEach(i => used.add(i));
        break;
      }
    }
  }
  return hits;
}

/* ---------------------------------------------------------------
   SENTENCE SPLITTER — keeps character offsets for highlighting
   --------------------------------------------------------------- */
export function splitSentences(text) {
  const out = [];
  const re = /[^.!?]+[.!?]+(?:["'’”)\]]*)|[^.!?]+$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (raw.trim().length === 0) continue;
    out.push({ raw, start: m.index, end: m.index + raw.length });
  }
  if (out.length === 0 && text.trim().length)
    out.push({ raw: text, start: 0, end: text.length });
  return out;
}

/* ---------------------------------------------------------------
   SENTENCE SCORING — the core detector heuristic
   --------------------------------------------------------------- */
export function scoreSentence(sentence, allLengths) {
  const words = sentence.toLowerCase().match(/[a-z][a-z'’-]*/g) || [];
  const wc = words.length;
  const signals = [];
  let pts = 0;

  /* 1. AI-vocabulary density */
  let lexHits = 0, lexWeight = 0;
  words.forEach(w => {
    const c = w.replace(/['’]/g, "'").replace(/-/g, "");
    const d = LEXICON[c] || LEXICON[w.replace(/['’]/g, "'")];
    if (d) { lexHits++; lexWeight += d.w; }
  });
  if (lexHits > 0) {
    const density = lexWeight / Math.max(wc, 1);
    const p = Math.min(40, Math.round(density * 78) + Math.min(12, lexHits * 3));
    pts += p;
    signals.push({
      label: "AI-favoured vocabulary",
      detail: lexHits + " flagged term" + (lexHits > 1 ? "s" : "") + " in this sentence",
      pts: p,
    });
  }

  /* 1b. canned multi-word AI phrases */
  let phraseHits = 0, phraseWeight = 0;
  const lowSent = sentence.toLowerCase().replace(/['’]/g, "'");
  for (const phr in PHRASES) {
    if (lowSent.indexOf(phr) >= 0) {
      phraseHits++;
      phraseWeight += PHRASES[phr].w;
    }
  }
  if (phraseHits > 0) {
    const p = Math.min(30, phraseWeight * 5 + phraseHits * 3);
    pts += p;
    signals.push({
      label: "Stock AI phrase",
      detail: phraseHits + " canned multi-word AI phrase" + (phraseHits > 1 ? "s" : ""),
      pts: p,
    });
  }

  /* 2. predictable opener */
  const low = sentence.trim().toLowerCase();
  const opener = AI_OPENERS.find(o => low.startsWith(o + " ") || low.startsWith(o + ","));
  if (opener) {
    pts += 12;
    signals.push({
      label: "Formulaic opener",
      detail: "starts with “" + opener + "” — a common AI sentence opener",
      pts: 12,
    });
  }

  /* 3. hedging / filler */
  let hedgeHits = 0;
  HEDGES.forEach(h => { if (low.includes(h)) hedgeHits++; });
  if (hedgeHits > 0) {
    const p = Math.min(16, hedgeHits * 9);
    pts += p;
    signals.push({
      label: "Hedging / filler phrasing",
      detail: hedgeHits + " filler construction" + (hedgeHits > 1 ? "s" : ""),
      pts: p,
    });
  }

  /* 4. sentence length vs document — uniformity & long-windedness */
  if (allLengths.length >= 3) {
    const mean = allLengths.reduce((a, b) => a + b, 0) / allLengths.length;
    const variance = allLengths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / allLengths.length;
    const sd = Math.sqrt(variance);
    if (sd < 6 && allLengths.length >= 4) {
      pts += 10;
      signals.push({
        label: "Uniform rhythm",
        detail: "all sentences are a similar length — low “burstiness”",
        pts: 10,
      });
    }
    if (wc > 26) {
      pts += 8;
      signals.push({
        label: "Long, dense sentence",
        detail: wc + " words — AI tends to pack clauses together",
        pts: 8,
      });
    }
  }

  /* 5. parallel "X, Y, and Z" triadic list */
  const commaCount = (sentence.match(/,/g) || []).length;
  if (commaCount >= 2 && /\band\b/.test(low)) {
    pts += 7;
    signals.push({
      label: "Triadic list structure",
      detail: "balanced “A, B, and C” listing — a frequent AI pattern",
      pts: 7,
    });
  }

  /* 6. no concrete detail */
  const hasNumber = /\d/.test(sentence);
  if (wc >= 12 && !hasNumber) {
    pts += 4;
    signals.push({
      label: "No concrete detail",
      detail: "no numbers or specifics — reads generic",
      pts: 4,
    });
  }

  const score = Math.max(0, Math.min(100, pts));
  return { score, signals, wordCount: wc };
}

export function verdictOf(score) {
  if (score >= 55) return { key: "ai", label: "Likely AI", cls: "sv-ai" };
  if (score >= 28) return { key: "refined", label: "AI-refined", cls: "sv-refined" };
  return { key: "human", label: "Likely human", cls: "sv-human" };
}

export function docVerdictOf(score) {
  if (score >= 60) return { label: "Likely AI-generated", cls: "big-ai" };
  if (score >= 30) return { label: "Possibly AI-refined", cls: "big-refined" };
  return { label: "Likely human-written", cls: "big-human" };
}

/* ---------------------------------------------------------------
   MORPHOLOGY — match case & re-inflect replacements
   --------------------------------------------------------------- */
export function matchCase(original, replacement) {
  if (!replacement) return replacement;
  if (original === original.toUpperCase() && original.length > 1)
    return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase())
    return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function inflectForm(verb, form) {
  const v = verb;
  if (form === "ing") {
    if (v.endsWith("ie")) return v.slice(0, -2) + "ying";
    if (v.endsWith("e") && !/(ee|ye|oe)$/.test(v)) return v.slice(0, -1) + "ing";
    if (/^[a-z]+$/.test(v) && v.length >= 3 && /[bcdfghjklmnpqrstvz][aeiou][bcdfgklmnprt]$/.test(v))
      return v + v[v.length - 1] + "ing";
    return v + "ing";
  }
  if (form === "s") {
    if (/(s|x|z|sh|ch)$/.test(v)) return v + "es";
    if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ies";
    return v + "s";
  }
  if (form === "ed") {
    if (v.endsWith("e")) return v + "d";
    if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ied";
    if (/^[a-z]+$/.test(v) && v.length >= 3 && /[bcdfghjklmnpqrstvz][aeiou][bcdfgklmnprt]$/.test(v))
      return v + v[v.length - 1] + "ed";
    return v + "ed";
  }
  return v;
}

/* short adjectives / determiners that should not take verb-style inflection */
const NO_INFLECT_REPL = new Set([
  "new","old","good","bad","big","small","top","best","key","main",
  "fresh","clean","clear","strong","weak","fast","slow","easy","hard",
  "fine","real","true","right","wrong","full","empty","odd","plain",
  "most","more","less","very","really","quite","much","many","few",
  "rare","brief","short","long","high","low","late","early","whole",
  "important","central","major","minor","useful","valuable",
]);

export function inflectMatch(original, replacement) {
  if (!replacement) return replacement;
  const o = original.toLowerCase().replace(/['’]/g, "'");
  const m = replacement.match(/^([A-Za-z]+)(.*)$/);
  if (!m) return replacement;
  let first = m[1].toLowerCase();
  const rest = m[2];
  if (first.length <= 2 || /^(the|a|an|to|of|in|on|by|for|at|is|was|has|does|us)$/.test(first))
    return replacement;
  if (NO_INFLECT_REPL.has(first)) return replacement;
  if (/ing$/.test(o) && !/ing$/.test(first)) first = inflectForm(first, "ing");
  else if (/ied$/.test(o)) first = inflectForm(first.replace(/(ie|y|ies)$/, ""), "ed");
  else if (/ed$/.test(o) && !/ed$/.test(first) && first !== "ed") first = inflectForm(first, "ed");
  else if (/ies$/.test(o) && !/ies$/.test(first)) first = inflectForm(first, "s");
  else if (/(es)$/.test(o) && !/(s|x|z|sh|ch)es$/.test(first) && !/s$/.test(first)) first = inflectForm(first, "s");
  else if (/[^s]s$/.test(o) && !/s$/.test(first)) first = inflectForm(first, "s");
  return first + rest;
}
