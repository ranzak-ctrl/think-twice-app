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
// A station's own ceiling, lower than CUBE_MAX. At 200 a cube on the inner column
// (x = 210) spans 110–310, and a character's box in the left margin reaches 112 —
// two pixels of overlap, which on a hand-drawn outline reads as a collision. 180
// keeps eight pixels of daylight between the widest cube and the widest name.
const STATION_MAX = 180;
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
// THREE BANDS, and two of them are kept empty on purpose. A relation that is not
// the route itself has to get from one box to another without crossing a third, and
// the only way to guarantee that is to reserve lanes nothing is ever drawn in:
//
//   0–14    the left channel  — where a character's relations run
//   18–122  the cast          — the characters themselves
//   130–470 the story         — the route and the ground beneath it
//   490–520 the right channel — where relations across the story run
//
// The first render of the two-lane map had arcs bowing through the middle, and a
// relation from the ground up to a beat drew a long curve straight across two other
// cubes — the same fault as the arc that cut through two boxes on 5.9, in a new
// place. Bowing harder only moves which box it crosses; an empty lane removes the
// question.
const W = 520;
const CH = 36;      // a cube on the route
const GAP = 12;     // between two cubes in a row
const CHANNEL_L = 10;
const CHANNEL_R = 494;
const CAST_X = 18;
const CAST_MAX = 100;

// Pack labelled items into rows that fit a width. Used for everything that has no
// place in a sequence — the cast before there is a route, and the ground lane,
// which by definition has no order to lay out along.
function packRows(items, maxW, minCube) {
  const rows = [];
  let row = [];
  let used = 0;
  for (const it of items) {
    const w = cubeW(it.label, minCube);
    if (row.length && used + w + GAP > maxW) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ ...it, w });
    used += w + GAP;
  }
  if (row.length) rows.push(row);
  return rows;
}

// Row → x for each item, centred on cx.
function layRow(row, cx) {
  const total = row.reduce((sum, it) => sum + it.w, 0) + GAP * (row.length - 1);
  let x = cx - total / 2;
  return row.map((it) => {
    const at = x + it.w / 2;
    x += it.w + GAP;
    return { ...it, x: at };
  });
}

// A relation drawn between two placed things. One routine for all of them now:
// beats that are neighbours are the route itself, and everything else — a beat to a
// character, a moment to the standing state underneath it, two beats four boxes
// apart — is an arc, and every arc is a polyline through reserved space.
//
// Journey computes the route because only it knows where the bands are; this just
// draws it and puts the head on the last segment.
function Arc({ points, kind, seed, className }) {
  const enter = points[points.length - 2];
  const end = points[points.length - 1];
  return (
    <g className={`mp-rel is-${kind}`}>
      <Leg points={points} seed={seed} className={className} />
      <Head x0={enter[0]} y0={enter[1]} x1={end[0]} y1={end[1]} seed={`${seed}h`} className={className} />
    </g>
  );
}

// Where the characters stand: the left margin, each at the average height of
// everything he is joined to.
//
// Pushed apart afterwards. Two characters with no relations yet both fell to the
// same default y and their boxes printed on top of each other — "הבתאשתנה" in Ran's
// screenshot of 5.9.2026, two names in one pile of letters. A map that garbles the
// cast is worse than one that omits it.
const ACTOR_GAP = 32;
export function placeActors(agents, posOf, fallbackY) {
  const placed = agents.map((a, i) => {
    const w = Math.min(CAST_MAX, Math.max(64, a.label.length * PER_CHAR + 20));
    const anchors = a.anchors.map(posOf).filter(Boolean);
    const y = anchors.length
      ? anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length
      : fallbackY + i * ACTOR_GAP;
    return { ...a, w, h: 26, x: CAST_X + w / 2, y };
  });
  placed.sort((p, q) => p.y - q.y);
  for (let i = 1; i < placed.length; i++) {
    placed[i].y = Math.max(placed[i].y, placed[i - 1].y + ACTOR_GAP);
  }
  return placed;
}

// The route, the ground it runs on, and everyone standing beside it.
//
// TWO CLOCKS. Ran, 5.9.2026: "there is the order of events of the incident I am
// describing, and there is a description of something more ongoing in the
// relationship with my wife. We need to find a way to represent that complexity."
// The route is the incident — beats in the order he put them in. The band under it
// is what does not move: how things are, and have been. Nothing crosses from one to
// the other except an arrow he actually stated, and those arrows are the point —
// "she has been trying to talk to me for a long time" is why she answered as she
// did in that minute, and on one spine that read as the next thing that happened.
function Journey({ stations, ground, agents, containers, links, arcs, forks }) {
  const top = 74;
  const step = 92;
  // The two columns of the route, placed so the widest cube on either of them
  // clears the cast on one side and the right channel on the other.
  const at = (i) => [i % 2 === 0 ? 312 : 216, top + i * step];
  const pts = stations.map((_, i) => at(i));

  // ── the ground lane ──
  // The band sits clear of the characters' margin on one side and the canvas edge
  // on the other, and its rows are packed narrower than the band so a full row is
  // never wider than the box drawn around it.
  const GROUND_X = 130;
  const GROUND_W = 340;
  const GROUND_CX = GROUND_X + GROUND_W / 2;
  const groundRows = packRows(ground, GROUND_W - 16, 100).map((r) => layRow(r, GROUND_CX));
  const routeEnd = stations.length ? top + (stations.length - 1) * step + CH / 2 : top - 40;
  const groundTop = routeEnd + 62;
  // A row is as tall as its tallest label needs. A two-line name in a 30px box put
  // its second line outside the box, which is the cube growing into a paragraph
  // from the other direction.
  const rowH = (row) => (row.some((g) => lines(g.label).length > 1) ? 42 : 30);
  const rowY = [];
  let gy = groundTop;
  for (const row of groundRows) {
    rowY.push(gy + rowH(row) / 2);
    gy += rowH(row) + 12;
  }
  const groundH = Math.max(0, gy - 12 - groundTop);

  const forkY = (groundRows.length ? groundTop + groundH + 20 : routeEnd + 44) + 18;
  // Room for the lane under the band, where relations into the ground run — plus
  // the overshoot of a drawn curve, which rounds past its own last waypoint.
  const H = (forks.length ? forkY + 56 : (groundRows.length ? groundTop + groundH + 52 : routeEnd + 44));

  // ── one address book for every placed thing ──
  // Anything with an id has a box here, so an edge is drawn if its two endpoints
  // exist and is dropped only if they do not. Before this, whether a relation could
  // be drawn depended on which array its endpoints happened to live in.
  const pos = new Map();
  stations.forEach((s, i) => {
    const [x, y] = at(i);
    pos.set(s.id, { x, y, w: cubeW(s.label, 120, STATION_MAX), h: CH });
  });
  const groundIds = new Set(ground.map((g) => g.id));
  groundRows.forEach((row, r) =>
    row.forEach((g) => pos.set(g.id, { x: g.x, y: rowY[r], w: g.w, h: rowH(row) })),
  );
  forks.forEach((f, k) => pos.set(f.id, { x: 216, y: forkY - 18 + k * 6, w: 60, h: 20 }));
  const posOf = (id) => pos.get(id) ?? null;

  const cast = placeActors(agents ?? [], posOf, top - 34);
  for (const a of cast) pos.set(`actor:${a.id}`, { x: a.x, y: a.y, w: a.w, h: a.h });

  // ── routing a relation through reserved space ──
  //
  // Every arc leaves a box, runs along a lane nothing else is drawn in, and enters
  // another box. Which lane depends on where the ends are, and each choice is
  // forced by the layout rather than chosen: the characters live on the left, so
  // their relations run down the left channel; everything on the route has only its
  // right side free.
  //
  // A cube on the ground lane is the one case a side channel cannot serve. Two of
  // them can sit in the same row, so an arc entering the left one from the right
  // would cross the right one — which is how the previous build drew a line through
  // the middle of "אין מי שיגבה אותי" on the way to its neighbour. So the ground is
  // entered from BELOW, through a lane under the band, where nothing is ever drawn.
  const isGround = (id) => groundIds.has(id);
  const bandFloor = groundRows.length ? groundTop + groundH + 22 : 0;
  const route = (from, to, side) => {
    const a = posOf(from);
    const b = posOf(to);
    const x = side === 'left' ? CHANNEL_L : CHANNEL_R;
    const sideEdge = (p) => [side === 'left' ? p.x - p.w / 2 - 3 : p.x + p.w / 2 + 3, p.y];
    // Corners of its own, so the line turns into the channel and runs along it.
    // rough.js draws a curve THROUGH its waypoints rather than bounded by them, so
    // three points let the middle one bulge the curve clean off the canvas.
    const turn = (p, q) => Math.min(18, Math.abs(p.y - q.y) / 3) * (q.y > p.y ? 1 : -1);

    if (isGround(to)) {
      return [sideEdge(a), [x, a.y + turn(a, { y: bandFloor })], [x, bandFloor], [b.x, bandFloor], [b.x, b.y + b.h / 2 + 3]];
    }
    if (isGround(from)) {
      return [[a.x, a.y + a.h / 2 + 3], [a.x, bandFloor], [x, bandFloor], [x, b.y - turn(b, { y: bandFloor })], sideEdge(b)];
    }
    return [sideEdge(a), [x, a.y + turn(a, b)], [x, b.y - turn(a, b)], sideEdge(b)];
  };

  // The route runs BETWEEN the cubes, never through them: each leg leaves the
  // bottom edge of one and arrives at the top edge of the next, bowing out to the
  // side on the way. Drawing it through the centres put a dashed line straight
  // across the words — a map's path threads past its landmarks, it does not
  // cross them out.
  const legs = [];
  if (stations.length) {
    legs.push([[312, top - 40], [312, top - CH / 2 - 4]]);
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
    const last = pts[pts.length - 1];
    legs.push([[last[0], last[1] + CH / 2 + 4], [last[0], last[1] + 40]]);
  }

  // A container's bounding box over whatever it actually holds here. Members are
  // ids and every id has a box, so a container can hold a beat, a standing state
  // and a character in the same box — which is what a community or a point of view
  // usually is.
  //
  // Perspectives are inset differently per owner, so two of them over overlapping
  // members read as two vantage points rather than one box swallowing the other.
  // His sits tight; the other's sits wider, around it. Both may hold the same
  // beat — two people did see the same thing happen — and that shared ground is
  // legible as the overlap instead of being a collision.
  const boxOf = (c) => {
    const corners = [];
    for (const id of c.members) {
      const p = posOf(id);
      if (!p) continue;
      corners.push([p.x - p.w / 2, p.y - p.h / 2], [p.x + p.w / 2, p.y + p.h / 2]);
    }
    if (corners.length < 4) return null;
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
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
      {(containers ?? []).map((c) => {
        const b = boxOf(c);
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

      {/* The ground: what has been true for a while, under the minute the story is
          about. Drawn as a held region rather than as more stations, because it has
          no order — putting it on the route would say one of these followed
          another. */}
      {groundRows.length > 0 && (
        <g className="mp-ground">
          <Sketch
            drawable={gen.rectangle(GROUND_X, groundTop - 16, GROUND_W, groundH + 26, {
              ...ROUGH,
              seed: seedOf('ground'),
              roughness: 1.6,
            })}
            className="mp-ground-line"
            fillClassName="mp-ground-line"
          />
          <text className="mp-ground-label" x={GROUND_X + GROUND_W - 8} y={groundTop - 4}>
            ברקע, לאורך זמן
          </text>
        </g>
      )}

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

      {/* Every relation he stated that is not the route itself: across the story,
          down to the ground, or out to the person who did it. All of them come
          through one path and one address book, so an edge is drawn whenever both
          of its ends are on the map. */}
      {(arcs ?? []).map((arc) => {
        const a = posOf(arc.from);
        const b = posOf(arc.to);
        if (!a || !b) return null;
        const touchesCast = arc.from.startsWith('actor:') || arc.to.startsWith('actor:');
        return (
          <Arc
            key={`${arc.from}→${arc.to}`}
            points={route(arc.from, arc.to, touchesCast ? 'left' : 'right')}
            kind={arc.kind}
            seed={`arc${arc.from}${arc.to}`}
            className={arc.kind === 'agent' ? 'mp-agent' : 'mp-arc'}
          />
        );
      })}

      {stations.map((s, i) => {
        const [x, y] = at(i);
        return (
          <g key={s.id} className={`mp-station is-${s.kind}`}>
            <Cube
              x={x}
              y={y}
              w={cubeW(s.label, 120, STATION_MAX)}
              h={CH}
              seed={s.id}
              strong={s.kind === 'action' && !s.provisional}
              provisional={s.provisional}
            />
            <Label x={x} y={y} text={s.label} cls={s.provisional ? 'mp-label is-provisional' : 'mp-label'} />
          </g>
        );
      })}

      {groundRows.map((row, r) =>
        row.map((g) => {
          const y = rowY[r];
          return (
            <g key={g.id} className={`mp-station is-standing is-${g.kind}`}>
              <Cube x={g.x} y={y} w={g.w} h={rowH(row)} seed={g.id} provisional={g.provisional} />
              <Label x={g.x} y={y} text={g.label} cls={g.provisional ? 'mp-label is-provisional' : 'mp-label'} />
            </g>
          );
        }),
      )}

      {/* An unresolved fork: the route splits and neither branch is taken. */}
      {forks.map((f) => (
        <g key={f.id} className="mp-fork">
          {f.options.slice(0, 3).map((o, k) => {
            const shown = f.options.slice(0, 3).length;
            const x = GROUND_X + 30 + k * ((GROUND_W - 60) / Math.max(1, shown - 1 || 1));
            return (
              <g key={k}>
                <Leg points={[[216, forkY - 18], [x, forkY + 26]]} seed={`${f.id}${k}`} className="mp-branch" />
                <text className="mp-branch-label" x={x} y={forkY + 40}>{o}</text>
              </g>
            );
          })}
        </g>
      ))}

      {/* The cast, standing in the left margin. Their arrows are drawn with all the
          others above — a character is a node like any other now, which is what let
          "that is because of her" become a line instead of being stored and
          forgotten. */}
      {cast.map((a) => (
        <g key={a.id}>
          <Cube x={a.x} y={a.y} w={a.w} h={a.h} seed={a.id} />
          <text className="mp-name" x={a.x} y={a.y + 4}>{a.label}</text>
        </g>
      ))}
    </svg>
  );
}

// No time in the story yet: a place, the things that are true at it, and the people
// who are there. There is nothing to lay a route along, so the map does not pretend
// there is — no arrows, no order, just what is known so far.
//
// Every node is drawn, not only the first. It used to render stations[0] and drop
// the rest, which is the same fault Ran named on the route ("you stopped creating
// cubes"): the map held things he had said and showed one of them.
function Scene({ stations, ground, agents }) {
  const cx = W / 2;
  const rows = packRows([...stations, ...ground], W - 40, 110).map((r) => layRow(r, cx));
  const top = 30;
  const castRows = packRows(agents ?? [], W - 40, 84).map((r) => layRow(r, cx));
  const castTop = top + rows.length * 52 + 14;
  const H = castTop + castRows.length * 44;

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {rows.map((row, r) =>
        row.map((n) => {
          const y = top + r * 52;
          return (
            <g key={n.id} className={`mp-station is-${n.kind}`}>
              <Cube x={n.x} y={y} w={n.w} h={CH} seed={n.id} provisional={n.provisional} />
              <Label x={n.x} y={y} text={n.label} cls={n.provisional ? 'mp-label is-provisional' : 'mp-label'} />
            </g>
          );
        }),
      )}
      {castRows.map((row, r) =>
        row.map((a) => {
          const y = castTop + r * 44;
          return (
            <g key={a.id}>
              <Cube x={a.x} y={y} w={a.w} h={26} seed={a.id} />
              <text className="mp-name" x={a.x} y={y + 4}>{a.label}</text>
            </g>
          );
        }),
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
