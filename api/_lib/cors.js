/* Apply CORS + JSON body parsing helpers to a Vercel function handler. */

export function withCors(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    try {
      await handler(req, res);
    } catch (err) {
      console.error("API error", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  };
}

export async function readJSON(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise(resolve => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}
