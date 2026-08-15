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

// The brand lockup, from the top variant on the logo board
// (design/Think Twice Logo.html): two profiles facing the wordmark from either
// side — the two readings of the same event the tool is built around.
//
// Composed the way the board composes it: two SVG marks flanking real HTML
// text, not one SVG with <text> inside. That keeps the wordmark selectable and
// hinted by the OS, and it is what the board's own markup does.
//
// Only the mark geometry is fixed here (viewBox and stroke-width straight from
// the board). Every dimension — mark size, wordmark size, the gap between them
// — is expressed in em and driven by one font-size in CSS, so the lockup scales
// as a unit and holds the board's proportions exactly at any size.
//
// The left profile is the right one mirrored, so both share a single path.
const Profile = ({ flip }) => (
  <svg
    className={`brand-mark${flip ? ' is-flipped' : ''}`}
    viewBox="100 10 83 201"
    fill="none"
    stroke="var(--logo-orange)"
    strokeWidth={17}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M95,18C132,18 152,46 152,84C152,96 145,100 144,108L156,132C159,136 158,140 152,141L144,143C148,150 148,154 142,158C149,166 147,178 138,185C127,195 113,201 99,203" />
  </svg>
);

// Renders into .brand, which is the flex row itself — no extra wrapper, so the
// gap the board specifies is the gap that applies.
export function Logo() {
  return (
    <>
      <Profile flip />
      <span className="brand-name">Think Twice</span>
      <Profile />
    </>
  );
}

// Conversation avatar — the "mark only" variant from the logo board: the two
// profiles back to back, reading as one head split down the middle.
//
// Replaces the two overlapping circles. Those were a stand-in from before there
// was a real mark; keeping them meant the interviewer's avatar was the one
// place in the app not wearing the brand.
//
// Drawn as a single SVG rather than the board's two side-by-side elements so it
// drops into a fixed avatar box as one glyph. The geometry is still the
// board's: source viewBox 100 10 83 201 at 0.398 scale (201 -> 80), stroke 17,
// and the same 8-unit gap between the halves, which is what makes it read as a
// split rather than a silhouette.
export function Mark({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 74 80"
      fill="none"
      stroke="currentColor"
      strokeWidth={17}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* left half, mirrored */}
      <path transform="translate(33,0) scale(-0.398,0.398) translate(-100,-10)" d="M95,18C132,18 152,46 152,84C152,96 145,100 144,108L156,132C159,136 158,140 152,141L144,143C148,150 148,154 142,158C149,166 147,178 138,185C127,195 113,201 99,203" />
      {/* right half */}
      <path transform="translate(41,0) scale(0.398,0.398) translate(-100,-10)" d="M95,18C132,18 152,46 152,84C152,96 145,100 144,108L156,132C159,136 158,140 152,141L144,143C148,150 148,154 142,158C149,166 147,178 138,185C127,195 113,201 99,203" />
    </svg>
  );
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
