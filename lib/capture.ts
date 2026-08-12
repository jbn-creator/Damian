import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Real capture, driven over the Chrome DevTools Protocol against whatever
 * Chrome is already installed on the machine running the server.
 *
 * No dependency: Node ships WebSocket and fetch. No API key, no quota, no
 * model call. Everything reported here is measured, so every number Damian
 * quotes is one he actually counted.
 *
 * Ceiling: needs a Chrome binary on the host, so this works in local dev and
 * in a container, and not on serverless. The caller falls back to the scripted
 * demo when `findChrome` comes back null.
 */

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter((path): path is string => Boolean(path));

export function findChrome(): string | null {
  return CHROME_PATHS.find((path) => existsSync(path)) ?? null;
}

/** Element rectangle, in percentages of the captured viewport. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A contrast failure Damian can point at. */
export interface ContrastMiss {
  ratio: number;
  sample: string;
  box: Rect;
}

/** A control coloured unlike every other control around it. */
export interface ColourOutlier {
  colour: string;
  dominant: string;
  box: Rect;
}

export interface DomAudit {
  title: string;
  url: string;
  h1: string | null;
  h1Box: Rect | null;
  h1HasNumber: boolean;
  h1Align: string | null;
  bodyAlign: string | null;
  fieldCount: number;
  requiredCount: number;
  formBox: Rect | null;
  images: number;
  imagesMissingAlt: number;
  missingAltBox: Rect | null;
  interactive: number;
  tinyTapTargets: number;
  tinyTapBox: Rect | null;
  headingCount: number;
  landmarkCount: number;
  /** Set when the page served is a bot check rather than the product. */
  wall: { kind: string; evidence: string } | null;
  structureBox: Rect | null;
  fontFamilies: string[];
  fontBox: Rect | null;
  worstContrast: ContrastMiss | null;
  contrastMisses: number;
  colourOutlier: ColourOutlier | null;
  /** The spacing unit the page mostly follows, and what misses it. */
  spacingBase: number | null;
  spacingAdherence: number;
  offGrid: { value: number; count: number }[];
  offGridBox: Rect | null;
  /** Distinct spacing values in play, and the commonest, when no grid holds. */
  spacingSpread: number;
  commonSpacings: number[];
  /** Two type sizes close enough that having both is an accident. */
  typeNearDupe: { a: number; b: number; box: Rect } | null;
  /** Two colours close enough that they were meant to be one token. */
  colourNearMiss: { a: string; b: string; box: Rect } | null;
  /** Two elements in the same band that almost line up. */
  alignNearMiss: { drift: number; box: Rect } | null;

  /* What a visitor actually runs into. */
  /** Body copy set too small to read comfortably. */
  smallText: { size: number; share: number; box: Rect } | null;
  /** A column of prose too wide to track from one line to the next. */
  longLine: { chars: number; box: Rect } | null;
  /** Nothing above the fold looks more pressable than anything else. */
  competingActions: { count: number; box: Rect } | null;
  /** The primary action sits below the first screen. */
  actionBelowFold: { box: Rect } | null;
  /** How far the page scrolls sideways on a phone. */
  mobileOverflow: number;
}

/** What the walk emits: live frames as they paint, pages as they finish. */
export type CrawlEvent =
  | { type: 'frame'; frame: string }
  | { type: 'page'; capture: PageCapture }
  | { type: 'move'; label: string; clicked: boolean }
  | { type: 'plan'; pages: string[] };

/**
 * Called when a page has been captured, and awaited before the walk moves on.
 *
 * This is the backpressure. The walk is a producer, so without something to
 * wait on it would race ahead and be three pages away by the time the first
 * note is on screen.
 */
export interface CrawlHooks {
  onPage: (capture: PageCapture, index: number) => Promise<void>;
}

export interface PageCapture {
  url: string;
  /** Short label for the page switcher, such as "/solutions". */
  label: string;
  screenshot: string;
  audit: DomAudit;
}

/** Our own cursor, which must never be audited as part of the page. */
const CURSOR_ID = '__damian_cursor';
/** The marker drawn around whatever is about to be pressed. */
const MARK_ID = '__damian_mark';
const MARK_FN = '__damianMark';
const UNMARK_FN = '__damianUnmark';

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

/** How many pages Damian walks, including the one he was handed. */
export const MAX_PAGES = 5;

/**
 * Reject anything that is not a public http target.
 *
 * This route fetches a URL supplied by the caller from inside the server, so
 * it is a request forgery primitive unless the private ranges are closed off.
 * Not a corner worth cutting.
 */
export function assertPublicHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  /* A person types craigslist.org, not https://craigslist.org. */
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('That is not a URL Damian can open.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Damian only opens http and https targets.');
  }

  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host);

  if (blocked) {
    throw new Error('Damian will not open private or loopback addresses.');
  }

  return parsed;
}

/**
 * The measurement script. Runs in the page and returns plain data.
 *
 * Beyond counting, it computes what a designer would actually notice: text
 * that fails contrast against whatever is behind it, how many typefaces are in
 * play, and whether one control is coloured unlike everything around it. All
 * arithmetic, so none of it needs a model.
 */
const AUDIT_SCRIPT = `JSON.stringify((() => {
  const OURS = (el) => el && (el.id === '${CURSOR_ID}' || el.id === '${MARK_ID}');
  const W = innerWidth;
  const H = innerHeight;
  const pct = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: +((r.left + r.width / 2) / W * 100).toFixed(2),
      y: +((r.top + r.height / 2) / H * 100).toFixed(2),
      w: +(r.width / W * 100).toFixed(2),
      h: +(r.height / H * 100).toFixed(2),
    };
  };
  const seen = (el) => {
    if (OURS(el)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' &&
      s.display !== 'none' && s.opacity !== '0';
  };
  const inFrame = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  };
  const firstInFrame = (list) => list.find(inFrame) || null;
  const boxOf = (el) => (el && inFrame(el) ? pct(el) : null);

  /*
   * Colour parsing, via the canvas rather than a regex.
   *
   * getComputedStyle hands back whatever space the author wrote in, so a site
   * using oklch or color(display-p3) returns strings an rgb pattern cannot
   * read. Matching only rgb silently found no colours at all on those sites,
   * which took the contrast check down with it. Canvas normalises anything the
   * browser can parse, so this understands every syntax by definition.
   */
  const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const numbers = (text) => text.split(/[^0-9.]+/).filter(Boolean).map(Number);
  const rgb = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw || raw === 'transparent' || raw === 'none') return null;

    if (raw.startsWith('rgb')) {
      const parts = numbers(raw.slice(raw.indexOf('(') + 1));
      if (parts.length >= 3) {
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
    }

    /*
     * Painted and read back, rather than parsed. Reading fillStyle back gives
     * oklch() straight out again in current Chrome, and treating those three
     * numbers as red, green and blue produced colours like rgb(0.32, 0.02,
     * 233.8). One pixel of ground truth cannot be misread.
     */
    try {
      swatch.fillStyle = '#000000';
      swatch.fillStyle = raw;
      swatch.clearRect(0, 0, 1, 1);
      swatch.fillRect(0, 0, 1, 1);
      const px = swatch.getImageData(0, 0, 1, 1).data;
      return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
    } catch {
      /* Unparseable, so it is not a colour we can reason about. */
    }
    return null;
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  // Walk up for the first opaque backdrop. If anything on the way paints an
  // image or a gradient, the real backdrop is unknowable from computed style
  // and the pair is skipped rather than guessed at.
  const behind = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgb(s.backgroundColor);
      if (c && c.a > 0.85) return c;
      node = node.parentElement;
    }
    const c = rgb(getComputedStyle(document.body).backgroundColor);
    return c && c.a > 0.85 ? c : { r: 255, g: 255, b: 255, a: 1 };
  };
  /*
   * OKLab, for telling whether two colours were meant to be the same token.
   * Euclidean distance here is calibrated against CIEDE2000 without any of its
   * hue wraparound cases, and it is fifteen lines rather than sixty.
   */
  const oklab = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const r = f(c.r), g = f(c.g), b = f(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const t = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * t,
      A: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * t,
      B: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * t,
    };
  };
  const dEok = (a, b) => Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B);

  // Saturation, to tell a real colour from a grey.
  const sat = (c) => {
    const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };

  const fields = [...document.querySelectorAll('input, select, textarea')].filter(
    (el) => seen(el) && !['hidden', 'submit', 'button', 'image', 'reset'].includes(el.type),
  );
  const required = fields.filter(
    (el) => el.required || el.getAttribute('aria-required') === 'true',
  );
  const form = (() => {
    const field = firstInFrame(fields) || fields[0];
    return field ? field.closest('form') || field : null;
  })();

  const h1 = [...document.querySelectorAll('h1')].find(seen) || null;
  const h1Text = h1 ? h1.textContent.replace(/\\s+/g, ' ').trim() : null;

  const imgs = [...document.querySelectorAll('img')].filter(seen);
  const noAlt = imgs.filter((el) => !(el.alt || '').trim());

  const interactive = [...document.querySelectorAll('button, a[href], [role=button], input, select')].filter(seen);
  const tiny = interactive.filter((el) => {
    // 2.5.8 exempts a link sitting inline in a run of text.
    if (getComputedStyle(el).display === 'inline') return false;
    const r = el.getBoundingClientRect();
    return r.height < 24 || r.width < 24;
  });

  const headings = [...document.querySelectorAll('h1, h2, h3')].filter(seen);

  const families = new Map();
  const misses = [];
  const textish = [...document.querySelectorAll('p, h1, h2, h3, h4, li, a, span, button, label, td')]
    .filter((el) => seen(el) && inFrame(el))
    .slice(0, 400);

  for (const el of textish) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    const family = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    families.set(family, (families.get(family) || 0) + 1);

    const fg = rgb(s.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = behind(el);
    if (!bg) continue;
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const floor = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    // Exactly 1 means the two colours resolved identical, which in practice
    // means the detection failed rather than the text being invisible.
    if (r > 1.15 && r < floor) {
      misses.push({
        ratio: +r.toFixed(2),
        sample: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60),
        box: pct(el),
      });
    }
  }
  misses.sort((a, b) => a.ratio - b.ratio);

  const swatches = new Map();
  for (const el of interactive.filter(inFrame)) {
    const c = rgb(getComputedStyle(el).backgroundColor);
    if (!c || c.a < 0.5) continue;
    const key = c.r + ',' + c.g + ',' + c.b;
    if (!swatches.has(key)) swatches.set(key, { count: 0, el });
    swatches.get(key).count += 1;
  }
  const ranked = [...swatches.entries()].sort((a, b) => b[1].count - a[1].count);
  let outlier = null;
  if (ranked.length > 2 && ranked[0][1].count >= 3) {
    const rare = ranked[ranked.length - 1];
    const rareRgb = rgb('rgb(' + rare[0] + ')');
    // Only a genuinely chromatic one off counts. A dark button among light
    // ones is a contrast decision, not a palette slip.
    if (rare[1].count === 1 && rareRgb && sat(rareRgb) > 0.18) {
      outlier = {
        colour: 'rgb(' + rare[0] + ')',
        dominant: 'rgb(' + ranked[0][0] + ')',
        box: pct(rare[1].el),
      };
    }
  }

  /*
   * Is this the product, or a gate in front of it?
   *
   * Auditing an interstitial and reporting it as the site is worse than
   * reporting nothing, so this is checked before anything is claimed. It only
   * detects and names the wall. Nothing here tries to get around one.
   */
  const wall = (() => {
    const title = (document.title || '').toLowerCase();
    const text = (document.body.innerText || '').slice(0, 4000).toLowerCase();
    const has = (sel) => Boolean(document.querySelector(sel));

    if (
      title.includes('just a moment') ||
      has('#challenge-running, #cf-challenge-running, .cf-browser-verification') ||
      has('script[src*="challenges.cloudflare.com"]') ||
      text.includes('performing security verification') ||
      text.includes('checking your browser before accessing')
    ) {
      return { kind: 'Cloudflare', evidence: document.title || 'security verification page' };
    }
    if (has('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha')) {
      return { kind: 'CAPTCHA', evidence: 'a captcha challenge is on the page' };
    }
    if (has('script[src*="perimeterx"], script[src*="px-cloud"]')) {
      return { kind: 'PerimeterX', evidence: 'bot management script present' };
    }
    if (has('script[src*="datadome"]') || text.includes('blocked by datadome')) {
      return { kind: 'DataDome', evidence: 'bot management script present' };
    }
    if (title.includes('access denied') || title.includes('attention required')) {
      return { kind: 'Access denied', evidence: document.title };
    }
    if (text.includes('enable javascript and cookies to continue')) {
      return { kind: 'Bot check', evidence: 'page asks to enable javascript and cookies' };
    }
    return null;
  })();

  /*
   * Consistency, which is the part of visual design that can be measured.
   *
   * A design system is a finite token set, so "infer the intended scale and
   * list what misses it" is always defensible. Two spacings 3px apart, two type
   * sizes 1px apart, two greys a hair apart: each is one token that quietly
   * became two, and none of it is a matter of taste.
   */
  /*
   * Sampled over the whole document, not just the viewport. Whether a page
   * keeps to a spacing grid is a property of the page, and measuring only what
   * happens to be on screen left most pages with too few values to say
   * anything. Anchoring still requires the element to be in frame, so a note
   * always points at something visible.
   */
  const boxes = [...document.querySelectorAll('body *')]
    .filter(seen)
    .slice(0, 1200);

  const SPACING_PROPS = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom',
                         'paddingLeft', 'paddingRight', 'rowGap', 'columnGap'];
  const spacingTally = new Map();
  for (const el of boxes) {
    const cs = getComputedStyle(el);
    for (const prop of SPACING_PROPS) {
      const v = Math.round(parseFloat(cs[prop]) * 2) / 2;
      if (!(v > 0) || v > 160) continue;
      if (!spacingTally.has(v)) spacingTally.set(v, { count: 0, el });
      spacingTally.get(v).count += 1;
    }
  }
  const spacingTotal = [...spacingTally.values()].reduce((n, e) => n + e.count, 0);
  const adherenceOf = (unit) => {
    let hit = 0;
    for (const [v, e] of spacingTally) {
      const rem = v % unit;
      if (Math.min(rem, unit - rem) < 0.51) hit += e.count;
    }
    return spacingTotal ? hit / spacingTotal : 0;
  };
  /* Largest unit that still holds, because 1 always scores a perfect one. */
  /*
   * Largest unit that still holds, because 1 scores a perfect one and 2 nearly
   * always does. Below 4 there is no grid, only even numbers, so it is not
   * worth telling anyone about.
   */
  const spacingBase = spacingTotal >= 25
    ? [4, 5, 6, 8, 10, 12, 16].filter((u) => adherenceOf(u) >= 0.85).pop() ?? null
    : null;
  const spacingAdherence = spacingBase ? adherenceOf(spacingBase) : 0;
  const offGridEntries = spacingBase
    ? [...spacingTally.entries()]
        .filter(([v]) => { const r = v % spacingBase; return Math.min(r, spacingBase - r) >= 0.51; })
        .sort((a, b) => b[1].count - a[1].count)
    : [];
  const offGrid = offGridEntries.slice(0, 6).map(([value, e]) => ({ value, count: e.count }));
  const offGridBox = offGridEntries
    .map(([, e]) => boxOf(e.el))
    .find((box) => box) ?? null;

  const sizeTally = new Map();
  for (const el of boxes) {
    const chars = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .reduce((n, t) => n + t.textContent.trim().length, 0);
    if (chars < 3) continue;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    if (!(size > 0)) continue;
    if (!sizeTally.has(size)) sizeTally.set(size, { chars: 0, el });
    sizeTally.get(size).chars += chars;
  }
  const usedSizes = [...sizeTally.entries()]
    .filter(([, e]) => e.chars >= 25)
    .sort((a, b) => a[0] - b[0]);
  let typeNearDupe = null;
  for (let i = 0; i < usedSizes.length - 1 && !typeNearDupe; i += 1) {
    const a = usedSizes[i][0];
    const b = usedSizes[i + 1][0];
    if (b / a < 1.08 && b - a >= 0.5) {
      const box = boxOf(usedSizes[i + 1][1].el) || boxOf(usedSizes[i][1].el);
      if (box) typeNearDupe = { a, b, box };
    }
  }

  const inkTally = new Map();
  for (const el of boxes) {
    const cs = getComputedStyle(el);
    for (const value of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
      const c = rgb(value);
      if (!c || c.a < 0.9) continue;
      const key = c.r + ',' + c.g + ',' + c.b;
      if (!inkTally.has(key)) inkTally.set(key, { count: 0, el, lab: oklab(c) });
      inkTally.get(key).count += 1;
    }
  }
  const inks = [...inkTally.entries()].filter(([, e]) => e.count >= 2);
  let colourNearMiss = null;
  for (let i = 0; i < inks.length && !colourNearMiss; i += 1) {
    for (let j = i + 1; j < inks.length; j += 1) {
      const d = dEok(inks[i][1].lab, inks[j][1].lab);
      if (d > 0.0005 && d < 0.02) {
        const box = boxOf(inks[j][1].el) || boxOf(inks[i][1].el);
        if (box) {
          colourNearMiss = { a: 'rgb(' + inks[i][0] + ')', b: 'rgb(' + inks[j][0] + ')', box };
          break;
        }
      }
    }
  }

  let alignNearMiss = null;
  const banded = boxes
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((b) => b.r.width > 60 && b.r.height > 14 && inFrame(b.el))
    .sort((x, y) => x.r.top - y.r.top);
  /* Sorted by top edge, so a short window of neighbours is enough. */
  for (let i = 0; i < banded.length && !alignNearMiss; i += 1) {
    for (let j = i + 1; j < Math.min(i + 14, banded.length); j += 1) {
      const a = banded[i].r, b = banded[j].r;
      if (b.top > a.bottom) break;
      const drift = Math.abs(a.left - b.left);
      if (drift > 1.5 && drift < 12) {
        const box = boxOf(banded[j].el);
        if (box) { alignNearMiss = { drift: Math.round(drift * 10) / 10, box }; break; }
      }
    }
  }

  /*
   * The findings a visitor would actually notice. Text they cannot read, lines
   * they lose their place in, and a screen that never tells them what to press.
   * Measured the same way as everything else, but these are the ones that cost
   * somebody something.
   */
  const readable = [...document.querySelectorAll('p, li, dd, blockquote')]
    .filter((el) => seen(el) && el.textContent.trim().length > 60);

  let smallText = null;
  if (readable.length) {
    const tooSmall = readable.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 14);
    if (tooSmall.length) {
      const size = Math.min(...tooSmall.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      const box = tooSmall.map(boxOf).find((b) => b);
      if (box) {
        smallText = {
          size: Math.round(size * 10) / 10,
          share: Math.round((tooSmall.length / readable.length) * 100),
          box,
        };
      }
    }
  }

  /*
   * Line length, measured rather than guessed: the rendered width of the block
   * divided by the width of one character in its own font.
   */
  let longLine = null;
  for (const el of readable) {
    const cs = getComputedStyle(el);
    swatch.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const unit = swatch.measureText('mmmmmmmmmm').width / 10;
    if (!(unit > 0)) continue;
    const chars = Math.round(el.getBoundingClientRect().width / unit);
    if (chars > 95 && (!longLine || chars > longLine.chars)) {
      const box = boxOf(el);
      if (box) longLine = { chars, box };
    }
  }

  /* Above the fold, is there one obvious thing to press, or several, or none? */
  const firstScreen = interactive.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < H && r.width >= 60 && r.height >= 28;
  });
  const weigh = (el) => {
    const r = el.getBoundingClientRect();
    const c = rgb(getComputedStyle(el).backgroundColor);
    /* A filled control outweighs a bare link of the same size. */
    return Math.sqrt(r.width * r.height) * (c && c.a > 0.5 ? 1.8 : 1);
  };
  const byWeight = firstScreen.map((el) => ({ el, w: weigh(el) })).sort((a, b) => b.w - a.w);
  let competingActions = null;
  if (byWeight.length >= 2 && byWeight[0].w / byWeight[1].w < 1.12) {
    const rivals = byWeight.filter((r) => r.w / byWeight[0].w > 0.88).length;
    const box = boxOf(byWeight[0].el);
    if (box && rivals >= 2) competingActions = { count: rivals, box };
  }

  /* Or does the thing they came to press only exist further down? */
  let actionBelowFold = null;
  if (firstScreen.length === 0) {
    const below = interactive.find((el) => {
      const r = el.getBoundingClientRect();
      const c = rgb(getComputedStyle(el).backgroundColor);
      return r.top >= H && r.width >= 90 && r.height >= 32 && c && c.a > 0.5;
    });
    if (below) {
      /* Off screen by definition, so the note is anchored at the fold. */
      actionBelowFold = { box: { x: 50, y: 92, w: 24, h: 5 } };
    }
  }

  const commonSpacings = [...spacingTally.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([value]) => value);

  return {
    title: document.title || location.hostname,
    url: location.href,
    wall,
    spacingSpread: spacingTally.size,
    commonSpacings,
    spacingBase,
    spacingAdherence: Math.round(spacingAdherence * 100) / 100,
    offGrid,
    offGridBox,
    typeNearDupe,
    colourNearMiss,
    alignNearMiss,
    smallText,
    longLine,
    competingActions,
    actionBelowFold,
    mobileOverflow: 0,
    h1: h1Text ? h1Text.slice(0, 160) : null,
    h1Box: boxOf(h1),
    h1HasNumber: h1Text ? /\\d/.test(h1Text) : false,
    h1Align: h1 ? getComputedStyle(h1).textAlign : null,
    bodyAlign: getComputedStyle(document.body).textAlign,
    fieldCount: fields.length,
    requiredCount: required.length,
    formBox: boxOf(form),
    images: imgs.length,
    imagesMissingAlt: noAlt.length,
    missingAltBox: boxOf(firstInFrame(noAlt)),
    interactive: interactive.length,
    tinyTapTargets: tiny.length,
    tinyTapBox: boxOf(firstInFrame(tiny)),
    headingCount: headings.length,
    landmarkCount: document.querySelectorAll('main, nav, header, footer, aside').length,
    structureBox: boxOf(firstInFrame(headings)),
    fontFamilies: [...families.keys()].slice(0, 6),
    fontBox: boxOf(textish[0]),
    worstContrast: misses[0] || null,
    contrastMisses: misses.length,
    colourOutlier: outlier,
  };
})())`;

/** Same origin links worth walking, in the order a visitor would meet them. */
const LINKS_SCRIPT = `JSON.stringify((() => {
  const here = location.origin;
  const seenPaths = new Set([location.pathname.replace(/\\/$/, '')]);
  const out = [];
  /*
   * The whole document, not just the nav. A header's links are often inside
   * hover panels with no box to press, while the footer carries pricing,
   * contact and product as plain links a visitor can actually reach.
   */
  const pool = [...document.querySelectorAll('a[href]')];
  for (const a of pool) {
    let u;
    try { u = new URL(a.href, location.href); } catch { continue; }
    if (u.origin !== here) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const path = u.pathname.replace(/\\/$/, '');
    if (!path || seenPaths.has(path)) continue;
    if (/\\.(pdf|zip|png|jpe?g|svg|mp4|dmg|exe)$/i.test(path)) continue;
    seenPaths.add(path);
    // A link inside a closed dropdown is in the DOM but has no box, so there
    // is nothing on screen to press. Those go last, behind the ones a visitor
    // could actually reach.
    const box = [...a.getClientRects()].some((r) => r.width >= 1 && r.height >= 1);
    out.push({ url: u.origin + u.pathname, label: path, reachable: box });
    if (out.length >= 18) break;
  }
  return out.sort((a, b) => Number(b.reachable) - Number(a.reachable));
})())`;

/**
 * Injected into every page before its own script runs.
 *
 * The cursor is driven by real DOM mouse events, so moving it is just a matter
 * of dispatching input. It also earns its keep twice over: the screencast is
 * repaint driven, and a still page emits no frames at all, so an animating
 * cursor is what keeps the live view from looking frozen.
 *
 * The target and window.open overrides keep every click inside the one page we
 * are attached to. A link opening a new tab would otherwise look like a click
 * that did nothing, and hang the walk.
 */
const PAGE_PRELUDE = `
(() => {
  window.open = (u) => { if (u) location.href = u; return null; };

  const strip = () => document.querySelectorAll('a[target]').forEach((a) => a.removeAttribute('target'));

  const mount = () => {
    if (document.getElementById('${CURSOR_ID}')) return;
    const c = document.createElement('div');
    c.id = '${CURSOR_ID}';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'pointer-events:none',
      'left:0', 'top:0', 'width:22px', 'height:22px', 'margin:-11px 0 0 -11px',
      'border-radius:9999px', 'background:rgba(99,102,241,0.9)',
      'box-shadow:0 0 0 2px rgba(255,255,255,0.9), 0 2px 10px rgba(0,0,0,0.45)',
      'transition:width .12s ease, height .12s ease, background .12s ease',
    ].join(';');
    document.documentElement.appendChild(c);

    addEventListener('mousemove', (e) => {
      c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    }, true);
    addEventListener('mousedown', () => {
      c.style.width = '14px'; c.style.height = '14px';
      c.style.background = 'rgba(255,255,255,0.95)';
    }, true);
    addEventListener('mouseup', () => {
      c.style.width = '22px'; c.style.height = '22px';
      c.style.background = 'rgba(99,102,241,0.9)';
    }, true);

    new MutationObserver(strip).observe(document.documentElement, {
      subtree: true, childList: true,
    });
    strip();
  };

  /*
   * Puts a marker on whatever is about to be pressed, so the live view shows
   * the target rather than a cursor drifting toward something unnamed. It
   * lives in the page, which is what makes it appear in the screencast.
   */
  window.${MARK_FN} = (rect, label) => {
    document.getElementById('${MARK_ID}')?.remove();
    const box = document.createElement('div');
    box.id = '${MARK_ID}';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'pointer-events:none',
      'left:' + (rect.x - 6) + 'px', 'top:' + (rect.y - 6) + 'px',
      'width:' + (rect.w + 12) + 'px', 'height:' + (rect.h + 12) + 'px',
      'border:2px solid rgba(99,102,241,0.95)', 'border-radius:10px',
      'box-shadow:0 0 0 3px rgba(99,102,241,0.25), 0 0 24px rgba(99,102,241,0.55)',
      'transition:opacity .15s linear',
    ].join(';');

    const tag = document.createElement('div');
    tag.textContent = label;
    tag.style.cssText = [
      'position:absolute', 'left:-2px', 'bottom:100%', 'margin-bottom:6px',
      'white-space:nowrap', 'padding:4px 9px', 'border-radius:9999px',
      'background:rgba(99,102,241,0.95)', 'color:#F3F4F6',
      'font:600 11px/1.1 ui-sans-serif,sans-serif', 'letter-spacing:.04em',
      'box-shadow:0 4px 14px rgba(8,9,12,0.6)',
    ].join(';');
    box.appendChild(tag);
    document.documentElement.appendChild(box);
  };

  window.${UNMARK_FN} = () => document.getElementById('${MARK_ID}')?.remove();

  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
`;

/** How far a page scrolls sideways on a phone, which is always a bug. */
const MOBILE_WIDTH = 390;

interface Session {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  evaluate: <T>(expression: string) => Promise<T>;
  goto: (url: string) => Promise<void>;
  /** Walk the cursor to a link and press it. False when there was nothing to press. */
  clickLink: (url: string) => Promise<boolean>;
  /** Drag the page down so the whole thing passes the camera. */
  scrollThrough: () => Promise<void>;
  /** Check the page at phone width, then put the viewport back. */
  measureMobile: () => Promise<number>;
  close: () => Promise<void>;
}

/** Boot one browser and keep it for the whole walk. */
async function openSession(onFrame?: (frame: string) => void): Promise<Session> {
  const binary = findChrome();
  if (!binary) throw new Error('NO_CHROME');

  const profile = await mkdtemp(join(tmpdir(), 'damian-capture-'));
  const port = 9400 + Math.floor(Math.random() * 400);

  const chrome = spawn(
    binary,
    [
      '--headless=new',
      `--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let socket: WebSocket | null = null;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let messageId = 0;
  let loaded = false;
  let settled = false;
  let currentUrl = '';
  /* Where the cursor is, so the next move starts from where it stopped. */
  let cursor = { x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 };

  const close = async () => {
    try {
      socket?.close();
    } catch {
      /* already gone */
    }
    chrome.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  };

  const send = (method: string, params: Record<string, unknown> = {}) => {
    messageId += 1;
    const id = messageId;
    socket?.send(JSON.stringify({ id, method, params }));
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Damian timed out on ${method}.`));
        }
      }, 20000);
    });
  };

  try {
    let endpoint: string | null = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = (await res.json()) as { type: string; webSocketDebuggerUrl: string }[];
        const page = targets.find((t) => t.type === 'page');
        if (page) {
          endpoint = page.webSocketDebuggerUrl;
          break;
        }
      } catch {
        /* not listening yet */
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!endpoint) throw new Error('Chrome did not come up.');

    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket?.addEventListener('open', () => resolve());
      socket?.addEventListener('error', () => reject(new Error('Could not attach to Chrome.')));
    });

    socket.addEventListener('message', (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id && pending.has(data.id)) {
        const entry = pending.get(data.id)!;
        pending.delete(data.id);
        if (data.error) entry.reject(new Error(JSON.stringify(data.error)));
        else entry.resolve(data.result);
        return;
      }
      if (data.method === 'Page.loadEventFired') loaded = true;

      /*
       * A single page app routes without ever firing load, so waiting on load
       * alone hangs forever the moment a click replaces a navigate.
       */
      if (data.method === 'Page.frameNavigated' && !data.params.frame.parentId) {
        settled = false;
        currentUrl = data.params.frame.url;
      }
      if (data.method === 'Page.navigatedWithinDocument') {
        currentUrl = data.params.url;
        settled = true;
      }
      if (
        data.method === 'Page.lifecycleEvent' &&
        (data.params.name === 'networkIdle' || data.params.name === 'load')
      ) {
        settled = true;
      }

      if (data.method === 'Page.screencastFrame') {
        /*
         * Acked on the bare socket, never through send(). Each send registers
         * a promise and a twenty second timer, and at fifteen frames a second
         * that is hundreds of live timers doing nothing.
         */
        socket?.send(
          JSON.stringify({
            id: (messageId += 1),
            method: 'Page.screencastFrameAck',
            params: { sessionId: data.params.sessionId },
          }),
        );
        onFrame?.(data.params.data as string);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.setLifecycleEventsEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_PRELUDE });
    await send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const evaluate = async <T>(expression: string): Promise<T> => {
      const result = (await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: string }; exceptionDetails?: unknown };
      if (result.exceptionDetails) throw new Error('Damian could not read that page.');
      return JSON.parse(result.result?.value ?? '{}') as T;
    };

    /* Wait on whichever signal this page actually produces, then settle. */
    const rest = async (budget = 15000) => {
      const deadline = Date.now() + budget;
      while (!loaded && !settled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 1100));
    };

    const goto = async (url: string) => {
      loaded = false;
      settled = false;
      await send('Page.navigate', { url });
      await rest();
      currentUrl = url;
    };

    /* Move in steps, so a viewer sees the cursor travel rather than teleport. */
    const moveTo = async (x: number, y: number, steps = 18) => {
      const from = { ...cursor };
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: from.x + (x - from.x) * ratio,
          y: from.y + (y - from.y) * ratio,
          button: 'none',
          buttons: 0,
        });
        await new Promise((r) => setTimeout(r, 16));
      }
      cursor = { x, y };
    };

    const clickLink = async (url: string) => {
      /*
       * Resolved immediately before the press. Lazy loaded content shifts the
       * layout, and a rect measured a second ago points at the wrong thing.
       */
      const found = await evaluate<boolean>(
        `JSON.stringify((() => {
          const want = ${JSON.stringify(url)};
          const trim = (v) => (v.endsWith('/') ? v.slice(0, -1) : v);
          const el = [...document.querySelectorAll('a[href]')].find((a) => {
            try { return trim(new URL(a.href, location.href).href) === trim(want); }
            catch { return false; }
          });
          if (!el) return false;
          /* Instant, because a smooth scroll means the rect moves under us. */
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          return true;
        })())`,
      );
      if (!found) return false;
      await new Promise((r) => setTimeout(r, 420));

      const spot = await evaluate<{ x: number; y: number } | null>(
        `JSON.stringify((() => {
          const want = ${JSON.stringify(url)};
          // No regex here on purpose. A backslash inside a template literal is
          // an escape, so a trailing slash pattern arrives at the page broken.
          const trim = (v) => (v.endsWith('/') ? v.slice(0, -1) : v);
          const el = [...document.querySelectorAll('a[href]')].find((a) => {
            try { return trim(new URL(a.href, location.href).href) === trim(want); }
            catch { return false; }
          });
          if (!el) return null;
          const r = [...el.getClientRects()].find((b) => b.width >= 1 && b.height >= 1);
          if (!r) return null;

          /*
           * Having a box is not the same as being pressable. A link inside a
           * hover panel is laid out, on screen, and still loses the hit test to
           * whatever is painted over it, so the press lands on a div and does
           * nothing. Try a few points across the link and only report one that
           * actually resolves to the link itself.
           */
          for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25]]) {
            const x = r.x + r.width * fx;
            const y = r.y + r.height * fy;
            if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x, y };
          }
          return null;
        })())`,
      );
      if (!spot) return false;

      /* Say what is being pressed before pressing it. */
      await evaluate(
        `JSON.stringify((() => {
          const want = ${JSON.stringify(url)};
          const trim = (v) => (v.endsWith('/') ? v.slice(0, -1) : v);
          const el = [...document.querySelectorAll('a[href]')].find((a) => {
            try { return trim(new URL(a.href, location.href).href) === trim(want); }
            catch { return false; }
          });
          if (!el) return {};
          const r = [...el.getClientRects()].find((b) => b.width >= 1 && b.height >= 1);
          if (!r) return {};
          const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          window.${MARK_FN}(
            { x: r.x, y: r.y, w: r.width, h: r.height },
            (text ? text.slice(0, 42) : new URL(el.href).pathname),
          );
          return {};
        })())`,
      ).catch(() => undefined);

      await new Promise((r) => setTimeout(r, 700));
      await moveTo(spot.x, spot.y);
      await new Promise((r) => setTimeout(r, 260));

      loaded = false;
      settled = false;
      const before = currentUrl;

      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: spot.x,
        y: spot.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 90));
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: spot.x,
        y: spot.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });

      await evaluate(`JSON.stringify((window.${UNMARK_FN}?.(), {}))`).catch(() => undefined);

      await rest(12000);
      /* A click that moved nothing is a miss, not a navigation. */
      return currentUrl !== before || loaded || settled;
    };

    const scrollThrough = async () => {
      const height = await evaluate<{ page: number }>(
        `JSON.stringify({ page: document.documentElement.scrollHeight })`,
      );
      const passes = Math.min(4, Math.floor(height.page / VIEWPORT_HEIGHT));
      for (let pass = 0; pass < passes; pass += 1) {
        try {
          await send('Input.synthesizeScrollGesture', {
            x: VIEWPORT_WIDTH / 2,
            y: VIEWPORT_HEIGHT / 2,
            xDistance: 0,
            /* Negative scrolls the page down. The sign reads backwards. */
            yDistance: -(VIEWPORT_HEIGHT - 120),
            speed: 900,
            preventFling: true,
            gestureSourceType: 'mouse',
          });
        } catch {
          /* The gesture is experimental. A wheel loop is the fallback. */
          for (let tick = 0; tick < 14; tick += 1) {
            await send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: VIEWPORT_WIDTH / 2,
              y: VIEWPORT_HEIGHT / 2,
              deltaX: 0,
              deltaY: 56,
              button: 'none',
              buttons: 0,
            });
            await new Promise((r) => setTimeout(r, 30));
          }
        }
        await new Promise((r) => setTimeout(r, 220));
      }
      await evaluate(`JSON.stringify((window.scrollTo(0, 0), {}))`);
      await new Promise((r) => setTimeout(r, 320));
    };

    /*
     * Narrow the viewport, measure, and set it straight back. A page that
     * scrolls sideways on a phone is something every visitor on a phone hits,
     * and it cannot be seen at desktop width.
     */
    const measureMobile = async () => {
      try {
        await send('Emulation.setDeviceMetricsOverride', {
          width: MOBILE_WIDTH,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await new Promise((r) => setTimeout(r, 700));
        const overflow = await evaluate<{ px: number }>(
          `JSON.stringify({ px: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)) })`,
        );
        return overflow.px;
      } catch {
        return 0;
      } finally {
        await send('Emulation.setDeviceMetricsOverride', {
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
          mobile: false,
        }).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 400));
      }
    };

    return { send, evaluate, goto, clickLink, scrollThrough, measureMobile, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function shoot(session: Session): Promise<string> {
  const shot = (await session.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 78,
    captureBeyondViewport: false,
  })) as { data: string };
  return `data:image/jpeg;base64,${shot.data}`;
}

const labelFor = (url: URL) => {
  const path = url.pathname.replace(/\/$/, '');
  return path.length ? path : '/';
};

/**
 * Walk the site.
 *
 * The entry page first, then whatever the navigation points at, each page
 * handed back the moment it is captured so the interface can show the walk
 * happening rather than waiting for the whole thing. One browser for the whole
 * trip, because booting Chrome is most of the cost.
 */
export async function* crawl(
  rawUrl: string,
  hooks: CrawlHooks,
): AsyncGenerator<CrawlEvent> {
  const entry = assertPublicHttpUrl(rawUrl);

  /*
   * Producer and consumer, deliberately.
   *
   * Frames arrive from the socket listener while the walk is awaiting a
   * navigation or a scroll. If the generator only drained between steps, every
   * frame painted during a ten second scroll would queue up and arrive in one
   * burst afterwards, which is a slideshow rather than a live view.
   */
  const queue: CrawlEvent[] = [];
  let wake: (() => void) | null = null;
  let walked = false;
  let failure: unknown = null;

  /* Narrowing gets confused by the closure, so the waiter is read then cleared. */
  const notify = () => {
    const waiter = wake;
    wake = null;
    waiter?.();
  };

  const push = (event: CrawlEvent) => {
    queue.push(event);
    notify();
  };

  const session = await openSession((frame) => push({ type: 'frame', frame }));

  const capturePage = async (url: string, label: string): Promise<PageCapture> => {
    const audit = await session.evaluate<DomAudit>(AUDIT_SCRIPT);
    const screenshot = await shoot(session);
    /* Measured after the shot, so narrowing the viewport cannot affect it. */
    const mobileOverflow = await session.measureMobile();
    return { url, label, screenshot, audit: { ...audit, url, mobileOverflow } };
  };

  const walk = (async () => {
    try {
      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 55,
        maxWidth: 900,
        maxHeight: 563,
        everyNthFrame: 2,
      });

      await session.goto(entry.href);

      /*
       * Look around first, then stop and think. The scroll is the looking, and
       * the hook is the thinking, which holds the walk until every note on this
       * page has been read.
       */
      await session.scrollThrough();
      await hooks.onPage(await capturePage(entry.href, labelFor(entry)), 0);

      const links = await session.evaluate<{ url: string; label: string; reachable: boolean }[]>(
        LINKS_SCRIPT,
      );
      const route = links.slice(0, MAX_PAGES - 1);
      push({ type: 'plan', pages: route.map((link) => link.label) });
      let visited = 1;

      for (const link of route) {
        try {
          /*
           * Pressed, not navigated to. A viewer should see the cursor reach the
           * link and the page change under it. Navigation is the safety net for
           * when the link is not on screen to be pressed.
           */
          const clicked = await session.clickLink(link.url);
          push({ type: 'move', label: link.label, clicked });
          if (!clicked) await session.goto(link.url);

          await session.scrollThrough();
          await hooks.onPage(await capturePage(link.url, link.label), visited);
          visited += 1;
        } catch {
          /* One bad page does not end the walk. */
        }
      }
    } catch (error) {
      failure = error;
    } finally {
      walked = true;
      notify();
    }
  })();

  try {
    while (!walked || queue.length) {
      if (queue.length) {
        yield queue.shift() as CrawlEvent;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    await walk;
    if (failure) throw failure;
  } finally {
    await session.send('Page.stopScreencast').catch(() => undefined);
    await session.close();
  }
}
