import { NextResponse } from 'next/server';
import { capture, findChrome } from '@/lib/capture';
import { deriveFindings } from '@/lib/findings';

/* Chrome is spawned per request, so this cannot run on the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Send a JSON body with a url.' }, { status: 400 });
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    return NextResponse.json({ error: 'Damian needs a URL to open.' }, { status: 400 });
  }

  if (!findChrome()) {
    /*
     * No browser on this host, which is the normal case on serverless. The
     * client falls back to the scripted demo and says so, rather than
     * pretending a capture happened.
     */
    return NextResponse.json({ error: 'NO_CHROME' }, { status: 503 });
  }

  try {
    const { screenshot, audit } = await capture(url.trim());
    return NextResponse.json({ screenshot, audit, findings: deriveFindings(audit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Damian could not open that page.';
    return NextResponse.json(
      { error: message },
      { status: message === 'NO_CHROME' ? 503 : 422 },
    );
  }
}
