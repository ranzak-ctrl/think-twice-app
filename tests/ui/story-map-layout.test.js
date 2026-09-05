import { describe, it, expect } from 'vitest';
import { placeActors } from '../../src/ui/StoryMap.jsx';

// The cast used to print on top of itself. Ran's screenshot of 5.9.2026 shows two
// names landing at the same height and running together into "הבתאשתנה" — a map
// that garbles the cast is worse than one that leaves it out, and the audience this
// is built for (design/brief.md:39) will not squint at it to work out what it says.
describe('the cast never prints on top of itself', () => {
  const cast = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}`, label: `דמות ${i}`, anchors: [] }));
  const overlaps = (placed) =>
    placed.some((p, i) =>
      placed.some((q, j) => j > i && Math.abs(p.y - q.y) < (p.h + q.h) / 2),
    );

  it('separates characters that have nothing to anchor them yet', () => {
    // Both fell to the same default y — the exact case in the screenshot.
    const placed = placeActors(cast(4), () => null, 40);
    expect(overlaps(placed)).toBe(false);
  });

  it('separates characters whose anchors put them at the same height', () => {
    const at = { x: 300, y: 200, w: 120, h: 36 };
    const agents = cast(3).map((a) => ({ ...a, anchors: ['same'] }));
    const placed = placeActors(agents, (id) => (id === 'same' ? at : null), 40);
    expect(overlaps(placed)).toBe(false);
  });

  it('still stands a character beside what he is joined to', () => {
    const boxes = { top: { x: 300, y: 100, w: 120, h: 36 }, low: { x: 300, y: 400, w: 120, h: 36 } };
    const [placed] = placeActors(
      [{ id: 'mgr', label: 'הממונה', anchors: ['top', 'low'] }],
      (id) => boxes[id] ?? null,
      40,
    );
    expect(placed.y).toBe(250); // the average of the two, not a default slot
  });

  it('keeps the cast clear of the widest cube on the route', () => {
    // A station on the inner column spans 120–300 at its widest. A name box that
    // reached into that is the collision this margin exists to prevent.
    const placed = placeActors(cast(3), () => null, 40);
    expect(Math.max(...placed.map((p) => p.x + p.w / 2))).toBeLessThan(120);
  });
});
