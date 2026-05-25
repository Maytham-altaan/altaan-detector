import { useCallback, useMemo, useState } from "react";
import {
  tokenize, detectPhrases, splitSentences, scoreSentence,
  verdictOf, docVerdictOf, matchCase, inflectMatch,
} from "../lib/analysis.js";
import { MODES } from "../data/lexicon.js";
import { thesaurusLookup } from "../data/thesaurus.js";
import { rewriteSentence } from "../lib/api.js";
import "./humanizer.css";

const SAMPLE =
  "In today's world, leveraging cutting-edge technology plays a crucial " +
  "role in the realm of healthcare. It is important to note that a " +
  "comprehensive and robust framework can facilitate seamless workflows, " +
  "ultimately empowering clinicians to navigate an ever-evolving " +
  "landscape. Moreover, this groundbreaking approach fosters a rich " +
  "tapestry of meticulous, data-driven solutions. Furthermore, it " +
  "underscores the pivotal interplay between innovation and patient care.";

/* Inline-style object kept from the original prototype so the visual
   identity carries over verbatim. Selector-based CSS lives in humanizer.css. */
const S = {
  card: { background:"#fff", border:"1px solid #e2e8f0", borderRadius:14,
    padding:18, marginBottom:16, boxShadow:"0 1px 2px rgba(15,23,42,0.04)" },
  scoreCard: { display:"flex", alignItems:"center", gap:22, flexWrap:"wrap" },
  scoreSide: { flex:1, minWidth:230 },
  scoreText: { margin:"6px 0 10px", fontSize:14, color:"#475569", lineHeight:1.55 },
  verdictPills: { display:"flex", gap:8, flexWrap:"wrap" },
  outputCard: { background:"#f8fafc" },
  label: { display:"block", fontSize:12, fontWeight:700, letterSpacing:"0.06em",
    textTransform:"uppercase", color:"#94a3b8", marginBottom:8 },
  textarea: { width:"100%", border:"1px solid #cbd5e1", borderRadius:8, padding:12,
    fontSize:16, lineHeight:1.6, fontFamily:"inherit", resize:"vertical",
    boxSizing:"border-box", outline:"none" },
  tabRow: { display:"flex", gap:4, marginBottom:16 },
  tab: { flex:1, background:"#f1f5f9", border:"1px solid #e2e8f0",
    borderRadius:9, padding:"9px 0", fontSize:14, cursor:"pointer",
    color:"#475569", fontWeight:600 },
  tabActive: { background:"#0f172a", color:"#fff", borderColor:"#0f172a" },
  legend: { display:"flex", gap:16, flexWrap:"wrap", marginBottom:10 },
  legItem: { display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#64748b" },
  hint: { fontSize:13, color:"#64748b", margin:"0 0 12px" },
  canvas: { fontSize:17, lineHeight:2, color:"#0f172a" },
  sentList: { display:"flex", flexDirection:"column", gap:6, marginTop:14 },
  ctrlRow: { display:"flex", gap:8, alignItems:"center", flexWrap:"wrap",
    marginBottom:12 },
  ctrlLabel: { fontSize:12, color:"#64748b", fontWeight:600, letterSpacing:"0.04em",
    textTransform:"uppercase" },
  segBtn: { padding:"7px 12px", background:"#fff", border:"1px solid #cbd5e1",
    borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", color:"#334155" },
  segBtnActive: { background:"#0f172a", color:"#fff", borderColor:"#0f172a" },
  btnGhost: { padding:"7px 12px", background:"#fff", border:"1px solid #e2e8f0",
    borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", color:"#475569" },
  output: { fontSize:16, lineHeight:1.7, margin:0, whiteSpace:"pre-wrap" },
  outHead: { display:"flex", alignItems:"center", justifyContent:"space-between",
    marginBottom:8 },
  btnCopy: { background:"#0f172a", color:"#fff", border:0, borderRadius:7,
    padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer" },
  footer: { fontSize:12, color:"#94a3b8", lineHeight:1.6, marginTop:16 },
  miniRow: { display:"flex", gap:14, marginTop:12 },
  mini: { display:"flex", flexDirection:"column" },
  miniN: { fontSize:22, fontWeight:700, lineHeight:1 },
  miniL: { fontSize:11, color:"#64748b", marginTop:3 },
};

export default function Humanizer({ user, onNeedAuth, onNeedUpgrade, onUsageUsed }) {
  const [raw, setRaw] = useState(SAMPLE);
  const [swaps, setSwaps] = useState({});
  const [phraseSwaps, setPhraseSwaps] = useState({});
  const [active, setActive] = useState(null);
  const [activePhrase, setActivePhrase] = useState(null);
  const [minWeight, setMinWeight] = useState(1);
  const [mode, setMode] = useState("general");
  const [tab, setTab] = useState("detector");
  const [openSentence, setOpenSentence] = useState(null);
  const [sentenceRewrites, setSentenceRewrites] = useState({}); // idx -> new text
  const [rewriting, setRewriting] = useState({});               // idx -> bool
  const [rewriteError, setRewriteError] = useState("");

  const tokens = useMemo(() => tokenize(raw, mode), [raw, mode]);
  const phrases = useMemo(() => detectPhrases(tokens, mode), [tokens, mode]);

  const { phraseByStart, coveredByPhrase } = useMemo(() => {
    const byStart = {}, covered = {};
    phrases.forEach(ph => {
      if (ph.def.w < minWeight) return;
      byStart[ph.startTok] = ph;
      for (let i = ph.startTok; i <= ph.endTok; i++) covered[i] = ph;
    });
    return { phraseByStart: byStart, coveredByPhrase: covered };
  }, [phrases, minWeight]);

  /* working text: tokens with word/phrase swaps applied */
  const workingTextBase = useMemo(() => {
    let res = "", i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      const ph = phraseByStart[i];
      if (ph && phraseSwaps[ph.startTok + "-" + ph.endTok] !== undefined) {
        const repl = phraseSwaps[ph.startTok + "-" + ph.endTok];
        res += matchCase(tokens[ph.startTok].text, repl);
        i = ph.endTok + 1; continue;
      }
      res += t.type === "word" ? (swaps[t.id] ?? t.text) : t.text;
      i++;
    }
    return res
      .replace(/\b(\w+)\s+\1\b/gi, "$1")
      .replace(/\bthe\s+(a|an)\b/gi, "$1")
      .replace(/\b(a|an)\s+(a|an)\b/gi, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1");
  }, [tokens, swaps, phraseSwaps, phraseByStart]);

  /* layer in AI-rewritten sentences on top of the base working text */
  const workingText = useMemo(() => {
    if (Object.keys(sentenceRewrites).length === 0) return workingTextBase;
    const sents = splitSentences(workingTextBase);
    return sents.map((s, i) => {
      if (sentenceRewrites[i] !== undefined) return sentenceRewrites[i];
      return s.raw;
    }).join(" ").replace(/\s+/g, " ").trim();
  }, [workingTextBase, sentenceRewrites]);

  /* DETECTOR analysis over the (possibly AI-rewritten) working text */
  const analysis = useMemo(() => {
    const sents = splitSentences(workingText);
    const lengths = sents.map(s => (s.raw.toLowerCase().match(/[a-z][a-z'’-]*/g) || []).length);
    const scored = sents.map((s, i) => {
      const r = scoreSentence(s.raw, lengths, mode);
      return { ...s, ...r, idx: i, verdict: verdictOf(r.score),
        aiRewritten: sentenceRewrites[i] !== undefined };
    });
    const totalWords = lengths.reduce((a, b) => a + b, 0) || 1;
    let weighted = 0;
    scored.forEach(s => { weighted += s.score * Math.max(s.wordCount, 1); });
    let docScore = weighted / totalWords;
    const aiCount = scored.filter(s => s.verdict.key === "ai").length;
    if (aiCount >= Math.ceil(scored.length / 2) && scored.length >= 3) docScore += 8;
    docScore = Math.max(0, Math.min(100, Math.round(docScore)));
    const counts = {
      ai: scored.filter(s => s.verdict.key === "ai").length,
      refined: scored.filter(s => s.verdict.key === "refined").length,
      human: scored.filter(s => s.verdict.key === "human").length,
    };
    return { sents: scored, docScore, counts, totalWords, sentenceCount: scored.length };
  }, [workingText, sentenceRewrites, mode]);

  const docVerdict = useMemo(() => docVerdictOf(analysis.docScore), [analysis.docScore]);

  const reset = useCallback(() => {
    setSwaps({}); setPhraseSwaps({});
    setSentenceRewrites({}); setRewriting({});
    setActive(null); setActivePhrase(null); setOpenSentence(null);
  }, []);

  const swapAll = useCallback(() => {
    const newPhrase = {}, newWord = {};
    phrases.forEach(ph => {
      if (ph.def.w < minWeight) return;
      const alt = ph.def.alt && ph.def.alt[0];
      if (alt == null) return;
      newPhrase[ph.startTok + "-" + ph.endTok] = alt;
    });
    tokens.forEach(t => {
      if (t.type !== "word") return;
      if (!t.score || t.score < minWeight) return;
      if (coveredByPhrase[t.id]) return;
      const alt = t.alt && t.alt[0];
      if (!alt) return;
      newWord[t.id] = matchCase(t.text, inflectMatch(t.text, alt));
    });
    setPhraseSwaps(s => ({ ...s, ...newPhrase }));
    setSwaps(s => ({ ...s, ...newWord }));
    setActive(null); setActivePhrase(null);
  }, [phrases, tokens, coveredByPhrase, minWeight]);

  /* AI Rewrite Sentence — the premium hook */
  const rewriteSentenceAt = useCallback(async (idx) => {
    if (!user) { onNeedAuth("Sign in to use AI rewrites — free tier includes 200 words/day."); return; }
    if (user.plan !== "premium" && user.usage && user.usage.used >= user.usage.limit) {
      onNeedUpgrade("You've used your free AI words for today. Upgrade for 50,000/month.");
      return;
    }
    const sentence = analysis.sents[idx];
    if (!sentence) return;
    const text = sentence.raw.trim();
    setRewriting(r => ({ ...r, [idx]: true }));
    setRewriteError("");
    try {
      const res = await rewriteSentence(text, "human");
      if (res && res.rewritten) {
        setSentenceRewrites(r => ({ ...r, [idx]: res.rewritten }));
        if (onUsageUsed && res.usage) onUsageUsed(res.usage);
      } else {
        throw new Error("No rewrite returned.");
      }
    } catch (e) {
      if (e.status === 402) onNeedUpgrade("You've reached your AI word limit. Upgrade for 50,000/month.");
      else if (e.status === 401) onNeedAuth("Please sign in again.");
      else setRewriteError(e.message || "Rewrite failed. Try again.");
    } finally {
      setRewriting(r => ({ ...r, [idx]: false }));
    }
  }, [user, analysis.sents, onNeedAuth, onNeedUpgrade, onUsageUsed]);

  const stats = useMemo(() => {
    let w3=0,w2=0,w1=0,words=0;
    tokens.forEach(t => {
      if (t.type !== "word") return;
      words++;
      if (coveredByPhrase[t.id]) return;
      if (t.score === 3) w3++; else if (t.score === 2) w2++; else if (t.score === 1) w1++;
    });
    const pw = Object.keys(phraseByStart).length;
    const flagged = (minWeight<=3?w3:0) + (minWeight<=2?w2:0) + (minWeight<=1?w1:0) + pw;
    return { w3, w2, w1, words, flagged,
      swapped: Object.keys(swaps).length + Object.keys(phraseSwaps).length };
  }, [tokens, swaps, phraseSwaps, phraseByStart, coveredByPhrase, minWeight]);

  const copyOutput = () => navigator.clipboard && navigator.clipboard.writeText(workingText);

  /* ------- render helpers ------- */
  function renderToken(i) {
    const t = tokens[i];
    const ph = phraseByStart[i];
    if (ph) {
      const pkey = ph.startTok + "-" + ph.endTok;
      const swapped = phraseSwaps[pkey] !== undefined;
      const original = tokens.slice(ph.startTok, ph.endTok + 1).map(x => x.text).join("");
      const cls = swapped ? "tok swapped" : ph.def.w === 3 ? "tok w3" : "tok w2";
      return {
        node: (
          <span key={"p" + i} style={{ position: "relative" }}>
            <span className={cls} onClick={() => setActivePhrase(activePhrase === pkey ? null : pkey)}>
              {swapped ? phraseSwaps[pkey] : original}
            </span>
            {activePhrase === pkey && (
              <Popover label={original} weight={ph.def.w} curated={ph.def.alt}
                synonyms={thesaurusLookup(original.split(" ")[0])} swapped={swapped}
                onPick={v => { setPhraseSwaps(s => ({ ...s, [pkey]: v })); setActivePhrase(null); }}
                onUndo={() => { setPhraseSwaps(s => { const n = { ...s }; delete n[pkey]; return n; }); setActivePhrase(null); }}
                onClose={() => setActivePhrase(null)} />
            )}
          </span>
        ),
        next: ph.endTok + 1,
      };
    }
    if (t.type !== "word") return { node: <span key={i}>{t.text}</span>, next: i + 1 };
    const swapped = swaps[t.id] !== undefined;
    const flagged = t.score >= minWeight;
    const cls = swapped ? "tok swapped"
      : flagged && t.score === 3 ? "tok w3"
      : flagged && t.score === 2 ? "tok w2"
      : flagged ? "tok w1" : "tok plain";
    return {
      node: (
        <span key={i} style={{ position: "relative" }}>
          <span className={cls} onClick={() => setActive(active === t.id ? null : t.id)}>
            {swapped ? swaps[t.id] : t.text}
          </span>
          {active === t.id && (
            <Popover label={t.text} weight={t.score} curated={t.alt || []}
              synonyms={thesaurusLookup(t.text)} swapped={swapped}
              onPick={v => { setSwaps(s => ({ ...s, [t.id]: matchCase(t.text, inflectMatch(t.text, v)) })); setActive(null); }}
              onUndo={() => { setSwaps(s => { const n = { ...s }; delete n[t.id]; return n; }); setActive(null); }}
              onClose={() => setActive(null)} />
          )}
        </span>
      ),
      next: i + 1,
    };
  }

  function renderCanvas(showSentenceColor) {
    if (Object.keys(sentenceRewrites).length > 0) {
      // If any sentence is AI-rewritten the per-token canvas can't represent it
      // cleanly, so we drop to a plain rendering with rewritten sentences highlighted.
      const sents = analysis.sents;
      return sents.map((s, i) => (
        <span key={i} className={s.aiRewritten ? "sentence-ai-rewritten" : ""}>
          {s.raw}{i < sents.length - 1 ? " " : ""}
        </span>
      ));
    }
    const tokenOffsets = [];
    let pos = 0;
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      const ph = phraseByStart[k];
      tokenOffsets[k] = pos;
      let text;
      if (ph && ph.startTok === k && phraseSwaps[ph.startTok + "-" + ph.endTok] !== undefined) {
        text = phraseSwaps[ph.startTok + "-" + ph.endTok];
      } else if (t.type === "word") {
        text = swaps[t.id] ?? t.text;
      } else {
        text = t.text;
      }
      pos += text.length;
    }
    const sents = analysis.sents;
    function sentenceAt(offset) {
      for (let s = 0; s < sents.length; s++)
        if (offset >= sents[s].start && offset < sents[s].end) return sents[s];
      return sents.length ? sents[sents.length - 1] : null;
    }
    const out = [];
    let i = 0, groupSent = null, group = [];
    const flush = key => {
      if (group.length === 0) return;
      if (showSentenceColor && groupSent) {
        out.push(<span key={"g" + key} className={"sentbg " + groupSent.verdict.cls}>{group}</span>);
      } else {
        out.push(<span key={"g" + key}>{group}</span>);
      }
      group = [];
    };
    while (i < tokens.length) {
      const sh = sentenceAt(tokenOffsets[i]);
      if (showSentenceColor && sh !== groupSent) { flush(i); groupSent = sh; }
      const { node, next } = renderToken(i);
      group.push(node);
      i = next;
    }
    flush("end");
    return out;
  }

  /* file-upload handler — supports .txt and .docx */
  async function onFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setRewriteError("");
    try {
      const name = file.name.toLowerCase();
      let text = "";
      if (name.endsWith(".txt") || file.type === "text/plain") {
        text = await file.text();
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth/mammoth.browser.js");
        const buf = await file.arrayBuffer();
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        text = r.value || "";
      } else if (name.endsWith(".doc")) {
        throw new Error("Legacy .doc format isn't supported. Please save as .docx and try again.");
      } else {
        throw new Error("Unsupported file type. Use .txt or .docx.");
      }
      if (!text.trim()) throw new Error("The file appears to be empty.");
      /* normalise whitespace; many docx exports use lots of blank paragraphs */
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      setRaw(text);
      reset();
    } catch (err) {
      setRewriteError(err.message || "Could not read file.");
    } finally {
      /* clear the input so re-uploading the same file works */
      e.target.value = "";
    }
  }

  return (
    <>
      {/* INPUT */}
      <section style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ ...S.label, marginBottom: 0 }}>Your text</label>
          <label
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6,
              fontSize: 12, cursor: "pointer", background: "#f8fafc", color: "#334155",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
            title="Upload a .txt or .docx file"
          >
            📎 Upload file
            <input
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFileUpload}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <textarea style={S.textarea} rows={6} value={raw}
          placeholder="Paste a paragraph or essay here, or upload a .txt / .docx file..."
          onChange={e => { setRaw(e.target.value); reset(); }} />
      </section>

      {/* SCORE */}
      <section style={{ ...S.card, ...S.scoreCard }}>
        <Gauge score={analysis.docScore} />
        <div style={S.scoreSide}>
          <div className={"bigVerdict " + docVerdict.cls}>{docVerdict.label}</div>
          <p style={S.scoreText}>
            {analysis.docScore}% of this text reads as AI-written,
            based on {analysis.sentenceCount} sentence{analysis.sentenceCount !== 1 ? "s" : ""} and {analysis.totalWords} words.
          </p>
          <div style={S.verdictPills}>
            <span className="pill sv-ai">{analysis.counts.ai} AI</span>
            <span className="pill sv-refined">{analysis.counts.refined} refined</span>
            <span className="pill sv-human">{analysis.counts.human} human</span>
          </div>
        </div>
      </section>

      {/* TABS */}
      <div style={S.tabRow}>
        <button style={{ ...S.tab, ...(tab === "detector" ? S.tabActive : {}) }} onClick={() => setTab("detector")}>Detector</button>
        <button style={{ ...S.tab, ...(tab === "humanizer" ? S.tabActive : {}) }} onClick={() => setTab("humanizer")}>Humanizer</button>
      </div>

      {rewriteError && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", color:"#991b1b",
          padding:"10px 14px", borderRadius:9, marginBottom:14, fontSize:13 }}>{rewriteError}</div>
      )}

      {tab === "detector" && (
        <section style={S.card}>
          <div style={S.legend}>
            <Legend cls="sv-ai" txt="likely AI" />
            <Legend cls="sv-refined" txt="AI-refined" />
            <Legend cls="sv-human" txt="likely human" />
          </div>
          <p style={S.hint}>
            Sentences are tinted by AI-likelihood. Click <strong>Rewrite with AI</strong> on any flagged sentence to replace it with a human-sounding paraphrase (premium feature).
          </p>
          <div style={S.canvas}>{renderCanvas(true)}</div>
          <div style={S.sentList}>
            {analysis.sents.map(s => (
              <div key={s.idx}>
                <div className={"sentRow " + s.verdict.cls}>
                  <span className={"sv-tag " + s.verdict.cls}>{s.verdict.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{s.score}% AI</span>
                  <span style={{ flex: 1, color: "#334155", fontSize: 13,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    onClick={() => setOpenSentence(openSentence === s.idx ? null : s.idx)}>
                    {s.raw.trim().slice(0, 60)}{s.raw.trim().length > 60 ? "…" : ""}
                  </span>
                  {s.verdict.key !== "human" && !s.aiRewritten && (
                    <button className="rewrite-btn" disabled={!!rewriting[s.idx]}
                      onClick={() => rewriteSentenceAt(s.idx)}
                      title="Rewrite this sentence with AI">
                      <span className="sparkle">✦</span>
                      {rewriting[s.idx] ? "Rewriting…" : "AI Rewrite"}
                    </button>
                  )}
                  {s.aiRewritten && (
                    <span style={{ fontSize: 11, color: "#0891b2", fontWeight: 600 }}>✦ AI-rewritten</span>
                  )}
                </div>
                {openSentence === s.idx && (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: 8, padding: "10px 14px", marginTop: 6, fontSize: 13 }}>
                    {s.signals.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, color: "#475569" }}>
                        {s.signals.map((sig, k) => (
                          <li key={k}>
                            <span style={{ fontWeight: 600, color: "#b45309", marginRight: 5 }}>+{sig.pts}</span>
                            <strong>{sig.label}.</strong> {sig.detail}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, color: "#64748b" }}>No strong AI signals — this sentence reads natural.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "humanizer" && (
        <>
          <div style={S.ctrlRow}>
            <span style={S.ctrlLabel}>Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{
                padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1",
                fontSize: 13, background: "#fff", marginRight: 12,
              }}
              title="Switches which AI tells are flagged. Try Medical or Academic for thesis writing."
            >
              {MODES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <span style={S.ctrlLabel}>Flag sensitivity</span>
            {[[1, "Aggressive"], [2, "Balanced"], [3, "Strict"]].map(([v, lbl]) => (
              <button key={v}
                style={{ ...S.segBtn, ...(minWeight === v ? S.segBtnActive : {}) }}
                onClick={() => setMinWeight(v)}>{lbl}</button>
            ))}
            <button style={S.btnGhost} onClick={swapAll}>Swap all flagged</button>
            <button style={S.btnGhost} onClick={reset}>Reset swaps</button>
          </div>
          <section style={S.card}>
            <div style={S.legend}>
              <Legend cls="w3" txt="very AI-like" />
              <Legend cls="w2" txt="AI-leaning" />
              {minWeight === 1 && <Legend cls="w1" txt="soft flag" />}
              <Legend cls="swapped" txt="swapped" />
            </div>
            <p style={S.hint}>
              Click any word for alternatives. Use <strong>AI Rewrite</strong> on the Detector tab for sentence-level rewrites.
            </p>
            <div style={S.canvas}>{renderCanvas(false)}</div>
            <div style={S.miniRow}>
              <Mini n={stats.words} label="words" tone="neutral" />
              <Mini n={stats.flagged} label="flagged" tone="warn" />
              <Mini n={stats.swapped} label="swapped" tone="good" />
            </div>
          </section>
        </>
      )}

      {/* OUTPUT */}
      <section style={{ ...S.card, ...S.outputCard }}>
        <div style={S.outHead}>
          <label style={S.label}>Working text</label>
          <button style={S.btnCopy} onClick={copyOutput}>Copy</button>
        </div>
        <p style={S.output}>{workingText}</p>
      </section>

      <footer style={S.footer}>
        Heuristic tool, not a forensic detector. The AI Rewrite feature uses a real model and produces fluent paraphrases — the percentage on rule-based output is a rough guide, never proof.
      </footer>
    </>
  );
}

/* --- Sub-components --- */

function Gauge({ score }) {
  const r = 52, c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const color = score >= 60 ? "#dc2626" : score >= 30 ? "#d97706" : "#16a34a";
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="13" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="13"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 70 70)"
        style={{ transition: "stroke-dashoffset .5s ease, stroke .3s ease" }} />
      <text x="70" y="66" textAnchor="middle"
        style={{ fontSize: 30, fontWeight: 800, fill: color }}>{score}%</text>
      <text x="70" y="88" textAnchor="middle"
        style={{ fontSize: 11, fill: "#94a3b8", letterSpacing: "0.08em" }}>AI SCORE</text>
    </svg>
  );
}

function Legend({ cls, txt }) {
  return (
    <span style={S.legItem}>
      <span className={(cls.startsWith("sv") ? "sent " : "tok ") + cls}
        style={{ fontSize: 11, padding: "1px 5px" }}>Aa</span>
      {txt}
    </span>
  );
}

function Mini({ n, label, tone }) {
  const colors = { neutral: "#334155", warn: "#c2410c", good: "#15803d" };
  return (
    <div style={S.mini}>
      <span style={{ ...S.miniN, color: colors[tone] || "#334155" }}>{n}</span>
      <span style={S.miniL}>{label}</span>
    </div>
  );
}

function Popover({ label, weight, curated = [], synonyms = [], swapped, onPick, onUndo, onClose }) {
  const [custom, setCustom] = useState("");
  const allCurated = (curated || []).filter(a => a);
  const others = (synonyms || []).filter(s => s && !allCurated.includes(s)).slice(0, 6);
  return (
    <div className="popover" onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <strong>{label}</strong>
        <button onClick={onClose} style={{ background: "none", border: 0, fontSize: 16, cursor: "pointer", color: "#94a3b8" }}>×</button>
      </div>
      {weight ? (
        <div style={{ fontSize: 11, color: "#92400e", marginBottom: 6 }}>
          {weight === 3 ? "very AI-like" : weight === 2 ? "AI-leaning" : "soft flag"}
        </div>
      ) : null}
      {allCurated.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#059669", marginTop: 4 }}>Humanizing swaps</div>
          {allCurated.map((a, i) => (
            <button key={"c" + i} className="alt curated" onClick={() => onPick(a)}>{a}</button>
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginTop: 6 }}>Other synonyms</div>
          {others.map((a, i) => <button key={"o" + i} className="alt" onClick={() => onPick(a)}>{a}</button>)}
        </>
      )}
      <div style={{ marginTop: 8 }}>
        <input
          className="field"
          style={{ fontSize: 13, padding: "6px 9px" }}
          placeholder="Type your own…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && custom.trim()) onPick(custom.trim()); }}
        />
      </div>
      {swapped && (
        <button className="btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={onUndo}>Undo swap</button>
      )}
    </div>
  );
}
