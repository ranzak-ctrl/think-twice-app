// Clinician debug panel — visible only in "guide mode".
// Shows live StateDocument, Scorecard, Router decisions, KPIs.

const STAGE_NAMES = {
  1: 'עובדות',
  2: 'פרשנות',
  3: 'רגש',
  4: 'תגובה',
  5: 'פרשנות חלופית',
  6: 'חלופות',
  7: 'הכרעה',
};

const SLOT_COLOR = (v) => {
  if (v === 2) return '#1a7a3c';
  if (v === 1) return '#b88000';
  if (v === 'U') return '#0066cc';
  return '#aaa';
};

// Sonnet 4.6 pricing (USD per 1M tokens); the ILS rate is approximate.
const USD_PER_M_INPUT = 3;
const USD_PER_M_OUTPUT = 15;
const ILS_PER_USD = 3.7;

function formatCost(usage) {
  if (!usage || !usage.calls) return '—';
  const usd =
    (usage.inputTokens / 1e6) * USD_PER_M_INPUT +
    (usage.outputTokens / 1e6) * USD_PER_M_OUTPUT;
  return `$${usd.toFixed(4)} (≈ ${(usd * ILS_PER_USD).toFixed(2)} ₪)`;
}

export default function GuidePanel({ state }) {
  const { coverage, meta, facts, thoughts, feelings, reactions } = state;

  return (
    <div
      style={{
        width: 320,
        borderRight: '1px solid #e0e0e0',
        background: '#fff',
        overflowY: 'auto',
        padding: 16,
        fontSize: 13,
        direction: 'rtl',
      }}
    >
      <strong style={{ fontSize: 15 }}>מצב מדריך</strong>

      {/* Stage indicator */}
      <Section title={`שלב ${meta.currentStage} — ${STAGE_NAMES[meta.currentStage]}`}>
        <Row label="פתח שאלה" value={meta.questionAperture} />
        <Row label="ממתין לאישור" value={meta.awaitingConfirmation ? 'כן' : 'לא'} />
      </Section>

      {/* Resistance signals — the Router reads these to set question aperture.
          Fatigue detector (load-guard replacement) still deferred — §1. */}
      <Section title="התנגדויות">
        <Row label="דפוס" value={meta.resistanceFlag ?? 'אין'} />
        <Row label="שאלות בשלב" value={meta.questionCount} />
        <Row label="מיצוי (תורות ללא מידע חדש)" value={meta.saturationCount} />
        <SignalRow label="מוצף" on={meta.signals?.overflow} acute />
        <SignalRow label="הימנעות" on={meta.signals?.avoidance} />
        <SignalRow label="בריחה" on={meta.signals?.flight} />
        <SignalRow label="ציניות" on={meta.signals?.cynicism} />
      </Section>

      {/* Token / cost meter — real-API usage this session (display only) */}
      <Section title="עלות (Sonnet 4.6)">
        <Row label="קריאות API" value={meta.usage?.calls ?? 0} />
        <Row label="input tokens" value={(meta.usage?.inputTokens ?? 0).toLocaleString()} />
        <Row label="output tokens" value={(meta.usage?.outputTokens ?? 0).toLocaleString()} />
        <Row label="עלות מצטברת" value={formatCost(meta.usage)} />
      </Section>

      {/* Coverage scorecard */}
      <Section title="Scorecard">
        {Object.entries(coverage).map(([stageKey, slots]) => {
          const stageNum = Number(stageKey.replace('stage', ''));
          return (
            <div key={stageKey} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                {stageNum}. {STAGE_NAMES[stageNum]}
              </div>
              {Object.entries(slots).map(([slot, val]) => (
                <div key={slot} style={{ display: 'flex', gap: 6, paddingRight: 8 }}>
                  <span style={{ color: SLOT_COLOR(val), fontWeight: 'bold', minWidth: 16 }}>
                    {val}
                  </span>
                  <span style={{ color: '#555' }}>{slot}</span>
                </div>
              ))}
            </div>
          );
        })}
      </Section>

      {/* State data */}
      <Section title="State">
        <Pre label="facts" data={facts} />
        <Pre label="thoughts" data={thoughts} />
        <Pre label="feelings" data={feelings} />
        <Pre label="reactions" data={reactions} />
      </Section>

      {/* KPIs */}
      <Section title="KPIs">
        <Row label="רגש שלב 3" value={meta.kpi.emotionIntensityStage3 ?? '—'} />
        <Row label="רגש שלב 5" value={meta.kpi.emotionIntensityStage5 ?? '—'} />
        <Row
          label="דלתא"
          value={
            meta.kpi.emotionIntensityStage3 != null &&
            meta.kpi.emotionIntensityStage5 != null
              ? meta.kpi.emotionIntensityStage3 - meta.kpi.emotionIntensityStage5
              : '—'
          }
        />
        <Row label="סוג הכרעה" value={meta.kpi.decisionType ?? '—'} />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: 4,
          marginBottom: 8,
          color: '#333',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 'bold' }}>{String(value)}</span>
    </div>
  );
}

function SignalRow({ label, on, acute }) {
  const color = on ? (acute ? '#c0392b' : '#b88000') : '#aaa';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 'bold', color }}>{on ? 'כן' : 'לא'}</span>
    </div>
  );
}

function Pre({ label, data }) {
  const content = JSON.stringify(data, null, 2);
  if (content === '{}' || content === '[]') return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#666', marginBottom: 2 }}>{label}</div>
      <pre
        style={{
          background: '#f5f5f5',
          borderRadius: 4,
          padding: 6,
          fontSize: 11,
          overflow: 'auto',
          direction: 'ltr',
          textAlign: 'left',
          margin: 0,
        }}
      >
        {content}
      </pre>
    </div>
  );
}
