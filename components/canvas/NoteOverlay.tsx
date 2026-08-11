'use client';

import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { AuditPin } from '@/lib/types';

interface NoteOverlayProps {
  notes: AuditPin[];
  zoom: number;
  visible: boolean;
  openNoteId: string | null;
  onToggleNote: (noteId: string) => void;
  registerNote: (noteId: string, node: HTMLButtonElement | null) => void;
}

/*
 * Outline only, never a fill. A tint over a full width heading washes out the
 * page Damian is annotating, which defeats the point of showing the real one.
 */
const FRAME: Record<AuditPin['type'], string> = {
  friction: 'border-crimson',
  warning: 'border-amber',
  opportunity: 'border-emerald',
};

const CARD: Record<AuditPin['type'], string> = {
  friction: 'border-crimson/45',
  warning: 'border-amber/45',
  opportunity: 'border-emerald/45',
};

const FILL: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const LABEL: Record<AuditPin['type'], string> = {
  friction: 'Friction',
  warning: 'Worth a look',
  opportunity: 'Working',
};

/*
 * Card footprint, as a share of the frame. The overlay works in percentages so
 * it holds at any container size, and these two numbers are what the layout
 * pass reasons about. They match the rendered card closely enough to keep
 * cards off each other and off the elements they describe.
 */
const CARD_W = 23;
const CARD_H = 15;
const GAP = 1.5;

interface Placement {
  left: number;
  top: number;
}

const overlaps = (a: Placement, b: Placement) =>
  Math.abs(a.left - b.left) < CARD_W && Math.abs(a.top - b.top) < CARD_H;

const inBounds = (spot: Placement) =>
  spot.left >= 1 && spot.left + CARD_W <= 99 && spot.top >= 1 && spot.top + CARD_H <= 99;

/**
 * Where each card goes.
 *
 * Tried in order beside, then above, then below the element it describes, and
 * the first spot that is inside the frame and clear of every card already
 * placed wins. Without this two findings on the same element stack on top of
 * each other and neither can be read, and a card lands over its own subject.
 */
function layout(notes: AuditPin[]): Placement[] {
  const placed: Placement[] = [];

  notes.forEach((note) => {
    const halfW = (note.w ?? 2) / 2;
    const halfH = (note.h ?? 2) / 2;
    const candidates: Placement[] = [
      { left: note.x + halfW + GAP, top: note.y - CARD_H / 2 },
      { left: note.x - halfW - GAP - CARD_W, top: note.y - CARD_H / 2 },
      { left: note.x - CARD_W / 2, top: note.y - halfH - GAP - CARD_H },
      { left: note.x - CARD_W / 2, top: note.y + halfH + GAP },
      { left: note.x + halfW + GAP, top: note.y + halfH + GAP },
      { left: note.x - halfW - GAP - CARD_W, top: note.y + halfH + GAP },
    ];

    const clear = candidates.find(
      (spot) => inBounds(spot) && !placed.some((taken) => overlaps(spot, taken)),
    );

    if (clear) {
      placed.push(clear);
      return;
    }

    /* Nothing clear. Stack down the left edge rather than cover something. */
    let fallback: Placement = { left: 2, top: 2 };
    while (placed.some((taken) => overlaps(fallback, taken)) && fallback.top + CARD_H < 99) {
      fallback = { left: fallback.left, top: fallback.top + CARD_H + 0.5 };
    }
    placed.push(fallback);
  });

  return placed;
}

/**
 * Damian's notes, on the page they are about.
 *
 * Each one frames the element it concerns and says what it thinks in about
 * three lines, with a matching number tying the card to its frame.
 *
 * GSAP owns the arrival, as it owns every orchestrated timeline in the app.
 * Notes render from the opacity-0 class so nothing flashes before it takes
 * over, and its inline styles then outrank the class.
 */
export function NoteOverlay({
  notes,
  zoom,
  visible,
  openNoteId,
  onToggleNote,
  registerNote,
}: NoteOverlayProps) {
  const anchors = useRef(new Map<string, HTMLLIElement>());
  const landed = useRef(new Set<string>());
  const tweens = useRef<gsap.core.Tween[]>([]);
  const reduced = usePrefersReducedMotion();

  const spots = useMemo(() => layout(notes), [notes]);

  /* Killed on unmount only. Killing on every arrival would freeze the last one. */
  useEffect(
    () => () => {
      tweens.current.forEach((tween) => tween.kill());
      tweens.current = [];
    },
    [],
  );

  useEffect(() => {
    if (notes.length === 0) {
      landed.current.clear();
      return;
    }

    const fresh = notes.filter((note) => !landed.current.has(note.id));
    if (fresh.length === 0) return;

    const targets = fresh
      .map((note) => anchors.current.get(note.id))
      .filter((node): node is HTMLLIElement => Boolean(node));

    fresh.forEach((note) => landed.current.add(note.id));
    if (targets.length === 0) return;

    if (reduced) {
      gsap.set(targets, { opacity: 1, scale: 1, y: 0 });
      return;
    }

    tweens.current = tweens.current.filter((tween) => tween.isActive());
    tweens.current.push(
      gsap.fromTo(
        targets,
        { opacity: 0, scale: 0.94, y: -10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.1 },
      ),
    );
  }, [notes, reduced]);

  return (
    <ul
      aria-label="Damian's notes on this page"
      inert={!visible}
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ease-instrument ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {notes.map((note, index) => {
        const width = Math.max(note.w ?? 0, 1.5);
        const height = Math.max(note.h ?? 0, 1.5);
        const spot = spots[index] ?? { left: 2, top: 2 };
        const isOpen = openNoteId === note.id;

        return (
          <li
            key={note.id}
            ref={(node) => {
              if (node) anchors.current.set(note.id, node);
              else anchors.current.delete(note.id);
            }}
            className="absolute inset-0 opacity-0"
          >
            {/* The frame around what the note is about. */}
            <span
              aria-hidden="true"
              className={`absolute rounded-xl border-2 ${FRAME[note.type]}`}
              style={{
                left: `${note.x - width / 2}%`,
                top: `${note.y - height / 2}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
            >
              <span
                className={`absolute left-0 top-0 grid h-4 w-4 place-items-center rounded-full ${FILL[note.type]} font-body text-[0.5rem] font-bold text-void`}
                style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
              >
                {index + 1}
              </span>
            </span>

            {/*
              The card. Counter scaled against canvas zoom by the inline style,
              which is this element's only transform writer, so the note stays
              readable while the page under it grows.
            */}
            <span
              className="absolute block"
              style={{
                left: `${spot.left}%`,
                top: `${spot.top}%`,
                width: `${CARD_W}%`,
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <button
                ref={(node) => registerNote(note.id, node)}
                type="button"
                aria-expanded={isOpen}
                onClick={(event) => {
                  /* The canvas closes notes on any click that reaches it. */
                  event.stopPropagation();
                  onToggleNote(note.id);
                }}
                className={`pointer-events-auto block w-full cursor-pointer rounded-2xl border ${CARD[note.type]} bg-void/85 p-3 text-left shadow-panel backdrop-blur-md transition-colors duration-200 ease-instrument hover:bg-void ${
                  isOpen ? 'ring-2 ring-chalk ring-offset-2 ring-offset-void' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${FILL[note.type]} font-body text-[0.5rem] font-bold text-void`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-micro font-bold uppercase text-silver">
                    {LABEL[note.type]}
                  </span>
                </span>

                <span className="mt-2 block text-pretty text-tiny leading-[1.55] text-chalk">
                  {note.note ?? note.title}
                </span>
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
