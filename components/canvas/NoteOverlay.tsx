'use client';

import { useEffect, useRef } from 'react';
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

const FRAME: Record<AuditPin['type'], string> = {
  friction: 'border-crimson',
  warning: 'border-amber',
  opportunity: 'border-emerald',
};

const TINT: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson/10',
  warning: 'bg-amber/10',
  opportunity: 'bg-emerald/10',
};

const CARD: Record<AuditPin['type'], string> = {
  friction: 'border-crimson/45',
  warning: 'border-amber/45',
  opportunity: 'border-emerald/45',
};

const DOT: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const LABEL: Record<AuditPin['type'], string> = {
  friction: 'Friction',
  warning: 'Worth a look',
  opportunity: 'Working',
};

/**
 * Damian's notes, on the page they are about.
 *
 * Each one frames the element it concerns and says what it thinks in about
 * three lines. The card sits on whichever side of the element has room, so it
 * never covers the thing it is pointing at.
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
        /* Put the card on the side with room, so it never covers the subject. */
        const side = note.x > 52 ? 'right' : 'left';
        const isOpen = openNoteId === note.id;

        return (
          <li
            key={note.id}
            ref={(node) => {
              if (node) anchors.current.set(note.id, node);
              else anchors.current.delete(note.id);
            }}
            className="absolute opacity-0"
            style={{
              left: `${note.x - width / 2}%`,
              top: `${note.y - height / 2}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
          >
            {/* The frame around what the note is about. */}
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-xl border-2 ${FRAME[note.type]} ${TINT[note.type]}`}
            />

            {/*
              The card. Counter scaled against canvas zoom by the inline style,
              which is this element's only transform writer, so the note stays
              readable while the page under it grows.
            */}
            <span
              className="absolute top-0 block"
              style={{
                [side === 'left' ? 'left' : 'right']: '0%',
                transform: `scale(${1 / zoom})`,
                transformOrigin: side === 'left' ? 'top left' : 'top right',
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
                className={`pointer-events-auto block w-[15rem] cursor-pointer rounded-2xl border ${CARD[note.type]} bg-void/85 p-3 text-left shadow-panel backdrop-blur-md transition-colors duration-200 ease-instrument hover:bg-void ${
                  isOpen ? 'ring-2 ring-chalk ring-offset-2 ring-offset-void' : ''
                }`}
                style={{
                  [side === 'left' ? 'marginLeft' : 'marginRight']: '0',
                  translate: side === 'left' ? '0 -100%' : '0 -100%',
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[note.type]}`}
                  />
                  <span className="text-micro font-bold uppercase text-silver">
                    {LABEL[note.type]}
                  </span>
                  <span
                    data-numeric
                    className="ml-auto text-micro font-semibold text-silver"
                  >
                    {index + 1}
                  </span>
                </span>

                <span className="mt-1.5 block text-pretty text-tiny leading-[1.55] text-chalk">
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
