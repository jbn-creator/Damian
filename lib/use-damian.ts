'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIT_PINS,
  DAMIAN_SCRIPT,
  DEFAULT_TARGET_URL,
  PIN_SCHEDULE,
  PRODUCT_IDEAS,
  RUN_DURATION,
  SCORECARD_METRICS,
  STATE_ACTIVITY,
  STATE_SCHEDULE,
} from './mock-data';
import type {
  AuditPin,
  DamianLog,
  DamianState,
  ProductIdea,
  ScorecardMetric,
  TestCredentials,
} from './types';

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

  /** Only what Damian has actually said or placed so far. */
  logs: DamianLog[];
  pins: AuditPin[];

  /** The board. Empty until Damian finishes reasoning. */
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];

  launch: () => void;
  reset: () => void;
}

const PIN_BY_ID = new Map(AUDIT_PINS.map((pin) => [pin.id, pin]));

/*
 * Stable empty arrays. A fresh literal on every render would change identity
 * and restart the effects downstream that key off these lists.
 */
const NO_IDEAS: ProductIdea[] = [];
const NO_METRICS: ScorecardMetric[] = [];

/**
 * The state machine behind the simulated run.
 *
 * There is no browser here and no network. What there is: a scripted timeline
 * played back on real timers, so the interface has to handle streaming arrival,
 * out of order reads and mid run interaction exactly as it would against a
 * live Chromium session.
 */
export function useDamian(): DamianRun {
  const [url, setUrl] = useState(DEFAULT_TARGET_URL);
  const [credentials, setCredentials] = useState<TestCredentials | null>(null);
  const [state, setState] = useState<DamianState>('idle');
  const [logs, setLogs] = useState<DamianLog[]>([]);
  const [pinIds, setPinIds] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

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
    clearSchedule();
    setState('idle');
    setLogs([]);
    setPinIds([]);
    setProgress(0);
  }, [clearSchedule]);

  const launch = useCallback(() => {
    clearSchedule();
    setLogs([]);
    setPinIds([]);
    setProgress(0);
    setState('launching');

    const schedule = (at: number, run: () => void) => {
      timers.current.push(setTimeout(run, at));
    };

    STATE_SCHEDULE.forEach(({ state: next, at }) => {
      schedule(at, () => setState(next));
    });

    DAMIAN_SCRIPT.forEach((entry) => {
      schedule(entry.at, () => {
        const { at: _at, ...log } = entry;
        void _at;
        setLogs((current) =>
          current.some((existing) => existing.id === log.id)
            ? current
            : [...current, log],
        );
      });
    });

    PIN_SCHEDULE.forEach(({ pinId, at }) => {
      schedule(at, () => {
        setPinIds((current) =>
          current.includes(pinId) ? current : [...current, pinId],
        );
      });
    });

    /* Progress is read from wall clock so it cannot drift from the script. */
    const startedAt = Date.now();
    ticker.current = setInterval(() => {
      const ratio = (Date.now() - startedAt) / RUN_DURATION;
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
  }, [clearSchedule]);

  const saveCredentials = useCallback((next: TestCredentials) => {
    setCredentials(
      next.username.trim().length === 0 && next.password.length === 0
        ? null
        : next,
    );
  }, []);

  const clearCredentials = useCallback(() => setCredentials(null), []);

  const pins = useMemo(
    () =>
      pinIds
        .map((id) => PIN_BY_ID.get(id))
        .filter((pin): pin is AuditPin => Boolean(pin)),
    [pinIds],
  );

  const hasCompleted = state === 'complete';
  const isRunning =
    state === 'launching' || state === 'scanning' || state === 'analyzing';

  const ideas: ProductIdea[] = hasCompleted ? PRODUCT_IDEAS : NO_IDEAS;
  const metrics: ScorecardMetric[] = hasCompleted ? SCORECARD_METRICS : NO_METRICS;

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
    logs,
    pins,
    ideas,
    metrics,
    launch,
    reset,
  };
}
