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

// App mark: two overlapping circles — "think twice".
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
