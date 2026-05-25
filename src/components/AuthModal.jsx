import { useState } from "react";
import { sendMagicLink } from "../lib/api.js";

/* Passwordless magic-link sign-in.
   User enters email -> backend emails a one-click link -> /auth/verify?token=...
   sets the session and closes the modal. */
export default function AuthModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email || !/^.+@.+\..+$/.test(email)) {
      setError("Please enter a valid email");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      await sendMagicLink(email);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Could not send the link. Please try again.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        {status === "sent" ? (
          <>
            <h2>Check your inbox</h2>
            <p>We sent a sign-in link to <strong>{email}</strong>. Open it from this device to finish signing in.</p>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <h2>Sign in to Altaan Detector</h2>
            <p>Enter your email and we'll send you a one-click sign-in link. No password needed.</p>
            <form onSubmit={submit}>
              <input
                className="field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
              {error && <p style={{ color: "#dc2626", marginTop: 10, fontSize: 13 }}>{error}</p>}
              <button
                className="btn-primary"
                type="submit"
                style={{ marginTop: 14 }}
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
