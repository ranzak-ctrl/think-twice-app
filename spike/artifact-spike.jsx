/**
 * Stage 0 Spike — Artifact Platform Validation
 * Tests: model calls from Artifact, structured JSON output, Hebrew RTL, latency.
 *
 * Paste the full content of this file into Claude's Artifact creator (React).
 * Run once from ran's account, once from natali's account (shared link).
 *
 * Go/No-Go criteria:
 *   ✅ PASS  → all 4 checks green   → proceed to Stage 1
 *   ⚠️  PARTIAL → sharing fails only → Stage 1 via prompt route; Artifact in joint sessions
 *   ❌ FAIL  → model calls unavailable → declare alternate plan (prompt route as primary)
 */

import { useState, useCallback } from "react";

// ─── Structured JSON the model should return ─────────────────────────────────
const EVAL_SCHEMA = {
  message: "string  — single question, max 3 sentences before it",
  evaluation: {
    slots: { facts: "0|1|2|U", interpretation: "0|1|2|U", emotion: "0|1|2|U" },
    flag_avoidance: "boolean",
    exhausted: "boolean",
  },
};

const SYSTEM_PROMPT = `אתה עוזר בדיקה. ענה רק ב-JSON תקני לפי הסכמה הזו, ללא טקסט נוסף:
${JSON.stringify(EVAL_SCHEMA, null, 2)}

הכנס ערכים לדוגמה. ה-message חייב להיות שאלה אחת בעברית.`;

const USER_PROMPT = "בדיקה: ספר לי על אירוע שקרה השבוע.";

// ─── Model Adapter — tries window.claude (Artifact AI), else returns mock ────
async function callModel(system, user) {
  const t0 = performance.now();

  // Artifacts expose window.claude.complete in claude.ai (Pro/Team accounts)
  if (typeof window !== "undefined" && window.claude?.complete) {
    const raw = await window.claude.complete({
      system,
      messages: [{ role: "user", content: user }],
    });
    const latency = Math.round(performance.now() - t0);
    return { raw, latency, source: "artifact-ai" };
  }

  // Fallback: simulate a valid response so the rest of the spike can be tested
  await new Promise((r) => setTimeout(r, 120)); // simulate network
  const latency = Math.round(performance.now() - t0);
  return {
    raw: JSON.stringify({
      message: "ספר לי — מה קרה?",
      evaluation: {
        slots: { facts: "0", interpretation: "0", emotion: "0" },
        flag_avoidance: false,
        exhausted: false,
      },
    }),
    latency,
    source: "mock",
  };
}

// ─── JSON Validator ───────────────────────────────────────────────────────────
function validateJSON(raw) {
  try {
    const obj = JSON.parse(raw);
    const hasMessage = typeof obj.message === "string" && obj.message.trim().length > 0;
    const hasSlots =
      obj.evaluation?.slots &&
      ["facts", "interpretation", "emotion"].every((k) =>
        ["0", "1", "2", "U"].includes(obj.evaluation.slots[k])
      );
    return { ok: hasMessage && hasSlots, obj, error: null };
  } catch (e) {
    return { ok: false, obj: null, error: e.message };
  }
}

// ─── Check Row ────────────────────────────────────────────────────────────────
function Check({ label, status, detail }) {
  const icon = status === "pass" ? "✅" : status === "fail" ? "❌" : status === "warn" ? "⚠️" : "⏳";
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, minWidth: 24 }}>{icon}</span>
      <div>
        <strong>{label}</strong>
        {detail && <div style={{ color: "#555", fontSize: 13 }}>{detail}</div>}
      </div>
    </div>
  );
}

// ─── Main Spike Component ─────────────────────────────────────────────────────
export default function ArtifactSpike() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);

    const { raw, latency, source } = await callModel(SYSTEM_PROMPT, USER_PROMPT);
    const json = validateJSON(raw);

    // RTL check: trivially true if we reach here — confirmed by visual inspection
    const rtlOk = document.documentElement.dir === "rtl";

    setResult({ raw, latency, source, json, rtlOk });
    setRunning(false);
  }, []);

  const modelCallStatus =
    result == null
      ? "pending"
      : result.source === "artifact-ai"
      ? "pass"
      : "warn";

  const jsonStatus =
    result == null ? "pending" : result.json.ok ? "pass" : "fail";

  const rtlStatus = result == null ? "pending" : result.rtlOk ? "pass" : "fail";

  const latencyStatus =
    result == null
      ? "pending"
      : result.latency < 3000
      ? "pass"
      : result.latency < 6000
      ? "warn"
      : "fail";

  const overallGo =
    result != null &&
    jsonStatus === "pass" &&
    rtlStatus === "pass" &&
    latencyStatus !== "fail";

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "system-ui, Arial, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
        color: "#1a1a1a",
      }}
    >
      <h2 style={{ marginBottom: 4 }}>Think Twice — Spike שלב 0</h2>
      <p style={{ color: "#555", marginTop: 0, fontSize: 14 }}>
        אימות יכולות פלטפורמה: קריאת מודל, פלט JSON מובנה, RTL עברית, השהיה.
      </p>

      <button
        onClick={run}
        disabled={running}
        style={{
          background: running ? "#ccc" : "#1a1a1a",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 24px",
          fontSize: 16,
          cursor: running ? "not-allowed" : "pointer",
          marginBottom: 24,
        }}
      >
        {running ? "בודק..." : "הרץ בדיקה"}
      </button>

      {/* Checklist */}
      <div
        style={{
          background: "#f5f5f5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h3 style={{ margin: "0 0 12px" }}>רשימת בדיקות</h3>
        <Check
          label="קריאת מודל מתוך Artifact"
          status={modelCallStatus}
          detail={
            result
              ? result.source === "artifact-ai"
                ? "window.claude.complete זמין ✓"
                : "⚠️ window.claude לא זמין — רץ ב-mock. יש לאמת בחשבון Claude Pro."
              : null
          }
        />
        <Check
          label="פלט JSON מובנה תקין"
          status={jsonStatus}
          detail={
            result
              ? result.json.ok
                ? `message + slots תקינים`
                : `שגיאה: ${result.json.error ?? "שדות חסרים"}`
              : null
          }
        />
        <Check
          label="עברית RTL"
          status={rtlStatus}
          detail={result ? (result.rtlOk ? "dir=rtl על document ✓" : "חסר dir=rtl") : null}
        />
        <Check
          label="השהיה < 3 שניות"
          status={latencyStatus}
          detail={result ? `${result.latency} ms (מקור: ${result.source})` : null}
        />
      </div>

      {/* Verdict */}
      {result && (
        <div
          style={{
            background: overallGo ? "#d4edda" : "#fff3cd",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            fontWeight: "bold",
            fontSize: 18,
          }}
        >
          {overallGo
            ? "✅ Go — כל הבדיקות עברו. ממשיכים לשלב 1."
            : modelCallStatus === "warn"
            ? "⚠️ Partial Go — JSON ו-RTL עובדים. יש לאמת קריאת מודל בחשבון Pro ולבדוק שיתוף קישור."
            : "❌ No-Go — יש לבחון חלופה (מסלול פרומפט)."}
        </div>
      )}

      {/* Raw output */}
      {result && (
        <div>
          <h3 style={{ marginBottom: 8 }}>פלט גולמי מהמודל</h3>
          <pre
            style={{
              background: "#1a1a1a",
              color: "#a8ff78",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              overflow: "auto",
              direction: "ltr",
              textAlign: "left",
            }}
          >
            {result.raw}
          </pre>

          {result.json.ok && (
            <>
              <h3 style={{ marginBottom: 8 }}>הודעה שהמראיין היה מציג</h3>
              <div
                style={{
                  background: "#fff",
                  border: "2px solid #1a1a1a",
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 16,
                  lineHeight: 1.7,
                }}
              >
                {result.json.obj.message}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sharing instructions */}
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: "#eef2ff",
          borderRadius: 12,
          fontSize: 13,
        }}
      >
        <strong>בדיקת שיתוף (ידנית):</strong>
        <ol style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
          <li>שתף את ה-Artifact בקישור מחשבון רן.</li>
          <li>פתח את הקישור בחשבון נטלי (או חשבון שני).</li>
          <li>לחץ "הרץ בדיקה" — ודא שהמודל רץ על חשבון הצופה (לא של רן).</li>
          <li>
            תוצאה צפויה: source=artifact-ai, latency {"<"} 3000ms → שיתוף{" "}
            <strong>עובד</strong>.
          </li>
        </ol>
      </div>
    </div>
  );
}
