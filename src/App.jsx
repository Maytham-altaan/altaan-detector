import { useState, useEffect } from "react";
import Humanizer from "./components/Humanizer.jsx";
import UsageMeter from "./components/UsageMeter.jsx";
import AuthModal from "./components/AuthModal.jsx";
import UpgradeModal from "./components/UpgradeModal.jsx";
import AdminPage from "./components/AdminPage.jsx";
import { useUser } from "./lib/useUser.js";
import { setToken, verifyMagicLink } from "./lib/api.js";

/* Tiny path-based routing — avoids react-router as a dep.
   Vite base path is stripped first so /altaan-detector/admin → /admin. */
function getRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let p = window.location.pathname;
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (p === "/admin" || p === "/admin/") return "admin";
  return "home";
}

export default function App() {
  const { user, loading, refresh, signOut } = useUser();
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* Handle magic-link callback: /?token=... */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) return;
    (async () => {
      try {
        const res = await verifyMagicLink(t);
        if (res && res.token) {
          setToken(res.token);
          await refresh();
        }
      } catch {
        // ignore — user will be invited to sign in again
      } finally {
        // strip query params
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, [refresh]);

  /* Live-update usage after each successful AI rewrite */
  function onUsageUsed(usage) {
    refresh();
  }

  function needAuth(reason) {
    setUpgradeReason(reason || "");
    setShowAuth(true);
  }
  function needUpgrade(reason) {
    setUpgradeReason(reason || "");
    setShowUpgrade(true);
  }

  return (
    <div style={{
      fontFamily: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
      maxWidth: 820, margin: "0 auto", padding: "20px 20px 60px", color: "#1e293b",
    }}>
      {/* TOP BAR */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #e2e8f0",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em", fontWeight: 700 }}>
            Altaan Detector
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13,
            fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
            AI humanizer &amp; detector — built to beat the major detectors.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12,
          fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
          <UsageMeter user={user} />
          {!loading && (
            user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {user.plan !== "premium" && (
                  <button className="btn-primary"
                    style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
                    onClick={() => { setUpgradeReason(""); setShowUpgrade(true); }}>
                    Upgrade
                  </button>
                )}
                <details style={{ position: "relative" }}>
                  <summary style={{ listStyle: "none", cursor: "pointer",
                    background: "#f1f5f9", borderRadius: 999, padding: "6px 12px",
                    fontSize: 12, fontWeight: 600, color: "#334155" }}>
                    {user.email}
                  </summary>
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4,
                    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                    padding: 6, minWidth: 140, boxShadow: "0 6px 20px rgba(15,23,42,.1)", zIndex: 10 }}>
                    <button onClick={signOut} style={{
                      width: "100%", textAlign: "left", background: "none", border: 0,
                      padding: "8px 10px", fontSize: 13, cursor: "pointer", color: "#334155" }}>
                      Sign out
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <button className="btn-secondary" onClick={() => setShowAuth(true)}>Sign in</button>
            )
          )}
        </div>
      </header>

      {route === "admin" ? (
        <AdminPage user={user} />
      ) : (
        <Humanizer
          user={user}
          onNeedAuth={needAuth}
          onNeedUpgrade={needUpgrade}
          onUsageUsed={onUsageUsed}
        />
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          reason={upgradeReason}
          onSubmitted={refresh}
        />
      )}
    </div>
  );
}
