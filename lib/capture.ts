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
  structureBox: Rect | null;
  fontFamilies: string[];
  fontBox: Rect | null;
  worstContrast: ContrastMiss | null;
  contrastMisses: number;
  colourOutlier: ColourOutlier | null;
}

export interface PageCapture {
  url: string;
  /** Short label for the page switcher, such as "/solutions". */
  label: string;
  screenshot: string;
  audit: DomAudit;
}

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

  const rgb = (value) => {
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
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

  return {
    title: document.title || location.hostname,
    url: location.href,
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
  const scopes = [...document.querySelectorAll('nav, header')];
  const pool = scopes.length
    ? scopes.flatMap((s) => [...s.querySelectorAll('a[href]')])
    : [...document.querySelectorAll('a[href]')];
  for (const a of pool) {
    let u;
    try { u = new URL(a.href, location.href); } catch { continue; }
    if (u.origin !== here) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const path = u.pathname.replace(/\\/$/, '');
    if (!path || seenPaths.has(path)) continue;
    if (/\\.(pdf|zip|png|jpe?g|svg|mp4|dmg|exe)$/i.test(path)) continue;
    seenPaths.add(path);
    out.push({ url: u.origin + u.pathname, label: path });
    if (out.length >= 12) break;
  }
  return out;
})())`;

interface Session {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  evaluate: <T>(expression: string) => Promise<T>;
  goto: (url: string) => Promise<void>;
  close: () => Promise<void>;
}

/** Boot one browser and keep it for the whole walk. */
async function openSession(): Promise<Session> {
  const binary = findChrome();
  if (!binary) throw new Error('NO_CHROME');

  const profile = await mkdtemp(join(tmpdir(), 'damian-capture-'));
  const port = 9400 + Math.floor(Math.random() * 400);

  const chrome = spawn(
    binary,
    [
      '--headless=new',
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
    });

    await send('Page.enable');
    await send('Runtime.enable');
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

    const goto = async (url: string) => {
      loaded = false;
      await send('Page.navigate', { url });
      const deadline = Date.now() + 15000;
      while (!loaded && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      /* A short settle for the paint that follows load. */
      await new Promise((r) => setTimeout(r, 1100));
    };

    return { send, evaluate, goto, close };
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
export async function* crawl(rawUrl: string): AsyncGenerator<PageCapture> {
  const entry = assertPublicHttpUrl(rawUrl);
  const session = await openSession();

  try {
    await session.goto(entry.href);

    const audit = await session.evaluate<DomAudit>(AUDIT_SCRIPT);
    yield {
      url: entry.href,
      label: labelFor(entry),
      screenshot: await shoot(session),
      audit: { ...audit, url: entry.href },
    };

    const links = await session.evaluate<{ url: string; label: string }[]>(LINKS_SCRIPT);

    for (const link of links.slice(0, MAX_PAGES - 1)) {
      try {
        await session.goto(link.url);
        const pageAudit = await session.evaluate<DomAudit>(AUDIT_SCRIPT);
        yield {
          url: link.url,
          label: link.label,
          screenshot: await shoot(session),
          audit: { ...pageAudit, url: link.url },
        };
      } catch {
        /* One bad page does not end the walk. */
      }
    }
  } finally {
    await session.close();
  }
}
