'use client';

import { forwardRef, useId } from 'react';
import { KeyRound, Link2, Play, RotateCcw } from 'lucide-react';
import type { DamianState, TestCredentials } from '@/lib/types';

interface ControlBarProps {
  url: string;
  onUrlChange: (next: string) => void;
  state: DamianState;
  activity: string;
  progress: number;
  isRunning: boolean;
  hasCompleted: boolean;
  credentials: TestCredentials | null;
  onLaunch: () => void;
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
 * The control bar. Everything Damian needs before he opens a session, and
 * everything he reports back once he has.
 *
 * Hover and focus transitions here are plain CSS so they cannot collide with
 * the GSAP entrance timeline, which writes transform and opacity on the
 * wrapper this component sits inside.
 */
export const ControlBar = forwardRef<HTMLElement, ControlBarProps>(
  function ControlBar(
    {
      url,
      onUrlChange,
      state,
      activity,
      progress,
      isRunning,
      hasCompleted,
      credentials,
      onLaunch,
      onOpenAuth,
    },
    ref,
  ) {
    const urlFieldId = useId();

    return (
      <header
        ref={ref}
        className="sticky top-0 z-30 border-b border-hairline bg-void/85 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:gap-8 lg:px-8 lg:py-5">
          {/* Brand mark plus live state */}
          <div className="flex items-center justify-between gap-4 lg:justify-start">
            <div className="flex items-center gap-3">
              <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${DOT_TONE[state]}`}
                  aria-hidden="true"
                />
              </span>

              <span className="flex flex-col">
                <span className="font-display text-[1.375rem] font-extrabold leading-none tracking-cut text-chalk">
                  DAMIAN
                </span>
                <span className="mt-1.5 text-micro font-medium uppercase text-silver">
                  Product Intelligence Agent
                </span>
              </span>
            </div>

            {/*
              Both visible activity readouts are hidden from assistive tech, and
              a single live region below announces the state change once. While
              Damian is running, the launch control already carries the activity,
              so these stand down rather than printing it twice.
            */}
            {isRunning ? null : (
              <p aria-hidden="true" className="text-tiny font-medium text-silver lg:hidden">
                {activity}
              </p>
            )}
          </div>

          {/* Target and launch */}
          <form
            className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center lg:justify-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isRunning) onLaunch();
            }}
          >
            <label className="sr-only" htmlFor={urlFieldId}>
              Target application URL
            </label>

            {/*
              The visible focus indicator is the accent glow on this wrapper,
              which transitions in over 320ms instead of snapping. The input's
              own outline is suppressed so the two do not stack.
            */}
            <div className="group relative flex min-w-0 flex-1 items-center rounded-full border border-hairline bg-obsidian transition-shadow duration-300 ease-instrument focus-within:accent-glow sm:max-w-xl">
              <Link2
                aria-hidden="true"
                className="pointer-events-none absolute left-4 h-4 w-4 text-silver transition-colors duration-300 ease-instrument group-focus-within:text-cobalt"
                strokeWidth={2}
              />
              <input
                id={urlFieldId}
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://app.yourproduct.com"
                className="w-full rounded-full bg-transparent py-3 pl-11 pr-4 text-[0.8125rem] font-medium text-chalk placeholder:text-silver focus-visible:outline-none"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex shrink-0 items-center gap-2 rounded-full border border-hairline px-4 py-3 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
              >
                <KeyRound aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                Auth Settings
                {credentials ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald"
                    aria-label="Test credentials saved"
                    role="img"
                  />
                ) : null}
              </button>

              <button
                type="submit"
                disabled={isRunning}
                aria-busy={isRunning}
                className="relative shrink-0 overflow-hidden rounded-full bg-cobalt px-6 py-3 text-[0.8125rem] font-bold tracking-wide text-chalk transition-transform duration-300 ease-instrument accent-glow hover:scale-[1.02] active:scale-[0.99] disabled:cursor-progress disabled:hover:scale-100"
              >
                {/*
                  Contrast layer. Chalk on pure cobalt measures 4.06 to 1, which
                  is short of AA for a 13px label. A 15 percent void wash over
                  the accent takes the same pairing to 5.18 to 1 and still reads
                  unmistakably as cobalt.
                */}
                <span aria-hidden="true" className="absolute inset-0 bg-void/15" />

                {/*
                  Progress reads on the bottom edge rather than as a wash behind
                  the label, so the measured contrast holds for the whole run.
                  Width only, no transform, no library.
                */}
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-[3px] bg-chalk/80 transition-[width] duration-200 ease-linear"
                  style={{ width: isRunning ? `${progress}%` : '0%' }}
                />
                <span className="relative flex items-center gap-2">
                  {isRunning ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-chalk animate-breathe" />
                      <span>{activity}</span>
                      <span data-numeric className="text-chalk/70">
                        {progress}%
                      </span>
                    </>
                  ) : hasCompleted ? (
                    <>
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.4} />
                      Run Damian again
                    </>
                  ) : (
                    <>
                      <Play aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.6} />
                      Launch Damian
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>

          {isRunning ? null : (
            <p
              aria-hidden="true"
              className="hidden shrink-0 text-tiny font-medium text-silver lg:block"
            >
              {activity}
            </p>
          )}

          <p role="status" aria-live="polite" className="sr-only">
            {`Damian status: ${activity}.`}
          </p>
        </div>
      </header>
    );
  },
);
