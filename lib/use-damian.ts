'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIT_PINS,
  DAMIAN_SCRIPT,
  PIN_SCHEDULE,
  PRODUCT_IDEAS,
  RUN_DURATION,
  SCORECARD_METRICS,
  STATE_ACTIVITY,
} from './mock-data';
import type { DerivedFindings } from './findings';
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

export interface DamianRun {
  /** Target under inspection. */
  url: string;
  setUrl: (next: string) => void;

  /** Test credentials for gated applications. Held in memory only. */
  credentials: TestCredentials | null;
  saveCredentials: (next: TestCredentials) => void;
  clearCredentials: () => void;

  state: DamianState;
  activity: string;
  /** 0 to 100. Drives the progress readout on the launch control. */
  progress: number;
  isRunning: boolean;
  hasCompleted: boolean;

  /** A real screenshot of the target, when Damian managed to take one. */
  screenshot: string | null;
  mode: RunMode;
  /** Why the run fell back to the scripted demo, if it did. */
  fallbackReason: string | null;

  /** Only what Damian has actually said or placed so far. */
  logs: DamianLog[];
  pins: AuditPin[];

  /** The board. Empty until Damian finishes reasoning. */
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];

  launch: () => void;
  reset: () => void;
}

/*
 * Stable empty arrays. A fresh literal on every render would change identity
 * and restart the effects downstream that key off these lists.
 */
const NO_IDEAS: ProductIdea[] = [];
const NO_METRICS: ScorecardMetric[] = [];

/** The scripted demo, shaped like a derived run so one player handles both. */
const DEMO_RUN: DerivedFindings = {
  pins: AUDIT_PINS,
  logs: DAMIAN_SCRIPT,
  pinSchedule: PIN_SCHEDULE,
  ideas: PRODUCT_IDEAS,
  metrics: SCORECARD_METRICS,
  duration: RUN_DURATION,
};

/**
 * The state machine behind a run.
 *
 * Damian opens the real page through the capture route, measures it, and plays
 * the findings back on real timers so the interface handles streaming arrival
 * the way it would against any live session. When no browser is available on
 * the host, it falls back to the scripted demo and says so rather than
 * pretending a capture happened.
 */
export function useDamian(): DamianRun {
  /*
   * The composer opens empty, so the placeholder and the example targets are
   * doing real work and the send button starts correctly disabled.
   */
  const [url, setUrl] = useState('');
  const [credentials, setCredentials] = useState<TestCredentials | null>(null);
  const [state, setState] = useState<DamianState>('idle');
  const [logs, setLogs] = useState<DamianLog[]>([]);
  const [pinIds, setPinIds] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>('demo');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [run, setRun] = useState<DerivedFindings>(DEMO_RUN);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const attempt = useRef(0);

  const clearSchedule = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (ticker.current !== null) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  }, []);

  useEffect(() => clearSchedule, [clearSchedule]);

  const reset = useCallback(() => {
    attempt.current += 1;
    clearSchedule();
    setState('idle');
    setLogs([]);
    setPinIds([]);
    setProgress(0);
    setScreenshot(null);
    setFallbackReason(null);
  }, [clearSchedule]);

  /** Play a set of findings back on the clock. */
  const play = useCallback(
    (data: DerivedFindings) => {
      clearSchedule();
      setRun(data);
      setLogs([]);
      setPinIds([]);
      setProgress(0);
      setState('scanning');

      const schedule = (at: number, fire: () => void) => {
        timers.current.push(setTimeout(fire, at));
      };

      data.logs.forEach((entry) => {
        schedule(entry.at, () => {
          const { at: _at, ...log } = entry;
          void _at;
          setLogs((current) =>
            current.some((existing) => existing.id === log.id) ? current : [...current, log],
          );
        });
      });

      data.pinSchedule.forEach(({ pinId, at }) => {
        schedule(at, () => {
          setPinIds((current) => (current.includes(pinId) ? current : [...current, pinId]));
        });
      });

      schedule(Math.round(data.duration * 0.35), () => setState('analyzing'));
      schedule(data.duration, () => setState('complete'));

      /* Progress is read from wall clock so it cannot drift from the script. */
      const startedAt = Date.now();
      ticker.current = setInterval(() => {
        const ratio = (Date.now() - startedAt) / data.duration;
        if (ratio >= 1) {
          setProgress(100);
          if (ticker.current !== null) {
            clearInterval(ticker.current);
            ticker.current = null;
          }
          return;
        }
        setProgress(Math.round(ratio * 100));
      }, 200);
    },
    [clearSchedule],
  );

  const launch = useCallback(() => {
    const target = url.trim();
    if (target.length === 0) return;

    attempt.current += 1;
    const ticket = attempt.current;

    clearSchedule();
    setLogs([]);
    setPinIds([]);
    setProgress(0);
    setScreenshot(null);
    setFallbackReason(null);
    setState('launching');

    const fallback = (reason: string) => {
      if (ticket !== attempt.current) return;
      setMode('demo');
      setFallbackReason(reason);
      play(DEMO_RUN);
    };

    fetch('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: target }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (ticket !== attempt.current) return;

        if (!response.ok) {
          fallback(
            payload?.error === 'NO_CHROME'
              ? 'No browser on this host, so Damian is replaying a recorded session.'
              : String(payload?.error ?? 'Damian could not open that page.'),
          );
          return;
        }

        setMode('live');
        setScreenshot(payload.screenshot as string);
        play(payload.findings as DerivedFindings);
      })
      .catch(() => fallback('Damian could not reach the capture service.'));
  }, [url, clearSchedule, play]);

  const saveCredentials = useCallback((next: TestCredentials) => {
    setCredentials(
      next.username.trim().length === 0 && next.password.length === 0 ? null : next,
    );
  }, []);

  const clearCredentials = useCallback(() => setCredentials(null), []);

  const pins = useMemo(() => {
    const byId = new Map(run.pins.map((pin) => [pin.id, pin]));
    return pinIds
      .map((id) => byId.get(id))
      .filter((pin): pin is AuditPin => Boolean(pin));
  }, [pinIds, run]);

  const hasCompleted = state === 'complete';
  const isRunning =
    state === 'launching' || state === 'scanning' || state === 'analyzing';

  return {
    url,
    setUrl,
    credentials,
    saveCredentials,
    clearCredentials,
    state,
    activity: STATE_ACTIVITY[state] ?? 'Standing by',
    progress: hasCompleted ? 100 : progress,
    isRunning,
    hasCompleted,
    screenshot,
    mode,
    fallbackReason,
    logs,
    pins,
    ideas: hasCompleted ? run.ideas : NO_IDEAS,
    metrics: hasCompleted ? run.metrics : NO_METRICS,
    launch,
    reset,
  };
}
