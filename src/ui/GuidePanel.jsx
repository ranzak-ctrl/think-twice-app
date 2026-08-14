// Clinician debug panel — visible only in "guide mode".
// Shows live StateDocument, Scorecard, Router decisions, KPIs.

import { useState, useEffect, useRef } from 'react';
import { formatSelfOther } from '../core/kpi.js';
import { Close } from './icons.jsx';

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

// Router decision codes → Hebrew labels for the guide-mode trail.
const DECISION_LABELS = {
  stay: 'נשאר',
  requestConfirmation: 'מבקש אישור סיכום',
  advance: 'מעבר שלב',
  reopen: 'פתיחה מחדש',
  showBoard: 'הצגת לוח',
  safetyStop: 'עצירת בטיחות',
  sessionComplete: 'סיום סשן',
};

// Gap-management (Build 1) — consistency records display.
const GAP_STATUS = {
  starred: { label: 'כוכבית', color: '#b88000' },
  resolved: { label: 'נפתר', color: '#1a7a3c' },
  escalated: { label: 'מהותי', color: '#c0392b' },
};

const GAP_LEVEL_COLOR = (v) => (v >= 8 ? '#1a7a3c' : v <= 3 ? '#c0392b' : '#b88000');

// Trend from the level history: ▲ improving (toward consistent), ▼ worsening.
function gapTrend(history) {
  if (!history || history.length < 2) return { arrow: '–', color: '#aaa' };
  const delta = history[history.length - 1].level - history[history.length - 2].level;
  if (delta > 0) return { arrow: '▲', color: '#1a7a3c' };
  if (delta < 0) return { arrow: '▼', color: '#c0392b' };
  return { arrow: '–', color: '#aaa' };
}

// Patterns summary (§9, Phase 1): counts by status and by dimension.
function gapsSummary(byTarget) {
  const recs = Object.values(byTarget);
  const count = (key) => {
    const acc = {};
    for (const r of recs) acc[r[key]] = (acc[r[key]] ?? 0) + 1;
    return Object.entries(acc)
      .map(([k, n]) => `${k}:${n}`)
      .join(' ');
  };
  return `${recs.length} פערים · ${count('status')} · ${count('dimension')}`;
}

/* ------------------------------------------------------------------ cost -- */
/* Rates are USD per 1M tokens, keyed by the model the adapter actually calls.
   Previously this was hardcoded to Sonnet 4.6's $3/$15 while the app sent
   claude-sonnet-5 — the meter over-reported by 50%, and would have gone
   silently correct on 1.9.2026 when the intro period ends. Keep the table
   keyed by model id so the two cannot drift again. */

const ILS_PER_USD = 3.7; // approximate

// Sonnet 5 launched on introductory pricing. After this date it moves to the
// standard rate; the meter switches on its own rather than quietly going stale.
const SONNET_5_INTRO_ENDS = Date.UTC(2026, 7, 31, 23, 59, 59); // 31.8.2026

const RATES = {
  'claude-sonnet-5': () =>
    Date.now() <= SONNET_5_INTRO_ENDS ? { in: 2, out: 10 } : { in: 3, out: 15 },
  'claude-sonnet-4-6': () => ({ in: 3, out: 15 }),
  'claude-opus-4-8': () => ({ in: 5, out: 25 }),
  'claude-haiku-4-5': () => ({ in: 1, out: 5 }),
};

const MODEL_ID = import.meta.env.VITE_MODEL ?? 'claude-sonnet-5';

function rates() {
  return (RATES[MODEL_ID] ?? RATES['claude-sonnet-5'])();
}

/* Cache multipliers, per Anthropic pricing: a write costs 1.25x base input
   (2x on the 1h TTL), a read costs 0.1x. Uncached input and output are 1x. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

function sessionCostUsd(usage) {
  const { in: rIn, out: rOut } = rates();
  const m = 1e6;
  return (
    (usage.inputTokens / m) * rIn +
    ((usage.cacheWriteTokens ?? 0) / m) * rIn * CACHE_WRITE_MULTIPLIER +
    ((usage.cacheReadTokens ?? 0) / m) * rIn * CACHE_READ_MULTIPLIER +
    (usage.outputTokens / m) * rOut
  );
}

function formatCost(usage) {
  if (!usage || !usage.calls) return '—';
  const usd = sessionCostUsd(usage);
  return `$${usd.toFixed(4)} (≈ ${(usd * ILS_PER_USD).toFixed(2)} ₪)`;
}

// What the same tokens would have cost with no caching — every cached token
// billed at full input rate. Shown only once caching is actually in play.
function formatCacheSaving(usage) {
  const cached = (usage?.cacheWriteTokens ?? 0) + (usage?.cacheReadTokens ?? 0);
  if (!cached) return null;
  const { in: rIn } = rates();
  const uncachedUsd =
    (usage.inputTokens / 1e6) * rIn +
    (cached / 1e6) * rIn +
    (usage.outputTokens / 1e6) * rates().out;
  const saved = uncachedUsd - sessionCostUsd(usage);
  if (saved <= 0) return null;
  return `$${saved.toFixed(4)} (${Math.round((saved / uncachedUsd) * 100)}%)`;
}

export default function GuidePanel({ state, width = 320, notes = [], onClose }) {
  const { coverage, meta, facts, thoughts, feelings, reactions } = state;
  const gaps = state.gaps ?? { byTarget: {}, log: [] };
  const findings = state.findings ?? {};
  const actorMap = state.actorMap ?? {};

  // Stage progression collapse: the current stage is auto-open; on advance the new
  // stage opens and the previous collapses; any stage can still be toggled manually.
  const [openStages, setOpenStages] = useState(() => ({ [meta.currentStage]: true }));
  const prevStageRef = useRef(meta.currentStage);
  useEffect(() => {
    const prev = prevStageRef.current;
    if (prev !== meta.currentStage) {
      setOpenStages((o) => ({ ...o, [meta.currentStage]: true, [prev]: false }));
      prevStageRef.current = meta.currentStage;
    }
  }, [meta.currentStage]);

  return (
    <aside className="guide" style={{ width }} aria-label="מצב מדריך">
      <div className="guide-head">
        <span>מצב מדריך</span>
        {/* Visible only in the narrow-screen drawer; CSS hides it on desktop. */}
        <button className="guide-close" onClick={onClose} aria-label="סגור מדריך">
          <Close />
        </button>
      </div>

      {/* Stage indicator */}
      <Section title={`שלב ${meta.currentStage} — ${STAGE_NAMES[meta.currentStage]}`}>
        <Row label="פתח שאלה" value={meta.questionAperture} />
        <Row label="ממתין לאישור" value={meta.awaitingConfirmation ? 'כן' : 'לא'} />
      </Section>

      {/* Tester feedback collected on individual interviewer questions. Rides in
          the export; never sent to the model. */}
      <Section title={`הערות בודק (${notes.length})`}>
        {notes.length === 0 ? (
          <Row label="—" value="אין" />
        ) : (
          notes.map((n) => (
            <div key={n.i} className="g-note">
              <div className="g-note-q">{n.question}</div>
              <div className="g-note-t">{n.text}</div>
            </div>
          ))
        )}
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

      {/* Router decision trail — newest first (deterministic transitions) */}
      <Section title="החלטות Router">
        {(meta.decisionLog ?? []).length === 0 ? (
          <Row label="—" value="" />
        ) : (
          [...meta.decisionLog].reverse().map((d, i) => (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}
            >
              <span style={{ color: '#666' }}>
                שלב {d.stage} {d.reason ? `· ${d.reason}` : ''}
              </span>
              <span style={{ fontWeight: 'bold' }}>{DECISION_LABELS[d.decision] ?? d.decision}</span>
            </div>
          ))
        )}
      </Section>

      {/* Stage progression — each stage collapsible; current stage auto-open with its
          live stay-turn count; previous collapses on advance; manual toggle anytime. */}
      <Section title="התקדמות שלבים">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => {
          const isCurrent = n === meta.currentStage;
          const reached = n <= meta.currentStage;
          const open = !!openStages[n];
          const turns = isCurrent
            ? meta.questionCount
            : n < meta.currentStage
            ? meta.kpi.questionsPerStage?.[`stage${n}`] ?? '—'
            : null;
          return (
            <div key={n} style={{ marginBottom: 3 }}>
              <div
                onClick={() => setOpenStages((o) => ({ ...o, [n]: !o[n] }))}
                style={{
                  cursor: 'pointer',
                  color: isCurrent ? '#0066cc' : reached ? '#444' : '#bbb',
                  fontWeight: isCurrent ? 'bold' : 'normal',
                }}
              >
                {open ? '▾' : '▸'} {n}. {STAGE_NAMES[n]}
                {isCurrent ? ' ●' : ''}
              </div>
              {open && (
                <div style={{ paddingRight: 16, color: '#666', marginBottom: 2 }}>
                  {turns === null
                    ? 'טרם הגענו לשלב'
                    : `${turns} תורות${isCurrent ? ' (עד כה)' : ''}`}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Token / cost meter — real-API usage this session (display only).
          Title carries the live model id so it cannot drift from the adapter. */}
      <Section title={`עלות (${MODEL_ID})`}>
        <Row label="קריאות API" value={meta.usage?.calls ?? 0} />
        <Row label="input tokens" value={(meta.usage?.inputTokens ?? 0).toLocaleString()} />
        <Row label="output tokens" value={(meta.usage?.outputTokens ?? 0).toLocaleString()} />
        {(meta.usage?.cacheWriteTokens ?? 0) > 0 && (
          <Row
            label="cache write"
            value={(meta.usage.cacheWriteTokens).toLocaleString()}
          />
        )}
        {(meta.usage?.cacheReadTokens ?? 0) > 0 && (
          <Row
            label="cache read"
            value={(meta.usage.cacheReadTokens).toLocaleString()}
          />
        )}
        <Row label="עלות מצטברת" value={formatCost(meta.usage)} />
        {formatCacheSaving(meta.usage) && (
          <Row label="נחסך במטמון" value={formatCacheSaving(meta.usage)} />
        )}
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
              {Object.entries(slots).map(([slot, val]) => {
                // Stage-1 actors shows the resolved cast (one entry per character,
                // with a clarity badge) instead of the raw per-turn findings stream.
                const isActors = stageKey === 'stage1' && slot === 'actors';
                const actors = isActors ? Object.values(actorMap) : [];
                const slotFindings = isActors ? [] : findings[stageKey]?.[slot] ?? [];
                const hasDetail = actors.length > 0 || slotFindings.length > 0;
                return (
                  <div key={slot} style={{ paddingRight: 8, marginBottom: hasDetail ? 4 : 0 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ color: SLOT_COLOR(val), fontWeight: 'bold', minWidth: 16 }}>
                        {val}
                      </span>
                      <span style={{ color: '#555' }}>{slot}</span>
                    </div>
                    {actors.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '2px 22px 0 0', padding: 0 }}>
                        {actors.map((a, i) => (
                          <li
                            key={i}
                            style={{ fontSize: 11, lineHeight: 1.5, marginBottom: a.actions?.length ? 3 : 0 }}
                          >
                            <div style={{ display: 'flex', gap: 4 }}>
                              <span
                                style={{ color: a.clear ? '#1a7a3c' : '#c0392b' }}
                                title={a.clear ? 'ברור' : 'עמום / סותר'}
                              >
                                {a.clear ? '✓' : '⚠'}
                              </span>
                              <span style={{ color: '#555' }}>
                                <b>{a.label}</b>
                                {a.role ? ` — ${a.role}` : ''}
                                {a.relation ? (
                                  <span style={{ color: '#999' }}>{` · ${a.relation}`}</span>
                                ) : null}
                              </span>
                            </div>
                            {a.actions?.length > 0 && (
                              <ul style={{ listStyle: 'none', margin: '1px 18px 0 0', padding: 0 }}>
                                {a.actions.map((act, j) => (
                                  <li key={j} style={{ display: 'flex', gap: 4, color: '#888' }}>
                                    <span style={{ color: '#bbb' }}>›</span>
                                    <span>{act}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {slotFindings.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '2px 22px 0 0', padding: 0 }}>
                        {slotFindings.map((f, i) => (
                          <li
                            key={i}
                            style={{ display: 'flex', gap: 4, color: '#777', fontSize: 11, lineHeight: 1.5 }}
                          >
                            <span style={{ color: '#ccc' }}>·</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </Section>

      {/* Gap-management — consistency records (Build 1, behind the scenes) */}
      <Section title="פערים / כוכביות">
        {Object.keys(gaps.byTarget).length === 0 ? (
          <Row label="—" value="אין" />
        ) : (
          <>
            {Object.entries(gaps.byTarget).map(([key, rec]) => {
              const status = GAP_STATUS[rec.status] ?? { label: rec.status, color: '#666' };
              const trend = gapTrend(rec.history);
              return (
                <div
                  key={key}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}
                >
                  <span style={{ color: '#555' }}>{rec.target?.label ?? key}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 'bold' }}>
                    <span style={{ color: GAP_LEVEL_COLOR(rec.level) }}>{rec.level}</span>
                    <span style={{ color: trend.color }}>{trend.arrow}</span>
                    <span style={{ color: status.color }}>{status.label}</span>
                    <span style={{ color: '#999', fontWeight: 'normal', fontSize: 11 }}>
                      ×{rec.touches}
                    </span>
                  </span>
                </div>
              );
            })}
            <div style={{ color: '#999', fontSize: 11, marginTop: 4 }}>{gapsSummary(gaps.byTarget)}</div>
          </>
        )}
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
        <Row
          label="מדד שינוי (≠ אוטומט)"
          value={
            meta.kpi.differsFromAutomatic == null
              ? '—'
              : meta.kpi.differsFromAutomatic
              ? 'כן'
              : 'לא'
          }
        />
        <Row
          label="יחס אני/הוא"
          value={formatSelfOther(meta.kpi.selfRefs ?? 0, meta.kpi.otherRefs ?? 0)}
        />
        {Object.keys(meta.kpi.questionsPerStage ?? {}).length > 0 && (
          <Row
            label="שאלות לשלב"
            value={Object.entries(meta.kpi.questionsPerStage)
              .map(([k, n]) => `${k.replace('stage', '')}:${n}`)
              .join('  ')}
          />
        )}
      </Section>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div className="g-section">
      <div className="g-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="g-row">
      <span>{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function SignalRow({ label, on, acute }) {
  const color = on ? (acute ? '#c0392b' : '#b88000') : '#aaa';
  return (
    <div className="g-row">
      <span>{label}</span>
      <span style={{ color }}>{on ? 'כן' : 'לא'}</span>
    </div>
  );
}

function Pre({ label, data }) {
  const content = JSON.stringify(data, null, 2);
  if (content === '{}' || content === '[]') return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <pre className="g-pre">{content}</pre>
    </div>
  );
}
