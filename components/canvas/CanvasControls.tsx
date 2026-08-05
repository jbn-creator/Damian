'use client';

import { Camera, Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';

interface CanvasControlsProps {
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  pinsVisible: boolean;
  onTogglePins: () => void;
  onCapture: () => void;
}

interface ControlButtonProps {
  label: string;
  icon: typeof ZoomIn;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

/**
 * One control. The visible label is a CSS tooltip on hover and focus, and the
 * accessible name is a screen reader only string inside the button, so the two
 * never drift apart.
 */
function ControlButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  active = false,
}: ControlButtonProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-200 ease-instrument disabled:cursor-not-allowed disabled:text-silver/35 ${
          active
            ? 'bg-cobalt/15 text-cobalt'
            : 'text-silver hover:bg-hairline hover:text-chalk'
        }`}
      >
        <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        <span className="sr-only">{label}</span>
      </button>

      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 mb-3 whitespace-nowrap rounded-full border border-hairline bg-obsidian px-3 py-1.5 text-micro font-semibold uppercase text-chalk opacity-0 shadow-lift transition-opacity duration-200 ease-instrument group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ transform: 'translateX(-50%)' }}
      >
        {label}
      </span>
    </span>
  );
}

/** Floating canvas controls. Zoom steps only. Freeform pan is a second pass. */
export function CanvasControls({
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  pinsVisible,
  onTogglePins,
  onCapture,
}: CanvasControlsProps) {
  return (
    <div
      role="group"
      aria-label="Canvas controls"
      className="absolute bottom-4 left-1/2 z-20 flex items-center gap-1 rounded-full border border-hairline bg-obsidian/95 p-1.5 shadow-panel backdrop-blur-xl"
      style={{ transform: 'translateX(-50%)' }}
    >
      <ControlButton
        label="Zoom out"
        icon={ZoomOut}
        onClick={onZoomOut}
        disabled={!canZoomOut}
      />

      <span
        data-numeric
        aria-hidden="true"
        className="w-11 text-center text-micro font-semibold text-silver"
      >
        {`${Math.round(zoom * 100)}%`}
      </span>

      <ControlButton
        label="Zoom in"
        icon={ZoomIn}
        onClick={onZoomIn}
        disabled={!canZoomIn}
      />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-hairline" />

      <ControlButton
        label={pinsVisible ? 'Hide pins' : 'Show pins'}
        icon={pinsVisible ? Eye : EyeOff}
        onClick={onTogglePins}
        active={!pinsVisible}
      />

      <ControlButton label="Capture canvas" icon={Camera} onClick={onCapture} />
    </div>
  );
}
