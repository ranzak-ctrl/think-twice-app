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

// The brand lockup, transcribed from design/think-twice-logo.svg: two profiles
// facing the wordmark from either side — the two readings of the same event
// that the whole tool is built around.
//
// Geometry is the asset's, not re-derived: same viewBox, same 0.2094 scale,
// same 9-unit stroke. The left profile is the right one mirrored (negative x
// scale), which is why both share one path.
//
// The wordmark stays SVG text rather than an HTML span so the lockup keeps the
// asset's own spacing and never drifts from it. Spectral is loaded in
// index.html; Georgia carries it if that request fails.
//
// aria-label on the <svg> with aria-hidden off: the wordmark is the accessible
// name of the app here, so it must reach the accessibility tree once — hence
// no separate visible text beside it.
//
// Sized by height; width follows the asset's 5:1 ratio.
export function Logo({ height = 36 }) {
  const mark = (x, flip) => (
    <path
      transform={`translate(${x},10) scale(${flip ? '-0.2094' : '0.2094'},0.2094) translate(-105,-15)`}
      d="M95,18C132,18 152,46 152,84C152,96 145,100 144,108L156,132C159,136 158,140 152,141L144,143C148,150 148,154 142,158C149,166 147,178 138,185C127,195 113,201 99,203"
    />
  );

  return (
    <svg
      width={height * 5}
      height={height}
      viewBox="0 0 300 60"
      role="img"
      aria-label="Think Twice"
      focusable="false"
    >
      <g
        fill="none"
        stroke="var(--logo-orange)"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mark(15.3, true)}
        {mark(284.7, false)}
      </g>
      <text
        x="150"
        y="31"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Spectral, Georgia, 'Times New Roman', serif"
        fontSize="28"
        fill="var(--logo-ink)"
      >
        Think Twice
      </text>
    </svg>
  );
}

// Conversation avatar: two overlapping circles — "think twice".
export function Mark({ size = 20 }) {
  return (
    <svg {...base(size)} strokeWidth={1.8}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
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
