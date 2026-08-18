'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIT_PINS,
  DEFAULT_TARGET_URL,
  PRODUCT_IDEAS,
  SCORECARD_METRICS,
  STATE_ACTIVITY,
} from './mock-data';
import type {
  AuditPin,
  DamianLog,
  DamianState,
  ProductIdea,
  ScorecardMetric,
  TestCredentials,
} from './types';

/** Where the run's contents came from. */
export type RunMode = 'live' | 'demo';

/** One page Damian walked, and what he said about it. */
export interface CapturedPage {
  url: string;
  label: string;
  /** A real capture. Null means the simulated surface stands in. */
  screenshot: string | null;
  notes: AuditPin[];
}

export interface DamianRun {
  url: string;
  setUrl: (next: string) => void;

  credentials: TestCredentials | null;
  saveCredentials: (next: TestCredentials) => void;
  clearCredentials: () => void;

  state: DamianState;
  activity: string;
  progress: number;
  isRunning: boolean;
  hasCompleted: boolean;

  mode: RunMode;
  /** The live view while Damian is walking. Null once he stops. */
  liveFrame: string | null;
  /** Where he is heading, set for as long as the move is happening. */
  heading: { to: string; clicked: boolean } | null;
  /** Why the run fell back to the scripted demo, if it did. */
  fallbackReason: string | null;

  /** Every page walked so far, in the order Damian met them. */
  pages: CapturedPage[];
  /** Which page the canvas is showing. Follows the walk, then yours. */
  activePage: number;
  setActivePage: (index: number) => void;
  /** Notes revealed so far on the active page. */
  visibleNotes: AuditPin[];

  logs: DamianLog[];
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];

  launch: () => void;
  reset: () => void;
}

const NO_IDEAS: ProductIdea[] = [];
const NO_METRICS: ScorecardMetric[] = [];
const NO_PAGES: CapturedPage[] = [];

/** How long Damian pauses between placing one note and the next. */
const NOTE_BEAT = 900;

/**
 * The state machine behind a run.
 *
 * Damian walks the site through the capture route, which streams one page back
 * as it is captured. Each page is shown the moment it arrives, then its notes
 * are placed one at a time so the walk reads as someone looking rather than a
 * result appearing. When no browser is available on the host it falls back to
 * the scripted demo and says so, rather than pretending a capture happened.
 */
export function useDamian(): DamianRun {
  /* The composer opens empty, so the send button starts correctly disabled. */
  const [url, setUrl] = useState('');
  const [credentials, setCredentials] = useState<TestCredentials | null>(null);
  const [state, setState] = useState<DamianState>('idle');
  const [logs, setLogs] = useState<DamianLog[]>([]);
  const [pages, setPages] = useState<CapturedPage[]>(NO_PAGES);
  const [activePage, setActivePage] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<ProductIdea[]>(NO_IDEAS);
  const [metrics, setMetrics] = useState<ScorecardMetric[]>(NO_METRICS);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  /* True while he is moving between pages, false while a page is being read. */
  const [showLive, setShowLive] = useState(false);
  const [heading, setHeading] = useState<{ to: string; clicked: boolean } | null>(null);
  const [mode, setMode] = useState<RunMode>('demo');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const attempt = useRef(0);
  const startedAt = useRef(0);
  /* Where the next scheduled beat lands, so pages queue instead of colliding. */
  const beat = useRef(0);
  const logSeq = useRef(0);

  const clearSchedule = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearSchedule, [clearSchedule]);

  const reset = useCallback(() => {
    attempt.current += 1;
    clearSchedule();
    setState('idle');
    setLogs([]);
    setPages(NO_PAGES);
    setActivePage(0);
    setRevealed([]);
    setIdeas(NO_IDEAS);
    setMetrics(NO_METRICS);
    setFallbackReason(null);
    setLiveFrame(null);
    setHeading(null);
  }, [clearSchedule]);

  /** Queue a line for Damian to say, in order, on the shared beat. */
  const say = useCallback(
    (
      message: string,
      type: DamianLog['type'],
      ticket: number,
      nav?: DamianLog['nav'],
    ) => {
      const at = Math.max(beat.current, Date.now());
      beat.current = at + NOTE_BEAT;
      logSeq.current += 1;
      const id = `log-${logSeq.current}`;
      timers.current.push(
        setTimeout(
          () => {
            if (ticket !== attempt.current) return;
            setLogs((current) =>
              current.some((entry) => entry.id === id)
                ? current
                : [
                    ...current,
                    {
                      id,
                      timestamp: `${((Date.now() - startedAt.current) / 1000).toFixed(1)}s`,
                      message,
                      type,
                      nav,
                    },
                  ],
            );
          },
          Math.max(0, at - Date.now()),
        ),
      );
      return at;
    },
    [],
  );

  /*
   * Land on a page and show it. The notes are not scheduled here: the server
   * reveals them one at a time and holds the browser still between each, so
   * the pace of the walk is the pace of reading it.
   */
  const stage = useCallback(
    (page: CapturedPage, index: number, ticket: number) => {
      if (ticket !== attempt.current) return;
      setPages((current) => {
        if (current.some((existing) => existing.url === page.url)) return current;
        return [...current, page];
      });
      setActivePage(index);
      /* Stop watching the browser: this page is what is being read now. */
      setShowLive(false);
      setHeading(null);
      say(`Opened ${page.label}. Reading it.`, 'info', ticket);
    },
    [say],
  );

  /** The scripted demo, played back through the same staging. */
  const playDemo = useCallback(
    (ticket: number) => {
      const page: CapturedPage = {
        url: DEFAULT_TARGET_URL,
        label: '/',
        screenshot: null,
        notes: AUDIT_PINS.map((pin) => ({ ...pin, page: 0, note: pin.description })),
      };
      setState('scanning');
      stage(page, 0, ticket);
      page.notes.forEach((note) => {
        const at = say(note.note ?? note.title, 'action', ticket);
        timers.current.push(
          setTimeout(
            () => {
              if (ticket !== attempt.current) return;
              setRevealed((current) =>
                current.includes(note.id) ? current : [...current, note.id],
              );
            },
            Math.max(0, at - Date.now()),
          ),
        );
      });
      const finish = beat.current + NOTE_BEAT;
      timers.current.push(
        setTimeout(
          () => {
            if (ticket !== attempt.current) return;
            setIdeas(PRODUCT_IDEAS);
            setMetrics(SCORECARD_METRICS);
            setState('complete');
          },
          Math.max(0, finish - Date.now()),
        ),
      );
    },
    [stage],
  );

  const launch = useCallback(() => {
    const raw = url.trim();
    if (raw.length === 0) return;

    /* A person types craigslist.org. Give it the scheme they meant, once. */
    const target = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (target !== url) setUrl(target);

    attempt.current += 1;
    const ticket = attempt.current;

    clearSchedule();
    setLogs([]);
    setPages(NO_PAGES);
    setActivePage(0);
    setRevealed([]);
    setIdeas(NO_IDEAS);
    setMetrics(NO_METRICS);
    setFallbackReason(null);
    setLiveFrame(null);
    setShowLive(true);
    setHeading(null);
    setState('launching');
    startedAt.current = Date.now();
    beat.current = Date.now();
    logSeq.current = 0;

    const fallback = (reason: string) => {
      if (ticket !== attempt.current) return;
      setMode('demo');
      setFallbackReason(reason);
      playDemo(ticket);
    };

    (async () => {
      let response: Response;
      try {
        response = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          /*
           * Sent only when they were entered, and only for this request. Damian
           * types them into the target's own sign in so the walk covers the
           * half of the product that lives behind the door.
           */
          body: JSON.stringify({ url: target, credentials }),
        });
      } catch {
        fallback('Damian could not reach the capture service.');
        return;
      }

      if (!response.ok || !response.body) {
        let reason = 'Damian could not open that page.';
        try {
          const payload = await response.json();
          reason =
            payload?.error === 'NO_CHROME'
              ? 'No browser on this host, so Damian is replaying a recorded session.'
              : String(payload?.error ?? reason);
        } catch {
          /* keep the default */
        }
        fallback(reason);
        return;
      }

      if (ticket !== attempt.current) return;
      setMode('live');
      setState('scanning');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawPage = false;

      /* One newline delimited JSON event per line, handled as it lands. */
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ticket !== attempt.current) {
          reader.cancel().catch(() => undefined);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, never>;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          /*
           * The live view. Rendered straight through rather than queued behind
           * the note beat, because the whole point is that it is live.
           */
          if (event.type === 'frame') {
            setLiveFrame(`data:image/jpeg;base64,${event.frame as unknown as string}`);
            continue;
          }

          /* One note, revealed when the server says it has been put up. */
          if (event.type === 'reveal') {
            const noteId = event.noteId as unknown as string;
            const line = event.says as unknown as string;
            setRevealed((current) =>
              current.includes(noteId) ? current : [...current, noteId],
            );
            say(line, 'action', ticket);
            continue;
          }

          if (event.type === 'auth') {
            /* Said either way. A sign in that failed is part of the record. */
            say(
              String(event.evidence),
              event.ok ? 'action' : 'info',
              ticket,
            );
            continue;
          }

          if (event.type === 'plan') {
            const pages = event.pages as unknown as string[];
            say(
              pages.length
                ? `Found ${pages.length} more pages worth a look: ${pages.join(', ')}.`
                : 'No other pages worth walking from here.',
              'info',
              ticket,
            );
            continue;
          }

          if (event.type === 'move') {
            const label = event.label as unknown as string;
            /* Back to watching the browser while he travels. */
            setShowLive(true);
            const clicked = event.clicked as unknown as boolean;
            setHeading({ to: label, clicked });
            say(
              clicked ? `Clicking through to ${label}.` : `Nothing to press. Going straight to ${label}.`,
              'action',
              ticket,
              { to: label, clicked },
            );
            continue;
          }

          if (event.type === 'page') {
            sawPage = true;
            const capture = event.capture as unknown as {
              url: string;
              label: string;
              screenshot: string;
            };
            stage(
              {
                url: capture.url,
                label: capture.label,
                screenshot: capture.screenshot,
                notes: event.notes as unknown as AuditPin[],
              },
              event.index as unknown as number,
              ticket,
            );
            if (ticket === attempt.current) setState('analyzing');
          }

          if (event.type === 'done') {
            setLiveFrame(null);
            setHeading(null);
            const finish = beat.current + NOTE_BEAT;
            const nextIdeas = event.ideas as unknown as ProductIdea[];
            const nextMetrics = event.metrics as unknown as ScorecardMetric[];
            timers.current.push(
              setTimeout(
                () => {
                  if (ticket !== attempt.current) return;
                  setIdeas(nextIdeas);
                  setMetrics(nextMetrics);
                  setState('complete');
                },
                Math.max(0, finish - Date.now()),
              ),
            );
          }

          if (event.type === 'error' && !sawPage) {
            fallback(String(event.error ?? 'Damian could not open that page.'));
            return;
          }
        }
      }
    })().catch(() => fallback('The walk stopped unexpectedly.'));
  }, [url, clearSchedule, playDemo, stage]);

  const saveCredentials = useCallback((next: TestCredentials) => {
    setCredentials(
      next.username.trim().length === 0 && next.password.length === 0 ? null : next,
    );
  }, []);

  const clearCredentials = useCallback(() => setCredentials(null), []);

  const hasCompleted = state === 'complete';
  const isRunning =
    state === 'launching' || state === 'scanning' || state === 'analyzing';

  const visibleNotes = useMemo(() => {
    const page = pages[activePage];
    if (!page) return [];
    /* Reading it back afterwards, everything on the page is on the page. */
    if (hasCompleted) return page.notes;

    const live = page.notes.filter((note) => revealed.includes(note.id));

    /*
     * One note at a time applies to the page he is working on and nowhere else.
     * Leaving earlier boxes up on the live page meant a stale frame hanging
     * over something he had moved on from, with nothing to say which he meant.
     * A page you have walked back to is finished, so it shows everything he
     * said about it: going back and finding it blank is just lost work.
     */
    if (activePage !== pages.length - 1) return live;
    return live.length ? [live[live.length - 1]] : [];
  }, [pages, activePage, revealed, hasCompleted]);

  /* Progress is pages walked, which is the only honest measure of the walk. */
  const progress = hasCompleted
    ? 100
    : Math.min(95, Math.round((pages.length / 5) * 100));

  return {
    url,
    setUrl,
    credentials,
    saveCredentials,
    clearCredentials,
    state,
    activity: STATE_ACTIVITY[state] ?? 'Standing by',
    progress,
    isRunning,
    hasCompleted,
    mode,
    liveFrame: showLive ? liveFrame : null,
    heading,
    fallbackReason,
    pages,
    activePage,
    setActivePage,
    visibleNotes,
    logs,
    ideas,
    metrics,
    launch,
    reset,
  };
}
