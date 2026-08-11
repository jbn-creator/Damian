/**
 * Damian domain contracts.
 *
 * The core shapes are fixed. Extensions below add fields, never relax or
 * widen an existing one.
 */

export type PinType = 'friction' | 'warning' | 'opportunity';

export type DamianState =
  | 'idle'
  | 'launching'
  | 'scanning'
  | 'analyzing'
  | 'complete';

export interface AuditPin {
  id: string;
  x: number; // percentage from left
  y: number; // percentage from top
  type: PinType;
  title: string;
  description: string;
  impactScore: number;
  suggestedFix: string;
  /** Extension: the element box, so the note can frame what it is about. */
  w?: number;
  h?: number;
  /** Extension: what Damian says out loud. About three lines, plain speech. */
  note?: string;
  /** Extension: which captured page this belongs to. */
  page?: number;
}

export interface ProductIdea {
  id: string;
  category: 'quick_win' | 'missing_feature' | 'monetization';
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: string;
  codeSnippet?: string;
  /** Extension: the proposed solution, stated separately from the problem. */
  solution: string;
}

export interface DamianLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'action' | 'insight';
}

export interface ScorecardMetric {
  id: string;
  label: string;
  score: number; // 0 to 100
  verdict: string;
}

/* Extensions below. Additive only. */

/**
 * A scripted feed entry. `at` is the offset in milliseconds from launch and
 * exists only to pace the simulated run.
 */
export interface ScriptedLog extends DamianLog {
  at: number;
}

/** Which pin Damian drops, and when. */
export interface ScriptedPinDrop {
  pinId: string;
  at: number;
}

/** Which state Damian moves into, and when. */
export interface ScriptedStateChange {
  state: DamianState;
  at: number;
}

/** Test credentials for gated applications. Session memory only. */
export interface TestCredentials {
  username: string;
  password: string;
}

export type ViewportSize = 'desktop' | 'tablet' | 'mobile';

export type CommandTab = 'feed' | 'canvas' | 'scorecard';

export type ToastTone = 'accent' | 'success' | 'warning';

export interface Toast {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
}
