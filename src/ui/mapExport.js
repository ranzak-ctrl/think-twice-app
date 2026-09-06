// Export the case map as a picture that survives leaving the page.
//
// The map on screen is an <svg> whose every colour comes from styles.css — see
// the note in StoryMap.jsx: rough.js writes stroke and fill as presentation
// ATTRIBUTES, and any CSS rule beats them, so the stylesheet owns the paint.
// Serialising the live node therefore produces a file that renders unstyled
// anywhere else: black strokes on a transparent ground, nothing like what the
// tester saw. So each node's COMPUTED paint is copied inline before the markup
// leaves the page. That also makes the export a record of the drawing as it
// actually looked, rather than of whatever the stylesheet says today.
//
// Not in src/core: this reads the DOM and paints a canvas. The pure part is
// split out and takes its reader injected, so it is testable without a browser
// (the pattern judge.js sets with fetchImpl).

// The paint that styles.css sets on the map. Anything not listed is either
// structural (positions live in attributes) or inherited harmlessly.
export const PAINT_PROPERTIES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
];

/**
 * Flatten a computed style into an inline `style` value.
 *
 * Pure: `computed` is anything with a getPropertyValue(name) — a real
 * CSSStyleDeclaration in the browser, a plain lookup in tests.
 *
 * @param {{getPropertyValue: (p: string) => string}} computed
 * @param {string[]} [properties]
 * @returns {string} e.g. "fill: none; stroke: #333" — empty when nothing applies
 */
export function buildInlineStyle(computed, properties = PAINT_PROPERTIES) {
  return properties
    .map((prop) => [prop, computed.getPropertyValue(prop)])
    .filter(([, value]) => value !== '' && value != null)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

/**
 * Parse "0 0 900 620" into the pixel size the picture should be drawn at.
 * Falls back to the element's own attributes, then to a sane default, so a
 * missing viewBox degrades to a picture rather than to no picture.
 *
 * @param {string|null} viewBox
 * @returns {{width: number, height: number}}
 */
export function sizeFromViewBox(viewBox) {
  const parts = String(viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  return { width: 900, height: 620 };
}

/**
 * The live <svg> as standalone markup, with the stylesheet's paint baked in.
 *
 * @param {SVGElement} svg the node on screen
 * @param {(el: Element) => CSSStyleDeclaration} [read] computed-style reader
 * @returns {string|null} markup, or null when there is no map on screen
 */
export function serializeMap(svg, read = (el) => window.getComputedStyle(el)) {
  if (!svg) return null;

  const clone = svg.cloneNode(true);
  // cloneNode preserves document order, so the two lists run in lockstep and
  // the nth source node is the nth clone.
  const sources = [svg, ...svg.querySelectorAll('*')];
  const clones = [clone, ...clone.querySelectorAll('*')];

  sources.forEach((source, i) => {
    const style = buildInlineStyle(read(source));
    if (style) clones[i].setAttribute('style', style);
  });

  const { width, height } = sizeFromViewBox(svg.getAttribute('viewBox'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Standalone renderers need a concrete size; the viewBox alone leaves it to
  // the container, and here there is no container.
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  return new XMLSerializer().serializeToString(clone);
}

/**
 * Turn standalone SVG markup into a PNG data URI.
 *
 * Drawn through a blob URL rather than a base64 data URI because the map is in
 * Hebrew, and btoa cannot carry those code points. The blob holds no external
 * reference once the paint is inlined, so the canvas stays untainted and
 * toDataURL is allowed.
 *
 * @param {string} svgText
 * @param {number} [scale] pixel density — 2 keeps the sketch legible when zoomed
 * @returns {Promise<string|null>} data URI, or null if the browser refuses
 */
export function rasterize(svgText, scale = 2) {
  return new Promise((resolve) => {
    const { width, height } = sizeFromViewBox(
      (svgText.match(/viewBox="([^"]*)"/) ?? [])[1]
    );
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();

    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        // The page ground is a light sheet; without this the PNG is transparent
        // and the sketch vanishes against a dark viewer.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/png'));
      } catch {
        // A tainted or oversized canvas must not cost the tester the export.
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}
