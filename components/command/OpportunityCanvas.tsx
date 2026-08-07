'use client';

import { Layers, Lock } from 'lucide-react';
import { IdeaCard } from './IdeaCard';
import { IDEA_GROUPS } from '@/lib/mock-data';
import type { ProductIdea } from '@/lib/types';

interface OpportunityCanvasProps {
  ideas: ProductIdea[];
  targetUrl: string;
}

/**
 * Tab 2. The board.
 *
 * Structured cards under three headings, never a wall of markdown. No animation
 * library touches this surface directly: the cards own their own hover motion,
 * and the panel crossfade is owned by CommandCenter.
 */
export function OpportunityCanvas({ ideas, targetUrl }: OpportunityCanvasProps) {
  if (ideas.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start justify-center px-5 py-10 sm:px-6">
        <span className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian">
          <Lock aria-hidden="true" className="h-4 w-4 text-silver" strokeWidth={2} />
        </span>
        <p className="mt-4 font-display text-lg font-bold leading-tight tracking-cut text-chalk">
          The board is empty.
        </p>
        <p className="mt-2 max-w-sm text-tiny leading-5 text-silver">
          Damian writes opportunities after he has read the page, not before.
          Launch a session and this fills with quick wins, gaps against the
          category, and the moments where the product should be asking for money.
        </p>
      </div>
    );
  }

  const quickWins = ideas.filter((idea) => idea.category === 'quick_win').length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
      {/* Board summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-obsidian px-4 py-3">
        <Layers aria-hidden="true" className="h-4 w-4 shrink-0 text-cobalt" strokeWidth={2} />
        <p className="text-tiny leading-5 text-silver">
          <span data-numeric className="font-semibold text-chalk">
            {`${ideas.length} opportunities`}
          </span>
          {`. ${quickWins} of them ship in under two hours.`}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {IDEA_GROUPS.map((group) => {
          const grouped = ideas.filter((idea) => idea.category === group.category);
          if (grouped.length === 0) return null;

          return (
            <section key={group.category} aria-labelledby={`group-${group.category}`}>
              <div className="flex items-baseline gap-3">
                <h3
                  id={`group-${group.category}`}
                  className="font-display text-xl font-bold leading-none tracking-cut text-chalk"
                >
                  {group.heading}
                </h3>
                <span
                  data-numeric
                  className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-micro font-bold text-silver"
                >
                  {grouped.length}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
              </div>

              <p className="mt-2 text-pretty text-tiny leading-5 text-silver">{group.note}</p>

              <div className="mt-4 flex flex-col gap-3">
                {grouped.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} targetUrl={targetUrl} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
