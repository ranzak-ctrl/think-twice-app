// Diagnostic endpoint — confirms Vercel serverless functions are deployed.
export default function handler(req, res) {
  res.status(200).json({ ok: true, ts: Date.now() });
}
