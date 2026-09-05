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
/* rough.js draws every line here. It replaced a hand-rolled jitter that nudged
   points off true and joined them with a curve — serviceable, but a fake: a real
   hand-drawn stroke is drawn TWICE along slightly different paths, and that
   doubling is most of what the eye reads as "sketch". rough.js is the library
   Excalidraw and mermaid's handDrawn mode both use underneath: 8.9KB gzipped,
   MIT, four micro-dependencies by the same author.

   THE SEED IS LOAD-BEARING. Left alone rough.js randomises on every call, so the
   map would redraw differently on every React render and shimmer in the corner of
   the eye of someone design/brief.md:39 says has no attention to spare. Every
   shape is seeded from its own stable id, so the drawing is identical unless its
   contents actually changed. */

import { RoughGenerator } from 'roughjs/bin/generator.js';

const gen = new RoughGenerator();

// A stable numeric seed from an element's id — rough.js wants a number.
function seedOf(id) {
  let h = 2166136261;
  const str = String(id);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) % 2 ** 31;
}

const ROUGH = { roughness: 1.15, bowing: 1.4, strokeWidth: 1.5 };

// rough.js writes stroke and fill as presentation ATTRIBUTES, which any CSS rule
// beats, so the stylesheet still owns every colour. rough emits the fill and the
// outline as separate paths; the class tells them apart.
function Sketch({ drawable, className, fillClassName }) {
  return gen.toPaths(drawable).map((p, i) => (
    <path key={i} d={p.d} className={p.fill && p.fill !== 'none' ? fillClassName : className} />
  ));
}

// A drawn rectangle: two overlapping outlines the way a hand draws one, over a
// solid fill pass so the route behind it does not show through the box.
function Cube({ x, y, w, h, seed, strong, provisional }) {
  const drawable = gen.rectangle(x - w / 2, y - h / 2, w, h, {
    ...ROUGH,
    seed: seedOf(seed),
    fill: '#fff',
    fillStyle: 'solid',
  });
  return (
    <Sketch
      drawable={drawable}
      fillClassName="mp-cube-fill"
      className={`mp-cube${strong ? ' is-strong' : ''}${provisional ? ' is-provisional' : ''}`}
    />
  );
}

// An arrowhead. Ran, 4.9.2026: "cubes and arrows" — a line with no head states
// adjacency, an arrow states direction, and direction is the whole claim this
// drawing makes about the story.
function Head({ x0, y0, x1, y1, seed, className }) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const L = 8;
  const w = 0.42;
  const p = (t) => [x1 - L * Math.cos(a + t), y1 - L * Math.sin(a + t)];
  const drawable = gen.linearPath([p(w), [x1, y1], p(-w)], { ...ROUGH, seed: seedOf(seed) });
  return <Sketch drawable={drawable} className={className} fillClassName={className} />;
}

// A leg of the route: a drawn curve through its waypoints.
function Leg({ points, seed, className }) {
  const drawable = gen.curve(points, { ...ROUGH, seed: seedOf(seed), bowing: 1 });
  return <Sketch drawable={drawable} className={className} fillClassName={className} />;
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

const CUBE_MAX = 200; // leaves both margins clear for arcs
const cubeW = (text, min = 96, max = CUBE_MAX) =>
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

// Wide enough that the two margins are REAL. An arc across the story routes out
// through one of them, and at 360 there was barely 50px of clearance, so the first
// arc drawn cut straight through two cubes on its way past — a relation he stated,
// rendered as a line through the words of the beats it was not about.
// Wide enough for two working margins: characters stand in one, and relations
// across the story arc through the other. Neither may run over a cube.
const W = 520;

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
          <Cube
            x={cx}
            y={eh / 2 + 8}
            w={cubeW(here.label, 150)}
            h={eh}
            seed={here.id}
            strong={!here.provisional}
            provisional={here.provisional}
          />
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
                <Leg points={[[cx, eh + 10], [px, py - 18]]} seed={`c${a.id}`} className="mp-route" />
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
function Journey({ cast, stations, agents, containers, links, arcs, forks }) {
  const top = 74;
  const step = 92;
  const CH = 36;
  const H = top + stations.length * step + (forks.length ? 92 : 48);
  const at = (i) => [i % 2 === 0 ? 315 : 210, top + i * step];
  const pts = stations.map((_, i) => at(i));

  // The route runs BETWEEN the cubes, never through them: each leg leaves the
  // bottom edge of one and arrives at the top edge of the next, bowing out to the
  // side on the way. Drawing it through the centres put a dashed line straight
  // across the words — a map's path threads past its landmarks, it does not
  // cross them out.
  const legs = [];
  legs.push([[315, top - 40], [315, top - CH / 2 - 4]]);
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
  const last = pts[pts.length - 1] ?? [315, top];
  legs.push([[last[0], last[1] + CH / 2 + 4], [last[0], last[1] + 40]]);

  // Where each character stands. Computed once so the container boxes and the
  // characters themselves cannot disagree about it.
  const actorAt = (a) => {
    const i = (agents ?? []).indexOf(a);
    const w = Math.min(104, Math.max(64, a.label.length * PER_CHAR + 20));
    const y = a.beats.length
      ? a.beats.reduce((sum, b) => sum + at(b)[1], 0) / a.beats.length
      : top - 34 + i * 34;
    return { x: 8 + w / 2, y, w };
  };

  // A container's bounding box over whatever it actually holds here.
  //
  // Perspectives are inset differently per owner, so two of them over overlapping
  // beats read as two vantage points rather than one box swallowing the other.
  // His sits tight; the other's sits wider, around it. Both may hold the same
  // beat — two people did see the same thing happen — and that shared ground is
  // legible as the overlap instead of being a collision.
  const boxOf = (c, i = 0) => {
    const pts = [];
    for (const i of c.stations) {
      const [x, y] = at(i);
      const w = cubeW(stations[i].label, 120) / 2;
      pts.push([x - w, y - CH / 2], [x + w, y + CH / 2]);
    }
    for (const id of c.actors) {
      const a = (agents ?? []).find((n) => n.id === id);
      if (!a) continue;
      const { x, y, w } = actorAt(a);
      pts.push([x - w / 2, y - 13], [x + w / 2, y + 13]);
    }
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = c.kind === 'perspective' ? (c.owner === 'self' ? 10 : 22) : 14;
    // Clamped to the canvas: a container round the cast starts near x=0 and its
    // padding pushed the left wall off the viewBox, so the box read as open.
    const x = Math.max(2, Math.min(...xs) - pad);
    const y = Math.min(...ys) - pad - 8; // extra room at the top for the label
    return {
      x,
      y,
      w: Math.min(W - 2, Math.max(...xs) + pad) - x,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 8,
    };
  };

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {/* Containers first, so everything they hold is drawn on top of them. Ran,
          5.9.2026: hierarchy between entities or processes as nested boxes. A
          community is who someone belongs to; a process is what a stretch of the
          story contains. Both describe the WORLD — a container around the SELF is
          a different claim entirely and is not built (questions-for-natali §11). */}
      {(containers ?? []).map((c, ci) => {
        const b = boxOf(c, ci);
        if (!b) return null;
        const own = c.kind === 'perspective' ? ` is-${c.owner === 'self' ? 'mine' : 'theirs'}` : '';
        return (
          <g key={c.id} className={`mp-group is-${c.kind}${own}`}>
            <Sketch
              drawable={gen.rectangle(b.x, b.y, b.w, b.h, {
                ...ROUGH,
                seed: seedOf(`g${c.id}`),
                roughness: 1.5,
              })}
              className="mp-group-line"
              fillClassName="mp-group-line"
            />
            <text className="mp-group-label" x={b.x + b.w - 8} y={b.y + 13}>
              {c.label}
            </text>
          </g>
        );
      })}

      {legs.map((leg, i) => {
        const [ax, ay] = leg[leg.length - 2];
        const [bx, by] = leg[leg.length - 1];
        // legs[0] is the lead-in and legs[last] the tail; the ones between join
        // station i-1 to station i, so they carry links[i - 1].
        const link = links?.[i - 1];
        const cls = link?.sourced ? ' is-sourced' : '';
        return (
          <g key={i}>
            <Leg points={leg} seed={`leg${i}`} className={`mp-route${cls}`} />
            <Head x0={ax} y0={ay} x1={bx} y1={by} seed={`h${i}`} className={`mp-head${cls}`} />
          </g>
        );
      })}
      {/* Relations across the story, out in the margin so they never cross a cube.
          These are edges he stated between beats that are not neighbours — without
          them the map stored his relation, sorted on it, and drew nothing. */}
      {(arcs ?? []).map((arc, i) => {
        const [x0, y0] = at(arc.from);
        const [x1, y1] = at(arc.to);
        // Out through whichever margin is farther from both endpoints.
        // Arcs always take the right margin; the left one belongs to the cast.
        const side = W - 26;
        const mid = [side, (y0 + y1) / 2];
        return (
          <g key={`arc${i}`}>
            <Leg
              points={[[x0, y0 + CH / 2], mid, [x1, y1 - CH / 2]]}
              seed={`arc${arc.from}-${arc.to}`}
              className="mp-arc"
            />
            <Head
              x0={mid[0]}
              y0={mid[1]}
              x1={x1}
              y1={y1 - CH / 2}
              seed={`arch${arc.from}-${arc.to}`}
              className="mp-arc"
            />
          </g>
        );
      })}

      {stations.map((s, i) => {
        const [x, y] = at(i);
        return (
          <g key={s.id} className={`mp-station is-${s.kind}`}>
            <Cube
              x={x}
              y={y}
              w={cubeW(s.label, 120)}
              h={CH}
              seed={s.id}
              strong={s.kind === 'action' && !s.provisional}
              provisional={s.provisional}
            />
            <Label x={x} y={y} text={s.label} cls={s.provisional ? 'mp-label is-provisional' : 'mp-label'} />
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
                  <Leg points={[[150, y - 18], [x, y + 26]]} seed={`${f.id}${k}`} className="mp-branch" />
                  <text className="mp-branch-label" x={x} y={y + 40}>{o}</text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* The cast, standing in the left margin beside the beats they act in.
          A character with `agent` edges sits at the average height of those beats
          and is joined to each; one with none stays at the top, present in the
          story without a claim about what he did. Ran, 5.9.2026: draw the agent
          edges — until now the map held "the manager made the remark" and drew a
          box in the corner joined to nothing. */}
      {(agents ?? []).map((a) => {
        const { x: ax, y: ay, w } = actorAt(a);
        return (
          <g key={a.id}>
            {a.beats.map((b) => {
              const [bx, by] = at(b);
              return (
                <Leg
                  key={b}
                  points={[[ax + w / 2, ay], [(ax + bx) / 2, (ay + by) / 2], [bx - cubeW(stations[b].label, 120) / 2, by]]}
                  seed={`ag${a.id}${b}`}
                  className="mp-agent"
                />
              );
            })}
            <Cube x={ax} y={ay} w={w} h={26} seed={a.id} />
            <text className="mp-name" x={ax} y={ay + 4}>{a.label}</text>
          </g>
        );
      })}

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
