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

const Mountain = ({ x, y, s, seed }) => (
  <path className="mp-deco" d={inked([[x - s, y], [x - s * 0.35, y - s * 0.95], [x + s * 0.2, y - s * 0.3], [x + s * 0.55, y - s * 0.8], [x + s * 1.15, y]], seed, 1)} />
);

const Tree = ({ x, y, s, seed }) => (
  <>
    <path className="mp-deco" d={inked([[x, y], [x, y - s * 0.35]], seed, 0.6)} />
    <path className="mp-deco" d={inked([[x - s * 0.45, y - s * 0.3], [x, y - s * 1.15], [x + s * 0.45, y - s * 0.3], [x - s * 0.45, y - s * 0.3]], seed + 'c', 1)} />
  </>
);

const Pin = ({ x, y, seed }) => (
  <>
    <path className="mp-deco" d={inked([[x - 6, y - 12], [x, y - 20], [x + 6, y - 12], [x, y], [x - 6, y - 12]], seed, 0.9)} />
    <circle className="mp-deco-fill" cx={x} cy={y - 13} r="2.4" />
  </>
);

const Flag = ({ x, y, seed }) => (
  <>
    <path className="mp-deco" d={inked([[x, y], [x, y - 26]], seed, 0.7)} />
    <path className="mp-deco" d={inked([[x, y - 26], [x + 16, y - 21], [x, y - 16]], seed + 'f', 1)} />
  </>
);

const Compass = ({ x, y, seed }) => (
  <>
    <circle className="mp-deco" cx={x} cy={y} r="13" />
    <path className="mp-deco" d={inked([[x, y - 9], [x + 4, y], [x, y + 9], [x - 4, y], [x, y - 9]], seed, 0.8)} />
    <text className="mp-compass" x={x} y={y - 16}>צ</text>
  </>
);

// A label inside a cube: one line, or two when a word boundary allows it. There is
// no third line by design — see the label warning in storyMap.js.
function Label({ x, y, text }) {
  if (text.length <= 13) return <text className="mp-label" x={x} y={y + 4}>{text}</text>;
  const words = text.split(' ');
  let a = '';
  let i = 0;
  while (i < words.length && (a + ' ' + words[i]).trim().length <= 13) a = `${a} ${words[i++]}`.trim();
  const b = words.slice(i).join(' ');
  return (
    <text className="mp-label" x={x} y={y - 2}>
      <tspan x={x}>{a}</tspan>
      {b && <tspan x={x} dy="13">{b}</tspan>}
    </text>
  );
}

/* -------------------------------------------------------------------- forms -- */

const W = 300;

// No time in the story yet: a place, with the people who are at it. There is
// nothing to lay a route along, so the map does not pretend there is.
function Scene({ cast, stations }) {
  const H = 250;
  const cx = W / 2;
  const cy = 118;
  const here = stations[0];
  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      <Mountain x={64} y={92} s={30} seed="m1" />
      <Mountain x={238} y={86} s={24} seed="m2" />
      <Tree x={40} y={176} s={22} seed="t1" />
      <Tree x={262} y={168} s={18} seed="t2" />
      {here && (
        <>
          <Cube x={cx} y={cy} w={148} h={44} seed={here.id} strong />
          <Label x={cx} y={cy} text={here.label} />
        </>
      )}
      <Pin x={cx} y={cy - 34} seed="pin" />
      {cast.map((a, i) => {
        const per = cast.length;
        const ang = -Math.PI / 2 + ((i + 0.5) / per) * Math.PI * 2;
        const px = cx + Math.cos(ang) * 104;
        const py = cy + 22 + Math.sin(ang) * 56;
        return (
          <g key={a.id}>
            <Cube x={px} y={py} w={76} h={26} seed={a.id} />
            <text className="mp-name" x={px} y={py + 4}>{a.label}</text>
          </g>
        );
      })}
      <Compass x={40} y={222} seed="c" />
    </svg>
  );
}

// The order of events is known, so the same material becomes a route: a winding
// path from where it started to where it stands, a cube at every station.
function Journey({ cast, stations, forks }) {
  const top = 74;
  const step = 92;
  const CW = 116;
  const CH = 36;
  const H = top + stations.length * step + (forks.length ? 92 : 48);
  const at = (i) => [i % 2 === 0 ? 190 : 110, top + i * step];
  const pts = stations.map((_, i) => at(i));

  // The route runs BETWEEN the cubes, never through them: each leg leaves the
  // bottom edge of one and arrives at the top edge of the next, bowing out to the
  // side on the way. Drawing it through the centres put a dashed line straight
  // across the words — a map's path threads past its landmarks, it does not
  // cross them out.
  const legs = [];
  legs.push([[190, top - 44], [190, top - CH / 2 - 4]]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const bow = x0 > x1 ? -26 : 26;
    legs.push([
      [x0, y0 + CH / 2 + 4],
      [(x0 + x1) / 2 + bow, (y0 + y1) / 2],
      [x1, y1 - CH / 2 - 4],
    ]);
  }
  const last = pts[pts.length - 1] ?? [190, top];
  legs.push([[last[0], last[1] + CH / 2 + 4], [last[0], last[1] + 40]]);

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {legs.map((leg, i) => (
        <path className="mp-route" key={i} d={inked(leg, `leg${i}`, 2.6)} />
      ))}
      <Mountain x={46} y={top + 26} s={26} seed="m1" />
      <Tree x={266} y={top + 44} s={19} seed="t1" />
      <Tree x={36} y={top + step * 2 + 20} s={16} seed="t2" />
      <Mountain x={258} y={H - 74} s={30} seed="m2" />
      <Pin x={196} y={top - 44} seed="pin" />

      {stations.map((s, i) => {
        const [x, y] = at(i);
        return (
          <g key={s.id} className={`mp-station is-${s.kind}`}>
            <Cube x={x} y={y} w={CW} h={CH} seed={s.id} strong={s.kind === 'action'} />
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

      <Flag x={pts.length % 2 === 0 ? 196 : 108} y={H - 30} seed="flag" />
      <text className="mp-x" x={W - 34} y={H - 22}>✕</text>
      <Compass x={36} y={H - 30} seed="c" />
      {/* Who is on this map. A boxed legend rather than floating words, so it
          reads as part of the drawing instead of a caption that drifted in. */}
      {cast.length > 0 && (
        <g className="mp-cast">
          <Cube x={62} y={30} w={104} h={18 + cast.length * 14} seed="cast" />
          {cast.map((a, i) => (
            <text className="mp-name" key={a.id} x={62} y={30 - (cast.length - 1) * 7 + i * 14 + 4}>
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
      <div className="story-head">
        <h2 className="story-title">מפת הסיפור</h2>
        <p className="story-sub">כך אני מצייר לעצמי את מה שסיפרת.</p>
      </div>
      {map.form === 'journey' ? <Journey {...map} /> : <Scene {...map} />}
      <p className="story-foot">אם משהו כאן לא מדויק — כתוב לי בהודעה הבאה ואתקן.</p>
    </aside>
  );
}
