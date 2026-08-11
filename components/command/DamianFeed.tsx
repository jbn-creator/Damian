'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, CornerDownRight, MousePointerClick, Terminal } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { DamianLog } from '@/lib/types';

interface DamianFeedProps {
  logs: DamianLog[];
  isRunning: boolean;
}

const MESSAGE_TONE: Record<DamianLog['type'], string> = {
  info: 'text-silver',
  insight: 'text-chalk',
  action: 'text-chalk font-semibold',
};

const TYPE_NAME: Record<DamianLog['type'], string> = {
  info: 'Observation',
  insight: 'Insight',
  action: 'Action',
};

/** Marker shape carries the message type. No status token is spent on it. */
function TypeMarker({ type }: { type: DamianLog['type'] }) {
  if (type === 'action') {
    return <span aria-hidden="true" className="mt-[0.4rem] h-2 w-2 shrink-0 rounded-full bg-cobalt" />;
  }
  if (type === 'insight') {
    return (
      <span
        aria-hidden="true"
        className="mt-[0.4rem] h-2 w-2 shrink-0 rounded-full border-[1.5px] border-cobalt"
      />
    );
  }
  return (
    <span aria-hidden="true" className="mt-[0.4rem] h-2 w-2 shrink-0 rounded-full bg-hairline" />
  );
}

/**
 * Split a message for the character reveal.
 *
 * Characters are wrapped per word, and the spaces between words are left as
 * bare text nodes. Wrapping a space inside its own inline element removes the
 * soft wrap opportunity, which makes a long line overflow instead of breaking.
 * This keeps the reveal per character and the line break behaviour intact.
 */
function splitForReveal(log: DamianLog) {
  return log.message.split(' ').map((word, wordIndex) => (
    <Fragment key={`${log.id}-word-${wordIndex}`}>
      {wordIndex > 0 ? ' ' : null}
      <span>
        {Array.from(word).map((character, characterIndex) => (
          <span key={`${log.id}-char-${wordIndex}-${characterIndex}`} data-char>
            {character}
          </span>
        ))}
      </span>
    </Fragment>
  ));
}

/**
 * Tab 1. Damian thinking out loud.
 *
 * GSAP owns this surface end to end: the line stagger and the character reveal.
 * Lines render with the opacity-0 class so nothing flashes before the timeline
 * takes over. The character spans are aria-hidden and each line also carries
 * its full message as a screen reader string, so splitting text for the reveal
 * costs nothing in accessibility.
 */
export function DamianFeed({ logs, isRunning }: DamianFeedProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const lines = useRef(new Map<string, HTMLLIElement>());
  const revealed = useRef(new Set<string>());
  const timelines = useRef<gsap.core.Timeline[]>([]);
  const [pinnedToLatest, setPinnedToLatest] = useState(true);
  /* Read inside the reveal effect, so a scroll does not restart it. */
  const pinnedRef = useRef(true);
  const reduced = usePrefersReducedMotion();

  /*
   * Timelines are killed on unmount only. Killing them from the effect cleanup
   * would abort the previous line's character reveal the moment the next log
   * arrives, leaving earlier messages permanently half faded.
   */
  useEffect(
    () => () => {
      timelines.current.forEach((timeline) => timeline.kill());
      timelines.current = [];
    },
    [],
  );

  const jumpToLatest = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    });
    pinnedRef.current = true;
    setPinnedToLatest(true);
  }, [reduced]);

  useEffect(() => {
    if (logs.length === 0) {
      revealed.current.clear();
      timelines.current.forEach((timeline) => timeline.kill());
      timelines.current = [];
      return;
    }

    const fresh = logs.filter((log) => !revealed.current.has(log.id));
    if (fresh.length === 0) return;
    fresh.forEach((log) => revealed.current.add(log.id));

    const timeline = gsap.timeline();
    timelines.current = timelines.current.filter((existing) => existing.isActive());
    timelines.current.push(timeline);

    fresh.forEach((log) => {
      const line = lines.current.get(log.id);
      if (!line) return;
      const characters = line.querySelectorAll('[data-char]');

      if (reduced) {
        gsap.set(line, { opacity: 1, y: 0 });
        gsap.set(characters, { opacity: 1 });
        return;
      }

      timeline
        .fromTo(
          line,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.36, ease: 'power3.out' },
          '>-0.12',
        )
        .fromTo(
          characters,
          { opacity: 0 },
          { opacity: 1, duration: 0.01, stagger: 0.0115, ease: 'none' },
          '<0.05',
        );
    });

    if (pinnedRef.current) {
      const node = scroller.current;
      if (node) {
        node.scrollTo({
          top: node.scrollHeight,
          behavior: reduced ? 'auto' : 'smooth',
        });
      }
    }
  }, [logs, reduced]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stream header */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 sm:px-6">
        <p className="flex items-center gap-2 text-micro font-semibold uppercase text-silver">
          <Terminal aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
          Live telemetry
        </p>
        <p data-numeric className="text-micro font-semibold uppercase text-silver">
          {`${logs.length} entries`}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
            const pinned = distance < 56;
            pinnedRef.current = pinned;
            setPinnedToLatest(pinned);
          }}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {logs.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col justify-center">
              <p className="font-display text-lg font-bold leading-tight tracking-cut text-chalk">
                Damian is standing by.
              </p>
              <p className="mt-2 max-w-xs text-tiny leading-5 text-silver">
                Launch a session and everything he sees lands here, in order, as
                he sees it.
              </p>
            </div>
          ) : (
            <ol aria-live="polite" aria-relevant="additions" className="flex flex-col gap-3.5">
              {logs.map((log) =>
                log.nav ? (
                  /*
                   * Changing page is a break in the walk, not one more remark
                   * about the page he is on, so it is set as a rule across the
                   * feed with the destination on it.
                   */
                  <li
                    key={log.id}
                    ref={(node) => {
                      if (node) lines.current.set(log.id, node);
                      else lines.current.delete(log.id);
                    }}
                    className="my-1 flex items-center gap-3 opacity-0"
                  >
                    <time
                      data-numeric
                      dateTime={`PT${log.timestamp.replace('s', 'S')}`}
                      className="w-9 shrink-0 text-right text-tiny font-medium text-silver"
                    >
                      {log.timestamp}
                    </time>

                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-cobalt/35 bg-cobalt/10 px-3 py-1.5">
                      {log.nav.clicked ? (
                        <MousePointerClick
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 text-cobalt"
                          strokeWidth={2.2}
                        />
                      ) : (
                        <CornerDownRight
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 text-silver"
                          strokeWidth={2.2}
                        />
                      )}
                      <span className="truncate font-mono text-tiny font-semibold text-chalk">
                        {log.nav.to}
                      </span>
                      <span className="ml-auto shrink-0 text-micro font-bold uppercase text-silver">
                        {log.nav.clicked ? 'Clicked' : 'Went direct'}
                      </span>
                    </span>
                  </li>
                ) : (
                <li
                  key={log.id}
                  ref={(node) => {
                    if (node) lines.current.set(log.id, node);
                    else lines.current.delete(log.id);
                  }}
                  className="flex items-start gap-3 opacity-0"
                >
                  <time
                    data-numeric
                    dateTime={`PT${log.timestamp.replace('s', 'S')}`}
                    className="w-9 shrink-0 pt-0.5 text-right text-tiny font-medium text-silver"
                  >
                    {log.timestamp}
                  </time>

                  <TypeMarker type={log.type} />

                  <p
                    className={`min-w-0 flex-1 text-pretty text-[0.8125rem] leading-6 ${MESSAGE_TONE[log.type]}`}
                  >
                    <span className="sr-only">{`${TYPE_NAME[log.type]}. ${log.message}`}</span>
                    <span aria-hidden="true">{splitForReveal(log)}</span>
                  </p>
                </li>
                ),
              )}

              {isRunning ? (
                <li className="flex items-start gap-3" aria-hidden="true">
                  <span className="w-9 shrink-0" />
                  <span className="mt-[0.4rem] h-2 w-2 shrink-0 rounded-full bg-cobalt animate-breathe" />
                  <span className="animate-caret text-[0.8125rem] leading-6 text-cobalt">
                    &#9601;
                  </span>
                </li>
              ) : null}
            </ol>
          )}
        </div>

        {/* Damian keeps streaming. This appears only if you have scrolled away. */}
        <AnimatePresence>
          {!pinnedToLatest && logs.length > 0 ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={reduced ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
            >
              <button
                type="button"
                onClick={jumpToLatest}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-hairline bg-obsidian/95 px-4 py-2 text-micro font-semibold uppercase text-chalk shadow-panel backdrop-blur-xl transition-colors duration-200 ease-instrument hover:border-cobalt/50"
              >
                <ArrowDown aria-hidden="true" className="h-3 w-3" strokeWidth={2.4} />
                Jump to latest
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
