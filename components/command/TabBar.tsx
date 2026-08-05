'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { CommandTab } from '@/lib/types';

interface TabBarProps {
  active: CommandTab;
  onChange: (next: CommandTab) => void;
  counts: Record<CommandTab, number>;
}

const TABS: { value: CommandTab; label: string }[] = [
  { value: 'feed', label: "Damian's Feed" },
  { value: 'canvas', label: 'Opportunity Canvas' },
  { value: 'scorecard', label: 'Scorecard' },
];

/**
 * Command center tabs.
 *
 * Framer Motion owns the shared layout indicator and it is the only shared
 * layout animation in the interface. Full ARIA tabs behaviour: arrow keys,
 * Home and End move selection, and each tab points at its panel.
 */
export function TabBar({ active, onChange, counts }: TabBarProps) {
  const buttons = useRef(new Map<CommandTab, HTMLButtonElement>());
  const reduced = usePrefersReducedMotion();

  const move = (offset: number) => {
    const index = TABS.findIndex((tab) => tab.value === active);
    const nextIndex = (index + offset + TABS.length) % TABS.length;
    const next = TABS[nextIndex].value;
    onChange(next);
    buttons.current.get(next)?.focus();
  };

  const select = (value: CommandTab) => {
    onChange(value);
    buttons.current.get(value)?.focus();
  };

  return (
    <nav aria-label="Command center views" className="border-b border-hairline px-4 sm:px-6">
      <div
        role="tablist"
        aria-label="Damian's output"
        className="no-scrollbar flex items-stretch gap-1 overflow-x-auto"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            select(TABS[0].value);
          } else if (event.key === 'End') {
            event.preventDefault();
            select(TABS[TABS.length - 1].value);
          }
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              ref={(node) => {
                if (node) buttons.current.set(tab.value, node);
                else buttons.current.delete(tab.value);
              }}
              type="button"
              role="tab"
              id={`tab-${tab.value}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.value}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={`relative shrink-0 rounded-full px-3.5 py-4 text-tiny font-semibold transition-colors duration-200 ease-instrument ${
                isActive ? 'text-chalk' : 'text-silver hover:text-chalk'
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                {tab.label}
                <span
                  data-numeric
                  className={`rounded-full border px-1.5 py-0.5 text-micro font-bold ${
                    isActive
                      ? 'border-cobalt/40 bg-cobalt/10 text-cobalt'
                      : 'border-hairline text-silver'
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </span>

              {isActive ? (
                <motion.span
                  layoutId="command-tab-indicator"
                  aria-hidden="true"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cobalt"
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }
                  }
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
