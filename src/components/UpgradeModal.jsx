import { useState } from "react";
import { submitUpgradeRequest } from "../lib/api.js";

/* Payment details are read from build-time env vars. Fall back to clearly-fake
   placeholders so the dev can spot anything they forgot to configure.
   Bank transfer (IBAN) is OPTIONAL — only shown if VITE_IBAN is configured. */
const ZAIN_NUMBER  = import.meta.env.VITE_ZAIN_CASH || "0780-xxx-xxxx";
const QI_NUMBER    = import.meta.env.VITE_QI_CARD   || "xxxx-xxxx-xxxx-xxxx";
const IBAN         = import.meta.env.VITE_IBAN      || "";
const BANK_NAME    = import.meta.env.VITE_BANK_NAME || "Rafidain Bank";
const TG_HANDLE    = import.meta.env.VITE_TELEGRAM  || "altaan_support";
const PRICE_LABEL  = import.meta.env.VITE_PRICE_LABEL || "7,500 IQD / month";

const METHODS = [
  { id: "zaincash", label: "Zain Cash", icon: "📱", detailLabel: "Send to phone number", detail: ZAIN_NUMBER },
  { id: "qicard",   label: "Qi Card",   icon: "💳", detailLabel: "Transfer to Qi number", detail: QI_NUMBER  },
  /* Bank transfer is only included if you've configured VITE_IBAN.
     Recommended: leave VITE_IBAN unset until you have a dedicated
     business bank account, separate from your personal spending card. */
  ...(IBAN ? [{ id: "bank", label: "Bank Transfer", icon: "🏦", detailLabel: BANK_NAME + " — IBAN", detail: IBAN }] : []),
];

export default function UpgradeModal({ onClose, reason, onSubmitted }) {
  const [step, setStep] = useState("choose"); // choose | form | done
  const [method, setMethod] = useState("zaincash");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const m = METHODS.find((x) => x.id === method);

  async function submit() {
    setBusy(true); setErr("");
    try {
      await submitUpgradeRequest({ method, reference, amount, notes });
      setStep("done");
      onSubmitted && onSubmitted();
    } catch (e) {
      setErr(e.message || "Could not submit");
      setBusy(false);
    }
  }

  function copy(text) {
    try { navigator.clipboard.writeText(text); } catch {}
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Upgrade to Premium</h2>
        {reason && <p style={{ color: "#b45309", marginBottom: 14, fontSize: 14 }}>{reason}</p>}

        {step === "choose" && (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{PRICE_LABEL}</strong> — unlimited rule-based humanizing plus 50,000 AI-rewritten words/month.
            </p>
            <p style={{ fontSize: 13, color: "#475569", marginTop: -4 }}>
              Pay with any of the methods below, then submit the transaction reference. We verify and activate within a few hours.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
              {METHODS.map((opt) => (
                <button
                  key={opt.id}
                  className="btn-secondary"
                  onClick={() => setMethod(opt.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderColor: method === opt.id ? "#0f172a" : "#cbd5e1",
                    background: method === opt.id ? "#f8fafc" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 18 }}>
                    <span style={{ marginRight: 8 }}>{opt.icon}</span>
                    <strong>{opt.label}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{opt.detailLabel}:</div>
                  <div style={{ fontSize: 14, fontFamily: "ui-monospace, SFMono-Regular, monospace", marginTop: 2 }}>
                    {opt.detail}
                    <button
                      onClick={(e) => { e.stopPropagation(); copy(opt.detail); }}
                      style={{
                        marginLeft: 8, fontSize: 11, padding: "2px 6px",
                        border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", cursor: "pointer",
                      }}
                    >copy</button>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: "#475569", background: "#f1f5f9", padding: 12, borderRadius: 6, marginBottom: 14 }}>
              After paying, message us on Telegram <a href={`https://t.me/${TG_HANDLE.replace(/^@/, "")}`} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>@{TG_HANDLE.replace(/^@/, "")}</a> with your transaction screenshot — or submit the reference number below and we'll match it.
            </div>

            <button className="btn-primary" onClick={() => setStep("form")}>
              I've paid — submit reference
            </button>
            <button onClick={onClose} style={ghostBtn}>Not now</button>
          </>
        )}

        {step === "form" && (
          <>
            <p style={{ marginTop: 0, fontSize: 14 }}>
              Submit the transaction reference for your <strong>{m.label}</strong> payment to <code style={mono}>{m.detail}</code>.
            </p>

            <label style={lbl}>Transaction / reference number *</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "zaincash" ? "e.g. ZC1234567890" : method === "qicard" ? "Last 4 of sender card + time" : "Bank reference / transfer ID"}
              style={input}
              autoFocus
            />

            <label style={lbl}>Amount paid (IQD) — optional</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="7500"
              style={input}
            />

            <label style={lbl}>Notes — optional</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know (e.g. paid from a different phone, sent screenshot on Telegram)"
              rows={3}
              style={{ ...input, fontFamily: "inherit", resize: "vertical" }}
            />

            {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "6px 0" }}>{err}</p>}

            <button className="btn-primary" onClick={submit} disabled={busy || reference.trim().length < 3}>
              {busy ? "Submitting…" : "Submit for verification"}
            </button>
            <button onClick={() => setStep("choose")} style={ghostBtn}>Back</button>
          </>
        )}

        {step === "done" && (
          <>
            <div style={{ textAlign: "center", padding: "12px 0 6px" }}>
              <div style={{ fontSize: 42 }}>✓</div>
              <h3 style={{ margin: "6px 0" }}>Submitted</h3>
              <p style={{ color: "#475569", fontSize: 14 }}>
                We received your payment claim. We'll verify it and activate Premium within a few hours.
              </p>
              <p style={{ color: "#475569", fontSize: 14 }}>
                Reach us on Telegram <a href={`https://t.me/${TG_HANDLE.replace(/^@/, "")}`} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>@{TG_HANDLE.replace(/^@/, "")}</a> if anything's wrong.
              </p>
            </div>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: "#64748b", margin: "10px 0 4px" };
const input = {
  width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 6,
  fontSize: 14, boxSizing: "border-box",
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 13 };
const ghostBtn = {
  marginTop: 10, width: "100%", background: "none", border: 0,
  color: "#64748b", fontSize: 13, padding: 8, cursor: "pointer",
};
