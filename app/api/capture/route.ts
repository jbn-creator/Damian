import { crawl, findChrome, type PageCapture } from '@/lib/capture';
import { analysePage, summarise } from '@/lib/findings';
import { judgePage, judgeWalk } from '@/lib/judge';

/* Chrome is spawned per request, so this cannot run on the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: 'Send a JSON body with a url.' }, { status: 400 });
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    return Response.json({ error: 'Damian needs a URL to open.' }, { status: 400 });
  }

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
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const captures: PageCapture[] = [];
      /* Carried across pages so a repeated finding is not read out five times. */
      const seenRules = new Set<string>();

      /*
       * Held here rather than on the client, because it has to hold the walk
       * as well. A note goes up, the browser stops where it is, and nothing
       * else happens until there has been time to read it.
       */
      const readPage = async (capture: PageCapture, index: number) => {
        captures.push(capture);
        /*
         * Judgement first, measurement second. The rules can only report what
         * they can count, so when a model is available it decides what matters
         * and the rules stand behind it for when it is not.
         */
        const { notes, says } =
          (await judgePage(capture, index)) ?? analysePage(capture, index, seenRules);
        emit({ type: 'page', index, capture, notes, says });

        for (let order = 0; order < notes.length; order += 1) {
          const note = notes[order];
          const line = says[order] ?? note.note ?? note.title;
          emit({ type: 'reveal', pageIndex: index, noteId: note.id, says: line });
          await wait(dwellFor(line));
        }

        if (notes.length === 0) await wait(MIN_DWELL);
      };

      try {
        for await (const event of crawl(target, { onPage: readPage })) {
          /* Frames are the live view. They pass straight through. */
          if (event.type === 'frame') {
            emit({ type: 'frame', frame: event.frame });
            continue;
          }

          if (event.type === 'plan') {
            emit({ type: 'plan', pages: event.pages });
            continue;
          }

          if (event.type === 'move') {
            emit({ type: 'move', label: event.label, clicked: event.clicked });
            continue;
          }
        }

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
          const ideas = await judgeWalk(captures);
          emit({ type: 'done', ...measured, ideas: ideas ?? measured.ideas });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Damian could not open that page.';
        emit({ type: 'error', error: message });
      } finally {
        controller.close();
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
