'use client';

import { forwardRef } from 'react';
import { PIN_TYPE_LABEL } from '@/lib/mock-data';
import type { AuditPin } from '@/lib/types';

interface PinMarkerProps {
  pin: AuditPin;
  index: number;
  isOpen: boolean;
  popoverId: string;
  onToggle: () => void;
}

const FILL: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const RING: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson/45',
  warning: 'bg-amber/45',
  opportunity: 'bg-emerald/45',
};

/**
 * A single pin.
 *
 * Motion ownership is split by DOM level so the two libraries never touch the
 * same property on the same node:
 *   anchor element  GSAP writes transform and opacity for the drop
 *   scale element   inline style writes the counter scale against canvas zoom
 *   this button     Tailwind writes the hover and active transform
 */
export const PinMarker = forwardRef<HTMLButtonElement, PinMarkerProps>(
  function PinMarker({ pin, index, isOpen, popoverId, onToggle }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        onClick={onToggle}
        className={`group relative grid h-7 w-7 place-items-center rounded-full ${FILL[pin.type]} shadow-lift transition-transform duration-300 ease-instrument hover:scale-[1.18] active:scale-[1.06] ${
          isOpen ? 'ring-2 ring-chalk ring-offset-2 ring-offset-void' : ''
        }`}
      >
        {/* Decorative pulse. CSS only, and the reduced motion layer stops it. */}
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full ${RING[pin.type]} animate-pulse-ring`}
        />
        <span
          aria-hidden="true"
          data-numeric
          className="relative font-display text-[0.6875rem] font-extrabold leading-none text-void"
        >
          {index + 1}
        </span>
        <span className="sr-only">
          {`Pin ${index + 1}. ${PIN_TYPE_LABEL[pin.type]}. ${pin.title} Impact score ${pin.impactScore} of 100. Activate to read Damian's reasoning.`}
        </span>
      </button>
    );
  },
);
