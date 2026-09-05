import { describe, it, expect } from 'vitest';
import { spread, boxOf } from '../../src/ui/StoryMap.jsx';

// Nothing may print on top of anything else in a column. Ran's screenshot of
// 5.9.2026 shows two names landing at the same height and running together into
// "הבתאשתנה" — a map that garbles what it says is worse than one that leaves it
// out, and the audience this is built for (design/brief.md:39) will not squint at
// it to work out what it says.
//
// The same collision hits the meaning column, where two readings of one beat both
// want that beat's height, so this guards both.
describe('nothing prints on top of anything else in a column', () => {
  const at = (n, y) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, y }));
  const overlaps = (out, gap) => out.some((p, i) => i > 0 && p.y - out[i - 1].y < gap);

  it('separates items that all want the same height', () => {
    expect(overlaps(spread(at(4, 200), 38), 38)).toBe(false);
  });

  it('separates items that want heights closer than the gap', () => {
    const items = [{ id: 'a', y: 100 }, { id: 'b', y: 108 }, { id: 'c', y: 112 }];
    expect(overlaps(spread(items, 40), 40)).toBe(false);
  });

  it('pushes down, never up — the first item keeps the height it was given', () => {
    const out = spread([{ id: 'a', y: 100 }, { id: 'b', y: 104 }], 40);
    expect(out[0].y).toBe(100);
    expect(out[1].y).toBe(140);
  });

  it('leaves items alone when they already clear each other', () => {
    const items = [{ id: 'a', y: 100 }, { id: 'b', y: 300 }];
    expect(spread(items, 40).map((p) => p.y)).toEqual([100, 300]);
  });

  it('does not mutate what it was given', () => {
    const items = [{ id: 'a', y: 200 }, { id: 'b', y: 200 }];
    spread(items, 40);
    expect(items.map((p) => p.y)).toEqual([200, 200]);
  });
});

// A container is a CLAIM — that is why nothing unconfirmed is drawn. A box that
// happens to swallow a bystander makes that claim about him too, and the first
// three-column render did exactly that: "המטבח" held the manager and the sous-chef,
// and its top padding reached over the bottom of "אתה", who is not in it. The
// drawing quietly put him in a group he never said he belonged to.
describe('a container never encloses someone it does not hold', () => {
  const box = (x, y, w = 96, h = 26) => ({ x, y, w, h });
  const group = (members) => ({ id: 'g', label: 'המטבח', kind: 'community', members });

  const encloses = (b, p) =>
    b && p.x - p.w / 2 < b.x + b.w && p.x + p.w / 2 > b.x &&
    p.y - p.h / 2 < b.y + b.h && p.y + p.h / 2 > b.y;

  it('stops short of a non-member sitting just above its members', () => {
    const pos = new Map([
      ['actor:user', box(486, 128)],   // not a member
      ['actor:mgr', box(486, 167)],
      ['actor:sous', box(486, 208)],
    ]);
    const b = boxOf(group(['actor:mgr', 'actor:sous']), pos);
    expect(b).not.toBeNull();
    expect(encloses(b, pos.get('actor:user'))).toBe(false);
    expect(encloses(b, pos.get('actor:mgr'))).toBe(true);
    expect(encloses(b, pos.get('actor:sous'))).toBe(true);
  });

  it('stops short of a non-member sitting just below', () => {
    const pos = new Map([
      ['actor:mgr', box(486, 120)],
      ['actor:sous', box(486, 160)],
      ['actor:user', box(486, 200)],
    ]);
    const b = boxOf(group(['actor:mgr', 'actor:sous']), pos);
    expect(encloses(b, pos.get('actor:user'))).toBe(false);
  });

  it('draws nothing rather than a false claim when a bystander is wedged between', () => {
    // No honest box exists here. The members stay on the map; only the claim that
    // they are together is withheld, which is the right way round.
    const pos = new Map([
      ['actor:mgr', box(486, 120)],
      ['actor:user', box(486, 165)],   // not a member, between the two
      ['actor:sous', box(486, 210)],
    ]);
    expect(boxOf(group(['actor:mgr', 'actor:sous']), pos)).toBeNull();
  });

  it('ignores a non-member in another column entirely', () => {
    const pos = new Map([
      ['actor:mgr', box(486, 167)],
      ['actor:sous', box(486, 208)],
      ['stage1.trigger', box(322, 150, 168, 36)], // a beat, well clear on x
    ]);
    const b = boxOf(group(['actor:mgr', 'actor:sous']), pos);
    expect(b).not.toBeNull();
    expect(b.y).toBeLessThan(167);
  });

  it('draws nothing for a container whose members are not on the map', () => {
    expect(boxOf(group(['actor:ghost', 'actor:nobody']), new Map())).toBeNull();
  });
});
