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

// THREE COLUMNS AND A BACKDROP. Ran, 5.9.2026:
//
//   "בוא נחלק את התרשים לשלוש עמודות (ברמה הויזואלית): דמויות · פעולות · משמעות.
//    מעל שלושת העמודות תהיה שכבה רוחבית של רקע."
//
// Which answers a question the previous layout kept dodging: WHERE a thing belongs
// on the paper. Until now everything the interview produced went into one winding
// route and the characters stood in a margin beside it, so the drawing's only
// organising idea was time — and time is exactly the axis that turned out to be
// carrying two different clocks. Three columns give the map a second axis that is
// not time at all: who, what happened, and what it means.
//
//   דמויות  — the cast. A column now, not a margin, which is what lets a
//             character's traits sit beside her deeds instead of in a corner.
//   פעולות  — what happened and what was done. The sequence lives HERE, so the
//             route is one column deep rather than the whole picture, and the two
//             kinds of order stop competing for the same lines.
//   משמעות  — how he read it and how it felt. Placed at the height of the beat it
//             is about, so the reading sits level with the moment it reads.
//
// And the backdrop across the top is the ongoing lane from earlier today, moved
// from under the map to over it. It is the same material — how things ARE, and have
// been — and above the columns it reads as the condition everything below happened
// inside, which is what it is.
//
// RTL: the first column is the RIGHTMOST one.
const W = 560;
const CH = 36;      // a cube in a column
const GAP = 12;     // between two cubes in a row

// The columns, and the empty channels between them. Nothing is ever drawn in a
// channel except a relation on its way past, which is the whole reason they exist:
// an arrow that has to cross a column would otherwise cross a cube.
const COLS = {
  actors:  { cx: 486, max: 96,  label: 'דמויות' },
  events:  { cx: 322, max: 168, label: 'פעולות' },
  meaning: { cx: 118, max: 168, label: 'משמעות' },
};
const CHANNEL = { right: 547, actorsEvents: 422, eventsMeaning: 220, left: 16 };

// Which column a node belongs in. The narrative kinds already carry the answer —
// what happened against what it means — so this is a reading of them, not a new
// classification the model has to learn.
const EVENT_KINDS = new Set(['fact', 'action', 'plan']);
const columnOf = (kind) => (EVENT_KINDS.has(kind) ? 'events' : 'meaning');

// Pack labelled items into rows that fit a width. The backdrop has no order in it,
// so it is the one part of the map that is laid out this way rather than in a column.
function packRows(items, maxW, minCube, max) {
  const rows = [];
  let row = [];
  let used = 0;
  for (const it of items) {
    const w = cubeW(it.label, minCube, max);
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

// Nothing may print on top of anything else in the same column. Ran's screenshot of
// 5.9.2026 shows two names landing at the same height and running together into
// "הבתאשתנה"; the same thing happens to two readings of one beat, which both want
// that beat's height. Push down, never up, so the first item keeps the position it
// was given for a reason.
export function spread(items, minGap) {
  const out = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < out.length; i++) {
    out[i] = { ...out[i], y: Math.max(out[i].y, out[i - 1].y + minGap) };
  }
  return out;
}

// A relation drawn between two placed things. Journey computes the route because
// only it knows where the channels are; this draws it and puts the head on the
// last segment.
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

// A container's bounding box over whatever it actually holds here — and NOT over
// anything else.
//
// A box is a claim, which is why nothing unconfirmed is drawn; a box that happens
// to swallow a bystander makes that claim about him too. The first three-column
// render did exactly that: "המטבח" held the manager and the sous-chef, and its top
// padding reached up over the bottom of "אתה", who is not in it — the drawing
// quietly putting him inside a group he never said he belonged to.
//
// So the box is pulled in until it clears every non-member, and if a non-member
// sits BETWEEN two members there is no honest box to draw and none is drawn. The
// members stay on the map; only the claim about them being together is withheld,
// which is the right way round.
export function boxOf(c, pos, width = W) {
  const held = c.members.map((id) => pos.get(id)).filter(Boolean);
  if (held.length < 2) return null;
  const pad = c.kind === 'perspective' ? (c.owner === 'self' ? 8 : 18) : 12;
  const left = Math.max(2, Math.min(...held.map((p) => p.x - p.w / 2)) - pad);
  const right = Math.min(width - 2, Math.max(...held.map((p) => p.x + p.w / 2)) + pad);
  const inner = {
    top: Math.min(...held.map((p) => p.y - p.h / 2)),
    bottom: Math.max(...held.map((p) => p.y + p.h / 2)),
  };
  let top = inner.top - pad - 8; // extra room at the top for the label
  let bottom = inner.bottom + pad;

  const mine = new Set(c.members);
  for (const [id, p] of pos) {
    if (mine.has(id)) continue;
    if (p.x + p.w / 2 <= left || p.x - p.w / 2 >= right) continue; // not under the box
    const pTop = p.y - p.h / 2;
    const pBottom = p.y + p.h / 2;
    if (pBottom > inner.top && pTop < inner.bottom) return null; // wedged between members
    if (pBottom <= inner.top) top = Math.max(top, pBottom + 4);
    if (pTop >= inner.bottom) bottom = Math.min(bottom, pTop - 4);
  }
  if (bottom - top < 20) return null;
  // Whether the name fits inside the top edge. Clamping off a neighbour can take
  // the headroom away, and a label printed over the first member it holds is worse
  // than an unlabelled box: the box's shape already says what it groups, the word
  // only says what he calls it.
  const labelY = inner.top - top >= 14 ? top + 13 : null;
  return { x: left, y: top, w: right - left, h: bottom - top, labelY };
}



function Board({ form, stations, ground, agents, containers, links, arcs, forks }) {
  // ── the backdrop, across the top ──
  const band = packRows(ground, W - 60, 100, 190).map((r) => layRow(r, W / 2));
  const rowH = (row) => (row.some((g) => lines(g.label).length > 1) ? 42 : 30);
  const bandRowY = [];
  let by = 26;
  for (const row of band) {
    bandRowY.push(by + rowH(row) / 2);
    by += rowH(row) + 10;
  }
  const bandBottom = band.length ? by + 4 : 0;
  const colTop = bandBottom + 46;
  const step = 78;

  // ── the events column: the sequence, one column deep ──
  const events = stations.filter((n) => columnOf(n.kind) === 'events');
  const eventAt = new Map(events.map((n, i) => [n.id, colTop + i * step]));

  // ── the meaning column, level with what it is about ──
  // A reading is placed at the height of the beat it reads, when he related the
  // two; otherwise it falls in below in narrative order. Levelling them is the
  // point of having a column at all — a reading floating at its own height is just
  // another box, and beside its moment it is an answer to that moment.
  const relatedY = (id) => {
    for (const e of arcs ?? []) {
      if (e.from === id && eventAt.has(e.to)) return eventAt.get(e.to);
      if (e.to === id && eventAt.has(e.from)) return eventAt.get(e.from);
    }
    return null;
  };
  const meaningNodes = stations.filter((n) => columnOf(n.kind) !== 'events');
  const meaning = spread(
    meaningNodes.map((n, i) => ({ ...n, y: relatedY(n.id) ?? colTop + i * step })),
    CH + 14,
  );

  // ── one address book for every placed thing ──
  const pos = new Map();
  for (const n of events) {
    pos.set(n.id, { x: COLS.events.cx, y: eventAt.get(n.id), w: cubeW(n.label, 120, COLS.events.max), h: CH });
  }
  for (const n of meaning) {
    pos.set(n.id, { x: COLS.meaning.cx, y: n.y, w: cubeW(n.label, 120, COLS.meaning.max), h: CH });
  }
  band.forEach((row, r) =>
    row.forEach((g) => pos.set(g.id, { x: g.x, y: bandRowY[r], w: g.w, h: rowH(row) })),
  );

  const colBottom = Math.max(
    colTop,
    ...events.map((n) => eventAt.get(n.id)),
    ...meaning.map((n) => n.y),
  );
  const forkY = colBottom + 62;

  // ── the cast column ──
  const cast = spread(
    (agents ?? []).map((a, i) => {
      const anchors = a.anchors.map((id) => pos.get(id)).filter(Boolean);
      const y = anchors.length
        ? anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length
        : colTop + i * 40;
      return { ...a, y, w: cubeW(a.label, 64, COLS.actors.max), h: 26, x: COLS.actors.cx };
    }),
    46,
  );
  for (const a of cast) pos.set(`actor:${a.id}`, { x: a.x, y: a.y, w: a.w, h: a.h });
  forks.forEach((f, k) => pos.set(f.id, { x: COLS.events.cx, y: forkY - 18 + k * 6, w: 60, h: 20 }));

  const H = (forks.length ? forkY + 56 : colBottom + CH / 2 + 24) + (cast.length ? 8 : 0);

  // ── routing ──
  // Which channel a relation takes is decided by the columns it joins, and every
  // choice is forced by the layout: a relation never enters a column it is not an
  // end of, so it never crosses a cube.
  const columnAt = (id) => {
    const p = pos.get(id);
    if (!p) return null;
    if (band.some((row) => row.some((g) => g.id === id))) return 'band';
    if (p.x === COLS.actors.cx) return 'actors';
    if (p.x === COLS.events.cx) return 'events';
    return 'meaning';
  };
  const route = (from, to) => {
    const a = pos.get(from);
    const b = pos.get(to);
    const ca = columnAt(from);
    const cb = columnAt(to);
    const pair = new Set([ca, cb]);

    // Down from the backdrop into a column: leave the bottom of the band and take
    // the channel ADJACENT to the target, so the run across is one gap wide and
    // crosses nothing. Taking the outer channel instead — which is what this did
    // first — meant a relation from the backdrop into the middle column ran the
    // full width of the map at the target's height, clearing the columns in between
    // only by luck.
    const BAND_EXIT = { meaning: CHANNEL.left, events: CHANNEL.actorsEvents, actors: CHANNEL.right };
    if (pair.has('band')) {
      const g = ca === 'band' ? a : b;
      const c = ca === 'band' ? b : a;
      const ch = BAND_EXIT[columnAt(ca === 'band' ? to : from)] ?? CHANNEL.left;
      const dirOut = ch > c.x ? 1 : -1;
      const legs = [
        [g.x, g.y + g.h / 2 + 3],
        [ch, g.y + g.h / 2 + 16],
        [ch, c.y],
        [c.x + dirOut * (c.w / 2 + 3), c.y],
      ];
      return ca === 'band' ? legs : [...legs].reverse();
    }

    // Within one column: out to the nearer channel and back, so the line passes
    // the cubes between the two rather than through them.
    if (ca === cb) {
      const ch = ca === 'meaning' ? CHANNEL.left : ca === 'actors' ? CHANNEL.right : CHANNEL.eventsMeaning;
      const dir = ch > a.x ? 1 : -1;
      const turn = Math.min(16, Math.abs(a.y - b.y) / 3) * (b.y > a.y ? 1 : -1);
      return [
        [a.x + dir * (a.w / 2 + 3), a.y],
        [ch, a.y + turn],
        [ch, b.y - turn],
        [b.x + dir * (b.w / 2 + 3), b.y],
      ];
    }

    // Between two neighbouring columns: straight across the channel between them.
    // Between the two outer ones: over the events column through both channels.
    const dir = COLS[cb].cx > COLS[ca].cx ? 1 : -1;
    const start = [a.x + dir * (a.w / 2 + 3), a.y];
    const end = [b.x - dir * (b.w / 2 + 3), b.y];
    if (pair.has('actors') && pair.has('meaning')) {
      const near = dir > 0 ? CHANNEL.eventsMeaning : CHANNEL.actorsEvents;
      const far = dir > 0 ? CHANNEL.actorsEvents : CHANNEL.eventsMeaning;
      // Over the middle column, but never up into the column labels.
      const over = Math.max(colTop - 20, Math.min(a.y, b.y) - CH / 2 - 14);
      return [start, [near, over], [far, over], end];
    }
    const ch = dir > 0 ? COLS[ca].cx + COLS[ca].max / 2 + 14 : COLS[cb].cx + COLS[cb].max / 2 + 14;
    return [start, [ch, (a.y + b.y) / 2], end];
  };

  const Node = ({ n, h = CH, max, cls = '' }) => (
    <g className={`mp-station is-${n.kind}${cls}`}>
      <Cube
        x={n.x ?? COLS.meaning.cx}
        y={n.y}
        w={n.w ?? cubeW(n.label, 120, max)}
        h={h}
        seed={n.id}
        strong={n.kind === 'action' && !n.provisional}
        provisional={n.provisional}
      />
      <Label
        x={n.x ?? COLS.meaning.cx}
        y={n.y}
        text={n.label}
        cls={n.provisional ? 'mp-label is-provisional' : 'mp-label'}
      />
    </g>
  );

  return (
    <svg className="mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת הסיפור">
      {/* Containers first, so everything they hold is drawn on top of them. */}
      {(containers ?? []).map((c) => {
        const b = boxOf(c, pos);
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
            {b.labelY !== null && (
              <text className="mp-group-label" x={b.x + b.w - 8} y={b.labelY}>{c.label}</text>
            )}
          </g>
        );
      })}

      {/* The backdrop: what has been true for a while, over everything below it. */}
      {band.length > 0 && (
        <g className="mp-ground">
          <Sketch
            drawable={gen.rectangle(10, 10, W - 20, bandBottom - 10, {
              ...ROUGH,
              seed: seedOf('ground'),
              roughness: 1.6,
            })}
            className="mp-ground-line"
            fillClassName="mp-ground-line"
          />
          <text className="mp-ground-label" x={W - 20} y={24}>ברקע, לאורך זמן</text>
        </g>
      )}

      {/* The columns are named once, faintly. Three unlabelled stacks are a puzzle;
          these are the three words Ran used for them. */}
      {Object.entries(COLS).map(([key, col]) =>
        (key === 'actors' ? cast.length : (key === 'events' ? events.length : meaning.length)) ? (
          <text key={key} className="mp-col-label" x={col.cx} y={colTop - 26}>{col.label}</text>
        ) : null,
      )}

      {/* The route, down the events column. Only when there is a time dimension to
          draw: before that the beats are known and their order is not, and an arrow
          between them would be the drawing inventing the one thing it lacks. */}
      {form === 'journey' &&
        events.slice(0, -1).map((n, i) => {
          const y0 = eventAt.get(n.id);
          const y1 = eventAt.get(events[i + 1].id);
          const link = links?.find(
            (l) => stations[l.from]?.id === n.id && stations[l.to]?.id === events[i + 1].id,
          );
          const cls = link?.sourced ? ' is-sourced' : '';
          const x = COLS.events.cx;
          return (
            <g key={`leg${n.id}`}>
              <Leg
                points={[[x, y0 + CH / 2 + 4], [x + 22, (y0 + y1) / 2], [x, y1 - CH / 2 - 4]]}
                seed={`leg${n.id}`}
                className={`mp-route${cls}`}
              />
              <Head
                x0={x + 22}
                y0={(y0 + y1) / 2}
                x1={x}
                y1={y1 - CH / 2 - 4}
                seed={`h${n.id}`}
                className={`mp-head${cls}`}
              />
            </g>
          );
        })}

      {/* Every relation he stated that is not the route itself. */}
      {(arcs ?? []).map((arc) => {
        if (!pos.has(arc.from) || !pos.has(arc.to)) return null;
        return (
          <Arc
            key={`${arc.from}→${arc.to}`}
            points={route(arc.from, arc.to)}
            kind={arc.kind}
            seed={`arc${arc.from}${arc.to}`}
            className={arc.kind === 'agent' ? 'mp-agent' : 'mp-arc'}
          />
        );
      })}

      {events.map((n) => (
        <Node key={n.id} n={{ ...n, x: COLS.events.cx, y: eventAt.get(n.id) }} max={COLS.events.max} />
      ))}
      {meaning.map((n) => (
        <Node key={n.id} n={{ ...n, x: COLS.meaning.cx }} max={COLS.meaning.max} />
      ))}
      {band.map((row, r) =>
        row.map((g) => (
          <Node key={g.id} n={{ ...g, y: bandRowY[r] }} h={rowH(row)} cls=" is-standing" />
        )),
      )}

      {/* An unresolved fork: the route splits and neither branch is taken. */}
      {forks.map((f) => (
        <g key={f.id} className="mp-fork">
          {f.options.slice(0, 3).map((o, k) => {
            const shown = f.options.slice(0, 3).length;
            const x = 60 + k * ((W - 200) / Math.max(1, shown - 1 || 1));
            return (
              <g key={k}>
                <Leg
                  points={[[COLS.events.cx, forkY - 18], [x, forkY + 26]]}
                  seed={`${f.id}${k}`}
                  className="mp-branch"
                />
                <text className="mp-branch-label" x={x} y={forkY + 40}>{o}</text>
              </g>
            );
          })}
        </g>
      ))}

      {cast.map((a) => (
        <g key={a.id}>
          <Cube x={a.x} y={a.y} w={a.w} h={a.h} seed={a.id} />
          <text className="mp-name" x={a.x} y={a.y + 4}>{a.label}</text>
        </g>
      ))}
    </svg>
  );
}

// Takes the built map, not the state. App builds it once per turn — it needs the
// same answer to decide whether the toggle button has anything to toggle — and two
// calls to a pure projection that must agree is a way for them to disagree.
export default function StoryMap({ map }) {
  if (!map || map.isEmpty) return null;
  return (
    <aside className="story" aria-label="מפת הסיפור">
      <Board {...map} />
      <p className="story-foot">אם משהו כאן לא מדויק — כתוב לי בהודעה הבאה ואתקן.</p>
    </aside>
  );
}
