import { useEffect, useState, useCallback } from "react";
import { adminListPending, adminApprove, adminReject } from "../lib/api.js";

const METHOD_LABEL = { zaincash: "Zain Cash", qicard: "Qi Card", bank: "Bank Transfer" };

export default function AdminPage({ user }) {
  const [pendings, setPendings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actingOn, setActingOn] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await adminListPending();
      setPendings(r.pendings || []);
    } catch (e) {
      setErr(e.message || "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(email) {
    setActingOn(email);
    try {
      await adminApprove(email, 30);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setActingOn(null); }
  }
  async function reject(email) {
    if (!confirm(`Reject ${email}? This deletes their pending request without granting premium.`)) return;
    setActingOn(email);
    try {
      await adminReject(email);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setActingOn(null); }
  }

  if (!user) return <p style={{ padding: 20 }}>Sign in first.</p>;
  if (!user.is_admin) return (
    <div style={{ padding: 20 }}>
      <h2>Admin</h2>
      <p style={{ color: "#dc2626" }}>You are not an admin. Add your email to <code>ADMIN_EMAILS</code> env var in Vercel.</p>
    </div>
  );

  return (
    <div style={{ padding: "20px 0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Pending payments</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <a href="/" className="btn-secondary" style={{ textDecoration: "none", display: "inline-block" }}>← Back to app</a>
        </div>
      </div>

      {err && <p style={{ color: "#dc2626" }}>{err}</p>}

      {pendings.length === 0 && !loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
          No pending payments. ✨
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
              <th style={th}>Email</th>
              <th style={th}>Method</th>
              <th style={th}>Reference</th>
              <th style={th}>Amount</th>
              <th style={th}>Submitted</th>
              <th style={{ ...th, width: 220 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pendings.map((p) => (
              <tr key={p.email} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={td}>{p.email}</td>
                <td style={td}>{METHOD_LABEL[p.method] || p.method}</td>
                <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.reference}</td>
                <td style={td}>{p.amount ? p.amount.toLocaleString() + " IQD" : "—"}</td>
                <td style={{ ...td, color: "#64748b", fontSize: 12 }}>{relTime(p.createdAt)}</td>
                <td style={td}>
                  <button
                    className="btn-primary"
                    style={{ width: "auto", padding: "6px 12px", fontSize: 12, marginRight: 6 }}
                    disabled={actingOn === p.email}
                    onClick={() => approve(p.email)}
                  >
                    Approve 30d
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ width: "auto", padding: "6px 12px", fontSize: 12, color: "#b91c1c" }}
                    disabled={actingOn === p.email}
                    onClick={() => reject(p.email)}
                  >
                    Reject
                  </button>
                  {p.notes && <div style={{ marginTop: 6, color: "#64748b", fontSize: 11, fontStyle: "italic" }}>{p.notes}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: "8px 8px", color: "#475569", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "10px 8px", verticalAlign: "top" };

function relTime(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
