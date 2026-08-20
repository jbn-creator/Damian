import { crawl, findChrome, type PageCapture } from '@/lib/capture';
import { analysePage, summarise } from '@/lib/findings';
import { canJudge, judgePage, judgeWalk, newReceipt, toUsd } from '@/lib/judge';
import type { TestCredentials } from '@/lib/types';

/* Chrome is spawned per request, so this cannot run on the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The walk's own clock, kept under the platform's.
 *
 * When maxDuration kills the function, everything is lost including the pages
 * that already succeeded, and the client sees a blank error. So the walk stops
 * itself first: past this budget the crawl ends, pending judgement falls back
 * to the measured rules, and whatever completed goes out in a real done event.
 * The environment override exists so a timeout can be forced in a test rather
 * than assumed to work.
 */
const DEADLINE_MS = Number(process.env.DAMIAN_DEADLINE_MS ?? 280_000);

/**
 * Average silent reading speed, in words per second.
 *
 * 238 words per minute is where the reading research settles, and 238 / 60 is
 * where this number comes from. A note stays up for as long as it takes to
 * read it, so the walk moves at the pace of whoever is watching rather than at
 * the pace of the browser.
 */
const WORDS_PER_SECOND = 3.96666666667;

/** Long enough to register, short enough not to stall on a three word note. */
const MIN_DWELL = 900;
const MAX_DWELL = 6000;

const dwellFor = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_DWELL, Math.max(MIN_DWELL, (words / WORDS_PER_SECOND) * 1000));
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The walk, streamed.
 *
 * One newline delimited JSON object per event, flushed as it happens, so the
 * interface can show Damian moving through the site instead of staring at a
 * spinner until the whole crawl finishes.
 */
export async function POST(request: Request) {
  let url: unknown;
  let auth: unknown;
  try {
    ({ url, credentials: auth } = await request.json());
  } catch {
    return Response.json({ error: 'Send a JSON body with a url.' }, { status: 400 });
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    return Response.json({ error: 'Damian needs a URL to open.' }, { status: 400 });
  }

  /*
   * Held for the length of this request and no longer. Typed into the target's
   * own form over CDP, never persisted, never logged, and never part of
   * anything sent to the model.
   */
  const credentials =
    auth &&
    typeof auth === 'object' &&
    typeof (auth as TestCredentials).username === 'string' &&
    typeof (auth as TestCredentials).password === 'string' &&
    (auth as TestCredentials).username.length > 0
      ? { username: (auth as TestCredentials).username, password: (auth as TestCredentials).password }
      : null;

  if (!findChrome()) {
    /*
     * No browser on this host, which is the normal case on serverless. The
     * client falls back to the scripted demo and says so, rather than
     * pretending a capture happened.
     */
    return Response.json({ error: 'NO_CHROME' }, { status: 503 });
  }

  const target = url.trim();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      const remaining = () => DEADLINE_MS - (Date.now() - startedAt);

      /* False once the client is gone. Nothing downstream may throw for that. */
      let open = true;
      const emit = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };

      const captures: PageCapture[] = [];
      /* Carried across pages so a repeated finding is not read out five times. */
      const seenRules = new Set<string>();
      /* What this run spends at the model, counted from real usage figures. */
      const receipt = newReceipt();

      /*
       * The travel to each page, kept for replay. Frames before the first move
       * are the entry loading and stream straight through, because narration
       * has nothing to say yet. After that the browser runs ahead of the
       * narration, so each journey's frames are held and replayed, quickly, at
       * the moment the narration actually goes there. The viewer sees every
       * trip in order; nothing on screen is ever ahead of what is being said.
       */
      const segments: string[][] = [];
      const moves: { label: string; clicked: boolean }[] = [];
      let traveling = 0;

      /*
       * Narration is a chain and judgement is not. Each page's model call
       * starts the moment that page is captured, so calls overlap the crawl
       * and each other, but their results are spoken strictly in page order:
       * a later page finishing first waits its turn.
       */
      let narration: Promise<void> = Promise.resolve();
      const narrate = (step: () => Promise<void>) => {
        narration = narration.then(step).catch(() => undefined);
      };

      /*
       * At most two judge calls in flight. The endpoint serves one call per
       * key at a time, so five fired at once queue on the provider's side and
       * the last two burn their whole 90s timeout waiting to be served: seen
       * live, pages 3 and 4 timing out while pages 0-2 answered back to back.
       * Held here, a call's clock only starts when it can actually run.
       */
      let judgeSlots = 2;
      const judgeQueue: (() => void)[] = [];
      const judgeSlot = async <T>(job: () => Promise<T>): Promise<T> => {
        while (judgeSlots <= 0) await new Promise<void>((free) => judgeQueue.push(free));
        judgeSlots -= 1;
        try {
          return await job();
        } finally {
          judgeSlots += 1;
          judgeQueue.shift()?.();
        }
      };

      /** The judgement, or null once the budget is spent. Never hangs the walk. */
      const budgeted = <T>(pending: Promise<T | null>): Promise<T | null> => {
        const ms = remaining();
        if (ms <= 0) return Promise.resolve(null);
        return new Promise((resolve) => {
          /* Cleared on settle, so a spent race cannot hold the function open. */
          const timer = setTimeout(() => resolve(null), ms);
          pending.then(
            (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
          );
        });
      };

      const readPage = async (capture: PageCapture, index: number) => {
        captures.push(capture);
        /*
         * Judgement first, measurement second. The rules can only report what
         * they can count, so when a model is available it decides what matters
         * and the rules stand behind it for when it is not.
         */
        const judging = judgeSlot(() => judgePage(capture, index, receipt)).catch(() => null);

        narrate(async () => {
          if (!open) return;

          const move = moves[index];
          if (move) {
            emit({ type: 'move', label: move.label, clicked: move.clicked });
            const reel = segments[index] ?? [];
            for (const frame of reel) {
              emit({ type: 'frame', frame });
              await wait(Math.min(70, 2500 / reel.length));
            }
          }

          const judged = await budgeted(judging);
          /*
           * When the model was expected and did not answer, the fallback is
           * named out loud. The rules answering invisibly cost 44 commits of
           * not knowing which brain had spoken; same honesty rule as the bot
           * wall, applied to Damian himself.
           */
          if (!judged && canJudge() && !capture.audit.wall) {
            emit({
              type: 'aside',
              says: `The model did not answer for ${capture.label}, so these notes are measured arithmetic only.`,
            });
          }
          const { notes, says } = judged ?? analysePage(capture, index, seenRules);
          emit({ type: 'page', index, capture, notes, says });

          for (let order = 0; order < notes.length; order += 1) {
            const note = notes[order];
            const line = says[order] ?? note.note ?? note.title;
            emit({ type: 'reveal', pageIndex: index, noteId: note.id, says: line });
            /* Past the budget nothing is held; said now beats lost. */
            if (remaining() > 0) await wait(dwellFor(line));
          }

          if (notes.length === 0 && remaining() > 0) await wait(MIN_DWELL);
        });
      };

      try {
        for await (const event of crawl(target, { onPage: readPage }, credentials)) {
          /* Out of time: stop the browser, keep everything already captured. */
          if (remaining() <= 0) break;

          if (event.type === 'frame') {
            if (traveling === 0) emit({ type: 'frame', frame: event.frame });
            else (segments[traveling] ??= []).push(event.frame);
            continue;
          }

          if (event.type === 'move') {
            traveling += 1;
            moves[traveling] = { label: event.label, clicked: event.clicked };
            continue;
          }

          /* Spoken where it lands in the walk, not where the crawl got to. */
          if (event.type === 'plan') {
            const pages = event.pages;
            narrate(async () => emit({ type: 'plan', pages }));
            continue;
          }

          if (event.type === 'auth') {
            const { ok, evidence } = event;
            narrate(async () => emit({ type: 'auth', ok, evidence }));
            continue;
          }

          /* The guard refused something. The viewer hears why, in order. */
          if (event.type === 'guard') {
            const { reason } = event;
            narrate(async () => emit({ type: 'aside', says: reason }));
            continue;
          }
        }

        await narration;

        if (captures.length === 0) {
          emit({ type: 'error', error: 'Damian could not open that page.' });
        } else {
          /*
           * The board is about the product rather than the pixels, so it is
           * asked once, here, with the whole walk in view. A single page cannot
           * tell you what to build next. The measured quick wins stand in when
           * there is no model or nothing usable comes back.
           */
          const measured = summarise(captures);
          const ideas = await budgeted(judgeWalk(captures, receipt).catch(() => null));
          if (!ideas && canJudge()) {
            emit({
              type: 'aside',
              says: 'The model did not answer for the board, so these opportunities are the measured quick wins.',
            });
          }
          /*
           * The receipt goes to the person paying, not just to judge.log.
           * Token counts are exact; the dollar figure is those counts at the
           * configured rate.
           */
          if (receipt.calls > 0) {
            emit({
              type: 'aside',
              says: `This walk cost ${receipt.calls} model calls, ${(
                (receipt.promptTokens + receipt.completionTokens) / 1000
              ).toFixed(1)}k tokens, about $${toUsd(receipt).toFixed(3)}.`,
            });
          }
          emit({
            type: 'done',
            ...measured,
            ideas: ideas ?? measured.ideas,
            receipt: receipt.calls > 0 ? { ...receipt, usd: toUsd(receipt) } : null,
          });
        }
      } catch (error) {
        /*
         * A partial run is a result; only a walk that saw nothing is an error.
         * Whatever already made it out is closed off with a real done event so
         * the client never loses pages that succeeded.
         */
        await narration.catch(() => undefined);
        if (captures.length === 0) {
          const message =
            error instanceof Error ? error.message : 'Damian could not open that page.';
          emit({ type: 'error', error: message });
        } else {
          const measured = summarise(captures);
          emit({ type: 'done', ...measured });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* the client went first */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      /* Keep proxies from holding the chunks back. */
      'x-accel-buffering': 'no',
    },
  });
}
