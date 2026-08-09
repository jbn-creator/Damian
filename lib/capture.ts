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
 * model call. The findings this returns are measured off the DOM, so every
 * number Damian quotes is one he actually counted.
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

/** Element rectangle, in percentages of the captured image. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DomAudit {
  title: string;
  url: string;
  h1: string | null;
  h1Box: Rect | null;
  h1HasNumber: boolean;
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
}

export interface CaptureResult {
  screenshot: string;
  audit: DomAudit;
}

/*
 * The capture is one viewport, not the whole document.
 *
 * Resizing the viewport to the full page height reflows responsive layouts
 * into something no visitor ever sees, and on a wide document it produces an
 * image several times the width of the content, so the page ends up as a strip
 * down one side. A viewport frame is what someone looking at the site sees,
 * which is the only frame the pins mean anything in.
 */
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

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

/** The measurement script. Runs in the page and returns plain data. */
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
  // Counts run over the whole document. Pins may only anchor to something
  // inside the frame that was photographed.
  const inFrame = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  };
  const firstInFrame = (list) => list.find(inFrame) || null;
  const boxOf = (el) => (el && inFrame(el) ? pct(el) : null);
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' &&
      s.display !== 'none' && s.opacity !== '0';
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
    // 2.5.8 exempts a link sitting inline in a run of text, so an inline
    // display is not a finding. Counting those turns every article into a
    // hundred false positives.
    if (getComputedStyle(el).display === 'inline') return false;
    const r = el.getBoundingClientRect();
    return r.height < 24 || r.width < 24;
  });

  // Anchor the structural finding to the topmost heading actually on screen.
  const headings = [...document.querySelectorAll('h1, h2, h3')].filter(seen);

  return {
    title: document.title || location.hostname,
    url: location.href,
    h1: h1Text ? h1Text.slice(0, 160) : null,
    h1Box: boxOf(h1),
    h1HasNumber: h1Text ? /\\d/.test(h1Text) : false,
    fieldCount: fields.length,
    requiredCount: required.length,
    formBox: boxOf(form),
    images: imgs.length,
    imagesMissingAlt: noAlt.length,
    missingAltBox: boxOf(firstInFrame(noAlt)),
    interactive: interactive.length,
    tinyTapTargets: tiny.length,
    tinyTapBox: boxOf(firstInFrame(tiny)),
    headingCount: [...document.querySelectorAll('h1,h2,h3')].filter(seen).length,
    landmarkCount: document.querySelectorAll('main, nav, header, footer, aside').length,
    structureBox: boxOf(firstInFrame(headings)),
  };
})())`;

/** Open the target, let it settle, measure it, photograph it. */
export async function capture(rawUrl: string): Promise<CaptureResult> {
  const url = assertPublicHttpUrl(rawUrl);
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

  const cleanup = async () => {
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
    /* Wait for the debugging endpoint rather than guessing a boot time. */
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

    let loaded = false;
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

    await send('Page.navigate', { url: url.href });

    /* Wait for load, then a short settle for the paint that follows it. */
    const deadline = Date.now() + 15000;
    while (!loaded && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 1200));

    const evaluate = async <T>(expression: string): Promise<T> => {
      const result = (await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: string }; exceptionDetails?: unknown };
      if (result.exceptionDetails) throw new Error('Damian could not read that page.');
      return JSON.parse(result.result?.value ?? '{}') as T;
    };

    const audit = await evaluate<DomAudit>(AUDIT_SCRIPT);

    const shot = (await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 78,
      captureBeyondViewport: false,
    })) as { data: string };

    return {
      screenshot: `data:image/jpeg;base64,${shot.data}`,
      audit: { ...audit, url: url.href },
    };
  } finally {
    await cleanup();
  }
}
