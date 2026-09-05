// The story map — drawn, not laid out.
//
// Everything about WHAT is on the map is decided in src/core/storyMap.js. This file
// is the pen: it turns a map spec into SVG in the sketch idiom Ran asked for
// (4.9.2026) — a hand-drawn route with cubes along it, a word or two in each.
//
// WHY SVG AND NOT BOXES-IN-A-COLUMN. The previous build was HTML nodes stacked
// vertically, which can grow but cannot be REDRAWN — and redrawing whole is the
// requirement now. In SVG the map is a function of the spec: when the form flips
// from 'scene' to 'journey' because a timeline landed, nothing is moved or
// animated, the picture is simply drawn again in its new shape. It also forces the
// discipline the brief asks for: a cube is a fixed rectangle with one line of text
// in it, so a label that will not fit is a label that is too long, visibly, rather
// than a box that quietly grows into a paragraph.
//
// The wobble is deterministic — every jitter is seeded from the element's stable id
// — so the map redraws identically unless its contents changed. A sketch that
// re-randomised on every render would shimmer in the corner of the eye of someone
// design/brief.md:39 says arrives with no attention to spare.

import { buildMap } from '../core/storyMap.js';

/* ---------------------------------------------------------------- sketching -- */

// Deterministic pseudo-random in [-1, 1] from a string + index.
function jit(seed, i) {
  let h = 2166136261;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return (((h >>> 0) % 2000) / 1000) - 1;
}

// A hand-drawn line through points: the points are nudged off true and joined with
// a smooth curve, so nothing in the drawing is quite straight.
function inked(points, seed, amt = 2.2) {
  const p = points.map(([x, y], i) => [x + jit(seed, i * 2) * amt, y + jit(seed, i * 2 + 1) * amt]);
  if (p.length < 2) return '';
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const mx = (x0 + x1) / 2 + jit(seed, i + 90) * amt * 2;
    d += ` Q${mx.toFixed(1)} ${y0.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

// A drawn rectangle — four inked sides rather than a rect, so the corners do not
// close perfectly, the way a hand does not close them.
function Cube({ x, y, w, h, seed, strong }) {
  const l = x - w / 2;
  const t = y - h / 2;
  return (
    <path
      className={`mp-cube${strong ? ' is-strong' : ''}`}
      d={inked([[l, t], [l + w, t], [l + w, t + h], [l, t + h], [l - 0.5, t]], seed, 1.5)}
    />
  );
}

// An arrowhead on the end of a leg. Ran, 4.9.2026: "cubes and arrows" — a line
// with no head states adjacency, an arrow states direction, and direction is the
// whole claim this drawing makes about the story.
function head(x0, y0, x1, y1, seed) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const L = 7.5;
  const w = 0.42;
  const p = (t) => [x1 - L * Math.cos(a + t), y1 - L * Math.sin(a + t)];
  return inked([p(w), [x1, y1], p(-w)], seed, 0.7);
}

// How a label breaks, and therefore how wide its cube has to be. Both answers come
// from here so they cannot disagree — the first build fixed the cube width and let
// the text run out of both sides, and with three characters on screen the boxes
// overlapped into an unreadable pile (Ran, 4.9.2026: "יצא לך מבולבל לגמרי").
//
// Two lines at most, by design. A third line means the label is a sentence, and a
// sentence in a cube is the failure this drawing exists to avoid — see the label
// warning in storyMap.js.
const PER_CHAR = 6.4; // Hebrew at 11.5px, measured against the rendered map
const LINE_MAX = 15;

function lines(text) {
  if (text.length <= LINE_MAX) return [text];
  const words = text.split(' ');
  let a = '';
  let i = 0;
  while (i < words.length && (`${a} ${words[i]}`).trim().length <= LINE_MAX) a = `${a} ${words[i++]}`.trim();
  const b = words.slice(i).join(' ');
  return b ? [a, b] : [a];
}

const cubeW = (text, min = 96, max = W - 28) =>
  Math.min(max, Math.max(min, Math.max(...lines(text).map((l) => l.length)) * PER_CHAR + 26));

function Label({ x, y, text, cls = 'mp-label' }) {
  const ls = lines(text);
  if (ls.length === 1) return <text className={cls} x={x} y={y + 4}>{ls[0]}</text>;
  return (
    <text className={cls} x={x} y={y - 2}>
      <tspan x={x}>{ls[0]}</tspan>
      <tspan x={x} dy="13">{ls[1]}</tspan>
    </text>
  );
}

/* -------------------------------------------------------------------- forms -- */

const W = 360;

// No time in the story yet: a place, with the people who are at it. There is
// nothing to lay a route along, so the map does not pretend there is.
function Scene({ cast, stations }) {
  const cx = W / 2;
  const here = stations[0];
  const eh = here && lines(here.label).length > 1 ? 50 : 40;
  const top = (here ? eh + 46 : 26) + 16;
  const rows = [];
  for (let i = 0; i < cast.length; i += 2) rows.push(cast.slice(i, i + 2));
  const H = top + rows.length * 50 + 6;

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {here && (
        <>
          <Cube x={cx} y={eh / 2 + 8} w={cubeW(here.label, 150)} h={eh} seed={here.id} strong />
          <Label x={cx} y={eh / 2 + 8} text={here.label} />
        </>
      )}
      {rows.map((row, r) =>
        row.map((a, c) => {
          const w = cubeW(a.label, 84);
          // A lone card on the last row centres instead of hanging off to one side.
          const px = row.length === 1 ? cx : c === 0 ? cx - (w / 2 + 8) : cx + (w / 2 + 8);
          const py = top + r * 50;
          return (
            <g key={a.id}>
              {here && (
                <path className="mp-route" d={inked([[cx, eh + 10], [px, py - 18]], `c${a.id}`, 2)} />
              )}
              <Cube x={px} y={py} w={w} h={30} seed={a.id} />
              <Label x={px} y={py} text={a.label} cls="mp-name" />
            </g>
          );
        })
      )}
    </svg>
  );
}

// The order of events is known, so the same material becomes a route: a winding
// path from where it started to where it stands, a cube at every station.
function Journey({ cast, stations, links, forks }) {
  const top = 74;
  const step = 92;
  const CH = 36;
  const H = top + stations.length * step + (forks.length ? 92 : 48);
  const at = (i) => [i % 2 === 0 ? 232 : 128, top + i * step];
  const pts = stations.map((_, i) => at(i));

  // The route runs BETWEEN the cubes, never through them: each leg leaves the
  // bottom edge of one and arrives at the top edge of the next, bowing out to the
  // side on the way. Drawing it through the centres put a dashed line straight
  // across the words — a map's path threads past its landmarks, it does not
  // cross them out.
  const legs = [];
  legs.push([[232, top - 40], [232, top - CH / 2 - 4]]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const bow = x0 > x1 ? -30 : 30;
    legs.push([
      [x0, y0 + CH / 2 + 4],
      [(x0 + x1) / 2 + bow, (y0 + y1) / 2],
      [x1, y1 - CH / 2 - 4],
    ]);
  }
  const last = pts[pts.length - 1] ?? [232, top];
  legs.push([[last[0], last[1] + CH / 2 + 4], [last[0], last[1] + 40]]);

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {legs.map((leg, i) => {
        const [ax, ay] = leg[leg.length - 2];
        const [bx, by] = leg[leg.length - 1];
        // legs[0] is the lead-in and legs[last] the tail; the ones between join
        // station i-1 to station i, so they carry links[i - 1].
        const link = links?.[i - 1];
        const cls = link?.sourced ? ' is-sourced' : '';
        return (
          <g key={i}>
            <path className={`mp-route${cls}`} d={inked(leg, `leg${i}`, 2.6)} />
            <path className={`mp-head${cls}`} d={head(ax, ay, bx, by, `h${i}`)} />
          </g>
        );
      })}
      {stations.map((s, i) => {
        const [x, y] = at(i);
        return (
          <g key={s.id} className={`mp-station is-${s.kind}`}>
            <Cube x={x} y={y} w={cubeW(s.label, 120)} h={CH} seed={s.id} strong={s.kind === 'action'} />
            <Label x={x} y={y} text={s.label} />
          </g>
        );
      })}

      {/* An unresolved fork: the route splits and neither branch is taken. */}
      {forks.map((f) => {
        const y = top + stations.length * step - 6;
        return (
          <g key={f.id} className="mp-fork">
            {f.options.slice(0, 3).map((o, k) => {
              const x = 60 + k * ((W - 120) / Math.max(1, f.options.slice(0, 3).length - 1 || 1));
              return (
                <g key={k}>
                  <path className="mp-branch" d={inked([[150, y - 18], [x, y + 26]], `${f.id}${k}`, 2)} />
                  <text className="mp-branch-label" x={x} y={y + 40}>{o}</text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Who is on this map. A boxed legend rather than floating words, so it
          reads as part of the drawing instead of a caption that drifted in. */}
      {cast.length > 0 && (
        <g className="mp-cast">
          <Cube x={66} y={30} w={112} h={18 + cast.length * 14} seed="cast" />
          {cast.map((a, i) => (
            <text className="mp-name" key={a.id} x={66} y={30 - (cast.length - 1) * 7 + i * 14 + 4}>
              {a.label}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

export default function StoryMap({ state }) {
  const map = buildMap(state);
  if (map.isEmpty) return null;
  return (
    <aside className="story" aria-label="מפת הסיפור">
      {map.form === 'journey' ? <Journey {...map} /> : <Scene {...map} />}
      <p className="story-foot">אם משהו כאן לא מדויק — כתוב לי בהודעה הבאה ואתקן.</p>
    </aside>
  );
}
