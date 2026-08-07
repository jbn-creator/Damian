'use client';

import { KeyRound, Lock, RotateCcw, SquarePen } from 'lucide-react';
import type { DamianState, TestCredentials } from '@/lib/types';

interface SessionBarProps {
  url: string;
  state: DamianState;
  activity: string;
  progress: number;
  isRunning: boolean;
  credentials: TestCredentials | null;
  onRerun: () => void;
  onNewTarget: () => void;
  onOpenAuth: () => void;
}

const DOT_TONE: Record<DamianState, string> = {
  idle: 'bg-silver',
  launching: 'bg-cobalt animate-breathe',
  scanning: 'bg-cobalt animate-breathe',
  analyzing: 'bg-cobalt animate-breathe',
  complete: 'bg-emerald',
};

/**
 * The strip above a live session.
 *
 * It reports and it re-runs. It does not take a URL, because taking a URL is
 * the composer's job and the composer is not in a bar at the top of the screen.
 */
export function SessionBar({
  url,
  state,
  activity,
  progress,
  isRunning,
  credentials,
  onRerun,
  onNewTarget,
  onOpenAuth,
}: SessionBarProps) {
  return (
    <div className="relative border-y border-hairline bg-obsidian/60">
      <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-5 py-2.5 sm:px-8">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[state]}`}
        />

        <p className="flex min-w-0 items-center gap-2 rounded-full border border-hairline bg-void px-3 py-1.5">
          <Lock
            aria-label="Connection secured over TLS"
            role="img"
            className="h-3 w-3 shrink-0 text-emerald"
            strokeWidth={2.4}
          />
          <span className="truncate text-tiny font-medium text-silver">{url}</span>
        </p>

        <p aria-hidden="true" className="hidden text-tiny font-medium text-silver sm:block">
          {activity}
          {isRunning ? (
            <span data-numeric className="ml-2 text-chalk">{`${progress}%`}</span>
          ) : null}
        </p>

        <p role="status" aria-live="polite" className="sr-only">
          {`Damian status: ${activity}.`}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenAuth}
            className="relative grid h-8 w-8 place-items-center rounded-full border border-hairline text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
          >
            <span className="sr-only">
              {credentials ? 'Test credentials, saved' : 'Test credentials'}
            </span>
            <KeyRound aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            {credentials ? (
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-emerald"
              />
            ) : null}
          </button>

          <button
            type="button"
            onClick={onNewTarget}
            className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
          >
            <SquarePen aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
            New target
          </button>

          <button
            type="button"
            onClick={onRerun}
            disabled={isRunning}
            aria-busy={isRunning}
            className="relative flex items-center gap-2 overflow-hidden rounded-full bg-chalk px-4 py-1.5 text-tiny font-bold text-void transition-transform duration-300 ease-instrument hover:scale-[1.03] active:scale-[0.99] disabled:cursor-progress disabled:bg-hairline disabled:text-silver disabled:hover:scale-100"
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" strokeWidth={2.4} />
            {isRunning ? 'Working' : 'Run again'}
          </button>
        </div>
      </div>
    </div>
  );
}
