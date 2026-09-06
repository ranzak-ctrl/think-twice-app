import brandLockup from '../assets/brand-lockup.png';
import brandLockupHeavy from '../assets/brand-lockup-heavy.png';
import avatarMark from '../assets/avatar-mark.png';

// Inline SVG icons — no icon font, no network request, no emoji rendering
// differences across platforms. All icons inherit `currentColor` and size 16
// unless told otherwise.

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});

// The brand lockup — board variant 12A: the pair mark above the name, no rule
// and no tagline, the name in Archivo Medium.
//
// The mark ships as artwork, not as geometry. It was two SVG paths built from
// the board's own coordinates; the exported PNG is the board's drawing itself,
// which is the thing being approved. That trade is deliberate and has one
// consequence worth stating: the file is baked flat #ff8a00 (--accent), so it
// is pixels rather than currentColor. Retuning --accent means re-exporting the
// artwork.
//
// Only the composition is expressed in code. Every dimension — mark size, name
// size, the gap between them — derives from --lockup in CSS, so the lockup
// scales as a unit and holds the board's proportions at any size. `is-stacked`
// is the board's own composition; the header lays the same two parts in a row.
// Renders into .brand, which is the flex container itself — no extra wrapper,
// so the gap the board specifies is the gap that applies.
//
// Two placements, and everything else follows from which one this is:
//
// `stacked` is the gate — the board's own composition, mark over name at 190px,
// where the fine-line export holds and the wordmark is on screen. The default is
// the header, where the mark stands alone at 42px; a stroke that reads at 190px
// disappears at that size, so the header carries its own heavier export rather
// than the gate's file scaled down. The width ratio differs with it — a heavier
// stroke widens the frame — and CSS carries that as --pair-ratio, set on
// `.header .brand`, so the two never look stretched against each other.
//
// The alt text follows the same split: the header hides .brand-name
// (`display: none`), so there the mark's alt is the only thing left saying what
// this is; the gate shows the wordmark, where the same alt would read the name
// out twice.
export function Logo({ stacked = false }) {
  return (
    <>
      <img
        className="brand-mark"
        src={stacked ? brandLockup : brandLockupHeavy}
        alt={stacked ? '' : 'Think Twice'}
      />
      <span className="brand-name">Think Twice</span>
    </>
  );
}

// Conversation avatar — a single profile, facing the card it belongs to. The
// pair is the logo and belongs in the header; at 28px it turns to noise, and
// the board's own rule is that one profile is what survives small sizes.
//
// Its own export, not the header's file scaled down: stroke weight does not
// survive a 70x reduction, so the avatar mark is drawn heavier at source to
// arrive at the same visual weight the interface reads as "the logo". Re-export
// both together if the line weight ever changes.
export function Mark() {
  return <img className="avatar-mark" src={avatarMark} alt="" />;
}

export function Plus({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Download({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function Upload({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 21V9m0 0 4 4m-4-4-4 4" />
      <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function Gauge({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 21a9 9 0 1 0-9-9" />
      <path d="M3 12h3M12 3v3M18.4 5.6l-2.1 2.1" />
      <path d="m12 12 4-2" />
    </svg>
  );
}

// The case map: two cubes and the arrow between them, which is what the drawing
// is made of. Not an eye — an eye means "preview"; this button is about one
// particular thing on the screen, and its own shape says which.
export function MapSketch({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3.5" width="8" height="6" rx="1.2" />
      <rect x="13" y="14.5" width="8" height="6" rx="1.2" />
      <path d="M7 9.5v4a1.5 1.5 0 0 0 1.5 1.5H13" />
    </svg>
  );
}

export function ArrowDown({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
    </svg>
  );
}

// Points to the inline end (left) — the app is always RTL, so a right-pointing
// send arrow would read as "back".
export function Send({ size = 17 }) {
  return (
    <svg {...base(size)}>
      <path d="M20 12H7m0 0 5-5m-5 5 5 5" />
    </svg>
  );
}

export function Check({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

export function Pencil({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    </svg>
  );
}

export function Note({ size = 15 }) {
  return (
    <svg {...base(size)}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
      <path d="M8 9h9M8 12.5h6" strokeWidth={1.5} />
    </svg>
  );
}

export function Trash({ size = 14 }) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function Close({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
