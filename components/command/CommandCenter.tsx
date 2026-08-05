'use client';

import { forwardRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TabBar } from './TabBar';
import { DamianFeed } from './DamianFeed';
import { OpportunityCanvas } from './OpportunityCanvas';
import { Scorecard } from './Scorecard';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type {
  CommandTab,
  DamianLog,
  ProductIdea,
  ScorecardMetric,
} from '@/lib/types';

interface CommandCenterProps {
  logs: DamianLog[];
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];
  targetUrl: string;
  isRunning: boolean;
}

/**
 * The command center.
 *
 * Framer Motion owns the panel exchange and the tab indicator. The GSAP
 * entrance timeline writes on this aside element from page.tsx, and Framer
 * never touches it, so the two systems stay on separate nodes.
 *
 * Below the large breakpoint this becomes a sheet: rounded top, its own
 * hairline, its own scroll. It is not the desktop column squeezed narrower.
 */
export const CommandCenter = forwardRef<HTMLElement, CommandCenterProps>(
  function CommandCenter({ logs, ideas, metrics, targetUrl, isRunning }, ref) {
    const [active, setActive] = useState<CommandTab>('feed');
    const reduced = usePrefersReducedMotion();

    const counts: Record<CommandTab, number> = {
      feed: logs.length,
      canvas: ideas.length,
      scorecard: metrics.length,
    };

    return (
      <aside
        ref={ref}
        aria-label="Damian's command center"
        className="relative flex min-h-0 flex-col bg-void opacity-0 max-lg:rounded-t-3xl max-lg:border-t max-lg:border-hairline max-lg:shadow-panel lg:w-[40%]"
      >
        <h2 className="sr-only">Damian&apos;s command center</h2>

        {/* Sheet grab affordance. Mobile only, and purely visual. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-hairline lg:hidden"
        />

        <TabBar active={active} onChange={setActive} counts={counts} />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              role="tabpanel"
              id={`panel-${active}`}
              aria-labelledby={`tab-${active}`}
              tabIndex={0}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
              className="flex min-h-0 flex-1 flex-col focus-visible:outline-none"
            >
              {active === 'feed' ? (
                <DamianFeed logs={logs} isRunning={isRunning} />
              ) : active === 'canvas' ? (
                <OpportunityCanvas ideas={ideas} targetUrl={targetUrl} />
              ) : (
                <Scorecard metrics={metrics} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    );
  },
);
