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
  }, [clearSchedule]);

  /** Queue a line for Damian to say, in order, on the shared beat. */
  const say = useCallback(
    (message: string, type: DamianLog['type'], ticket: number) => {
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

  /** Show a page, then place its notes one at a time. */
  const stage = useCallback(
    (page: CapturedPage, index: number, says: string[], ticket: number) => {
      const arrival = Math.max(beat.current, Date.now());

      timers.current.push(
        setTimeout(
          () => {
            if (ticket !== attempt.current) return;
            setPages((current) => {
              if (current.some((existing) => existing.url === page.url)) return current;
              return [...current, page];
            });
            /* The canvas follows the walk while it is still running. */
            setActivePage(index);
          },
          Math.max(0, arrival - Date.now()),
        ),
      );
      beat.current = arrival + NOTE_BEAT;

      say(`Opened ${page.label}. Reading it.`, 'info', ticket);

      page.notes.forEach((note, order) => {
        const line = says[order] ?? note.title;
        const at = say(line, note.type === 'opportunity' ? 'insight' : 'action', ticket);
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
      stage(page, 0, page.notes.map((note) => note.note ?? note.title), ticket);
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
          body: JSON.stringify({ url: target }),
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
            say(
              (event.clicked as unknown as boolean)
                ? `Clicking through to ${label}.`
                : `Nothing clickable for ${label}. Going straight there.`,
              'action',
              ticket,
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
              event.says as unknown as string[],
              ticket,
            );
            if (ticket === attempt.current) setState('analyzing');
          }

          if (event.type === 'done') {
            setLiveFrame(null);
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
    /* Once the walk is done, every note on the page you are reading is shown. */
    return hasCompleted
      ? page.notes
      : page.notes.filter((note) => revealed.includes(note.id));
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
    liveFrame,
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
