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
  /**
   * True while Damian is still walking. One note is up at a time and the page
   * around it is dimmed, so there is no question what he is pointing at and no
   * stale note left behind when he moves on.
   */
  spotlit: boolean;
}

/*
 * Outline only, never a fill. A tint over a full width heading washes out the
 * page Damian is annotating, which defeats the point of showing the real one.
 */
const EDGE: Record<AuditPin['type'], string> = {
  friction: 'border-crimson',
  warning: 'border-amber',
  opportunity: 'border-emerald',
};

const CARD: Record<AuditPin['type'], string> = {
  friction: 'border-crimson/50',
  warning: 'border-amber/50',
  opportunity: 'border-emerald/50',
};

const FILL: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const INK: Record<AuditPin['type'], string> = {
  friction: 'text-crimson',
  warning: 'text-amber',
  opportunity: 'text-emerald',
};

const LABEL: Record<AuditPin['type'], string> = {
  friction: 'Friction',
  warning: 'Worth a look',
  opportunity: 'Working',
};

/*
 * Card footprint, as a share of the frame. The overlay works in percentages so
 * it holds at any container size, and these are what the layout pass reasons
 * about.
 */
const CARD_W = 24;
/*
 * The height the layout reserves. The card is clamped to four lines so it can
 * never exceed this, because a card taller than its declared footprint passes
 * the bounds check and then gets cut off by the frame it sits in.
 */
const CARD_H = 20;
const GAP = 2.5;

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
 * Tried beside, then above, then below the element it describes, and the first
 * spot inside the frame and clear of every card already placed wins. Without
 * this, two findings on one element stack and neither can be read.
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

/** Corner brackets, the way a camera frames what it has locked onto. */
function Brackets({ tone, zoom }: { tone: AuditPin['type']; zoom: number }) {
  const corners = [
    { at: 'left-0 top-0 border-l-2 border-t-2 rounded-tl-md', origin: 'top left' },
    { at: 'right-0 top-0 border-r-2 border-t-2 rounded-tr-md', origin: 'top right' },
    { at: 'left-0 bottom-0 border-l-2 border-b-2 rounded-bl-md', origin: 'bottom left' },
    { at: 'right-0 bottom-0 border-r-2 border-b-2 rounded-br-md', origin: 'bottom right' },
  ];
  return (
    <>
      {corners.map((corner) => (
        <span
          key={corner.origin}
          aria-hidden="true"
          className={`absolute h-3.5 w-3.5 ${corner.at} ${EDGE[tone]}`}
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: corner.origin }}
        />
      ))}
    </>
  );
}

/**
 * Damian's notes, on the page they are about.
 *
 * While he is walking, one note is up at a time and everything except the
 * element it concerns is dimmed, so there is no ambiguity about what he means
 * and nothing stale left behind when he moves on. Once he stops, every note on
 * the page you are reading is shown at once and the dimming lifts.
 *
 * GSAP owns the arrival, as it owns every orchestrated timeline in the app.
 */
export function NoteOverlay({
  notes,
  zoom,
  visible,
  openNoteId,
  onToggleNote,
  registerNote,
  spotlit,
}: NoteOverlayProps) {
  const anchors = useRef(new Map<string, HTMLLIElement>());
  const landed = useRef(new Set<string>());
  const tweens = useRef<gsap.core.Tween[]>([]);
  const reduced = usePrefersReducedMotion();

  /*
   * Page-level notes have no element to sit beside, so they take no part in
   * the collision layout. They dock along the bottom edge of the page instead,
   * stacking upward, which reads as "about this page" without pretending to a
   * precision the note does not have.
   */
  const anchoredNotes = useMemo(() => notes.filter((note) => !note.pageLevel), [notes]);
  const spots = useMemo(() => layout(anchoredNotes), [anchoredNotes]);

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
      {notes.map((note) => {
        const width = Math.max(note.w ?? 0, 1.5);
        const height = Math.max(note.h ?? 0, 1.5);
        const index = anchoredNotes.indexOf(note);
        const docked = note.pageLevel
          ? notes.filter((other) => other.pageLevel).indexOf(note)
          : 0;
        const spot = note.pageLevel
          ? { left: 2, top: 78 - docked * (CARD_H + 1) }
          : spots[index] ?? { left: 2, top: 2 };
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
            {/*
              The element under discussion, framed. When spotlit, the scrim is
              an outward box shadow on this same rectangle, so the whole page
              dims and only this stays cut out of the dimming. A page-level
              note has no element, so it gets no frame and dims nothing.
            */}
            {!note.pageLevel && (
              <span
                aria-hidden="true"
                className={`absolute transition-shadow duration-500 ease-instrument ${
                  spotlit ? 'shadow-spotlight' : ''
                }`}
                style={{
                  left: `${note.x - width / 2}%`,
                  top: `${note.y - height / 2}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              >
                <Brackets tone={note.type} zoom={zoom} />
                <span
                  className={`absolute left-0 top-0 grid h-4 w-4 place-items-center rounded-full ${FILL[note.type]} font-body text-[0.5rem] font-bold text-void`}
                  style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                >
                  {index + 1}
                </span>
              </span>
            )}

            {/*
              The card. Counter scaled against canvas zoom by the inline style,
              which is this element's only transform writer, so the note stays
              readable while the page under it grows.
            */}
            <span
              className="absolute z-10 block"
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
                className={`pointer-events-auto block w-full cursor-pointer overflow-hidden rounded-2xl border ${
                  note.pageLevel ? 'border-dashed' : ''
                } ${CARD[note.type]} bg-void/85 text-left shadow-panel backdrop-blur-xl transition-colors duration-200 ease-instrument hover:bg-void ${
                  isOpen ? 'ring-2 ring-chalk ring-offset-2 ring-offset-void' : ''
                }`}
              >
                {/* Readout strip: what kind of finding, where, and its weight. */}
                <span className="flex items-center gap-2 border-b border-hairline px-3 py-2">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${FILL[note.type]} animate-breathe`}
                  />
                  <span className={`text-micro font-bold uppercase ${INK[note.type]}`}>
                    {LABEL[note.type]}
                  </span>
                  {/* Anchored notes show where they sit; a page-level note says what it is instead. */}
                  <span
                    data-numeric
                    className="ml-auto font-mono text-[0.5625rem] leading-none text-silver"
                  >
                    {note.pageLevel ? 'PAGE' : `${Math.round(note.x)}.${Math.round(note.y)}`}
                  </span>
                  <span
                    data-numeric
                    className={`font-display text-tiny font-bold leading-none ${INK[note.type]}`}
                  >
                    {note.impactScore}
                  </span>
                </span>

                <span className="line-clamp-4 block px-3 py-2.5 text-pretty text-tiny leading-[1.5] text-chalk">
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
