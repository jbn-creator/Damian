import { crawl, findChrome, type PageCapture } from '@/lib/capture';
import { analysePage, summarise } from '@/lib/findings';

/* Chrome is spawned per request, so this cannot run on the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

      try {
        for await (const capture of crawl(target)) {
          const index = captures.length;
          captures.push(capture);
          const { notes, says } = analysePage(capture, index, seenRules);
          emit({ type: 'page', index, capture, notes, says });
        }

        if (captures.length === 0) {
          emit({ type: 'error', error: 'Damian could not open that page.' });
        } else {
          emit({ type: 'done', ...summarise(captures) });
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
