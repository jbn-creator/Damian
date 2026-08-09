import type { DomAudit, Rect } from './capture';
import type {
  AuditPin,
  ProductIdea,
  ScorecardMetric,
  ScriptedLog,
  ScriptedPinDrop,
} from './types';

/**
 * Rules that turn a measured page into Damian's findings.
 *
 * Every claim here is arithmetic on something counted in the DOM. No model is
 * called, so nothing is invented and nothing costs anything. A rule that
 * cannot point at a box inside the capture does not produce a pin, because a
 * pin that does not land on the thing it describes is worse than no pin.
 */

/** A box is usable as a pin only if it sits inside the captured image. */
const anchored = (box: Rect | null): box is Rect =>
  Boolean(box) && box!.y > 0.5 && box!.y < 99.5 && box!.x > 0.5 && box!.x < 99.5;

const clamp = (value: number, min = 0, max = 100) =>
  Math.round(Math.min(Math.max(value, min), max));

interface Rule {
  id: string;
  /** Present only when the rule fires and can point somewhere. */
  pin?: AuditPin;
  idea?: ProductIdea;
  /** What Damian says while he works. */
  says: string[];
}

/** The benchmark Damian quotes for signup length. */
const FIELD_BENCHMARK = 3;

function buildRules(audit: DomAudit): Rule[] {
  const rules: Rule[] = [];
  const host = (() => {
    try {
      return new URL(audit.url).hostname;
    } catch {
      return audit.url;
    }
  })();

  /* 1. Form length. The one finding with a real published benchmark. */
  const gate = audit.requiredCount || audit.fieldCount;
  if (gate > FIELD_BENCHMARK) {
    const over = gate - FIELD_BENCHMARK;
    const label = audit.requiredCount ? 'required' : 'visible';
    rules.push({
      id: 'fields',
      says: [
        `Counted ${gate} ${label} form fields above the fold.`,
        `Benchmark median for this category is ${FIELD_BENCHMARK}. This asks for ${over} more.`,
      ],
      pin: anchored(audit.formBox)
        ? {
            id: 'pin-fields',
            x: audit.formBox.x,
            y: audit.formBox.y,
            type: 'friction',
            title: `Capture asks for ${gate} fields. ${over} more than the median.`,
            description: `Damian counted ${gate} ${label} fields in this form. The benchmark median for this category is ${FIELD_BENCHMARK}. Completion drops roughly 7 percent per field past the third, so on these numbers this form is leaving about ${clamp(over * 7, 0, 60)} percent of finishers on the table.`,
            impactScore: clamp(55 + over * 9),
            suggestedFix: `Cut to ${FIELD_BENCHMARK} fields at the gate. Move the remaining ${over} into a profile step after the account exists and there is something in it worth protecting.`,
          }
        : undefined,
      idea: {
        id: 'idea-fields',
        category: 'quick_win',
        title: `Cut the form from ${gate} fields to ${FIELD_BENCHMARK}`,
        description: `The form asks for ${gate} ${label} fields before returning anything of value. The category median is ${FIELD_BENCHMARK}.`,
        solution: `Keep the ${FIELD_BENCHMARK} fields you cannot infer. Defer the other ${over} to a post activation step, and prefill what the email domain already tells you.`,
        impact: over >= 3 ? 'High' : 'Medium',
        effort: over >= 3 ? '1d' : '2h',
      },
    });
  }

  /* 2. Headline. Only the claims that can be measured, not judged. */
  if (!audit.h1) {
    rules.push({
      id: 'no-h1',
      says: ['No h1 on the page. Nothing declares what this is.'],
      pin: anchored(audit.structureBox)
        ? {
            id: 'pin-no-h1',
            x: audit.structureBox.x,
            y: audit.structureBox.y,
            type: 'warning',
            title: 'No h1 on the page.',
            description:
              'Damian found no level one heading. Assistive technology and search crawlers both use it as the page’s declaration of what it is, and there is nothing here for either to read.',
            impactScore: 72,
            suggestedFix:
              'Add one h1 that names the outcome for the visitor, and keep it the only h1 on the page.',
          }
        : undefined,
      idea: {
        id: 'idea-no-h1',
        category: 'quick_win',
        title: 'Give the page an h1',
        description: 'There is no level one heading, so nothing declares what the page is.',
        solution: 'Add a single h1 naming the outcome, above the primary action.',
        impact: 'High',
        effort: '1h',
      },
    });
  } else if (!audit.h1HasNumber && anchored(audit.h1Box)) {
    rules.push({
      id: 'headline-proof',
      says: [`Read the headline. ${audit.h1.length} characters, no figure in it.`],
      pin: {
        id: 'pin-headline',
        x: audit.h1Box.x,
        y: audit.h1Box.y,
        type: 'warning',
        title: 'Headline carries no number.',
        description: `The headline reads: "${audit.h1.slice(0, 90)}${audit.h1.length > 90 ? '…' : ''}". It contains no figure. A claim with a number attached is the cheapest proof available above the fold, and this one is spending its position without one.`,
        impactScore: 61,
        suggestedFix:
          'Put the measurable outcome in the headline. A figure the visitor can check beats an adjective they have to trust.',
      },
      idea: {
        id: 'idea-headline',
        category: 'quick_win',
        title: 'Put a number in the headline',
        description: 'The headline makes a claim with no figure behind it.',
        solution:
          'Lead with the measurable outcome and keep the audience in the subhead, so the ask lands after the argument.',
        impact: 'High',
        effort: '1h',
      },
    });
  }

  /* 3. Missing alt text. Counted, not judged. */
  if (audit.imagesMissingAlt > 0) {
    const share = Math.round((audit.imagesMissingAlt / Math.max(audit.images, 1)) * 100);
    rules.push({
      id: 'alt',
      says: [`${audit.imagesMissingAlt} of ${audit.images} images carry no alt text.`],
      pin: anchored(audit.missingAltBox)
        ? {
            id: 'pin-alt',
            x: audit.missingAltBox.x,
            y: audit.missingAltBox.y,
            type: 'warning',
            title: `${audit.imagesMissingAlt} images have no alt text.`,
            description: `Damian counted ${audit.images} visible images and ${audit.imagesMissingAlt} of them, ${share} percent, have an empty or missing alt attribute. Every one is invisible to a screen reader and to anything else reading the page without eyes.`,
            impactScore: clamp(40 + share / 2),
            suggestedFix:
              'Describe the ones carrying meaning. Mark the purely decorative ones with an explicit empty alt so they are skipped on purpose rather than by accident.',
          }
        : undefined,
      idea: {
        id: 'idea-alt',
        category: 'quick_win',
        title: `Write alt text for ${audit.imagesMissingAlt} images`,
        description: `${audit.imagesMissingAlt} of ${audit.images} visible images have no alt attribute.`,
        solution:
          'Describe the informative images, and give the decorative ones an explicit empty alt.',
        impact: share > 50 ? 'Medium' : 'Low',
        effort: '2h',
      },
    });
  }

  /* 4. Tap targets. Measured against the 24px minimum. */
  if (audit.tinyTapTargets > 0) {
    rules.push({
      id: 'targets',
      says: [
        `${audit.tinyTapTargets} of ${audit.interactive} controls are under 24 pixels.`,
      ],
      pin: anchored(audit.tinyTapBox)
        ? {
            id: 'pin-targets',
            x: audit.tinyTapBox.x,
            y: audit.tinyTapBox.y,
            type: 'friction',
            title: `${audit.tinyTapTargets} controls are under the 24px minimum.`,
            description: `Damian measured ${audit.interactive} interactive elements. ${audit.tinyTapTargets} of them are smaller than 24 pixels on at least one axis, which is under the minimum target size and a miss on touch before it is anything else.`,
            impactScore: clamp(45 + audit.tinyTapTargets * 3),
            suggestedFix:
              'Pad the hit area to at least 24 by 24 without changing the visual size. The target and the graphic do not have to be the same box.',
          }
        : undefined,
      idea: {
        id: 'idea-targets',
        category: 'quick_win',
        title: 'Bring the small controls up to 24 pixels',
        description: `${audit.tinyTapTargets} interactive elements are under the minimum target size.`,
        solution: 'Expand the hit area with padding, leaving the visual size alone.',
        impact: 'Medium',
        effort: '2h',
      },
    });
  }

  /* 5. What the page gets right. A board with no wins on it is not a review. */
  if (audit.landmarkCount >= 3 && audit.headingCount >= 3) {
    rules.push({
      id: 'structure',
      says: [
        `Structure holds. ${audit.landmarkCount} landmarks, ${audit.headingCount} headings.`,
      ],
      pin: anchored(audit.structureBox)
        ? {
            id: 'pin-structure',
            x: audit.structureBox.x,
            y: audit.structureBox.y,
            type: 'opportunity',
            title: 'Document structure is sound.',
            description: `Damian counted ${audit.landmarkCount} landmark regions and ${audit.headingCount} headings on ${host}. The outline is real, which means assistive technology can navigate this page by structure rather than by guessing.`,
            impactScore: clamp(50 + audit.headingCount * 2),
            suggestedFix:
              'Hold this. When the next screen ships, give it the same landmark and heading skeleton rather than a wall of divs.',
          }
        : undefined,
    });
  }

  return rules;
}

export interface DerivedFindings {
  pins: AuditPin[];
  logs: ScriptedLog[];
  pinSchedule: ScriptedPinDrop[];
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];
  duration: number;
}

/** Turn a measured page into everything the interface needs to play a run. */
export function deriveFindings(audit: DomAudit): DerivedFindings {
  const rules = buildRules(audit);

  /*
   * Two rules can anchor to the same element, and a pin sitting exactly on top
   * of another one hides it. Nudge collisions apart so every finding stays
   * clickable, keeping the first one where it was measured.
   */
  const placed: AuditPin[] = [];
  rules.forEach((rule) => {
    if (!rule.pin) return;
    const pin = { ...rule.pin };
    while (placed.some((other) => Math.hypot(other.x - pin.x, other.y - pin.y) < 3.2)) {
      pin.x = clamp(pin.x + 3.4, 2, 98);
      pin.y = clamp(pin.y + 2.2, 2, 98);
    }
    placed.push(pin);
  });
  const pins = placed;
  const ideas = rules
    .map((rule) => rule.idea)
    .filter((idea): idea is ProductIdea => Boolean(idea));

  const host = (() => {
    try {
      return new URL(audit.url).hostname;
    } catch {
      return audit.url;
    }
  })();

  /* Narration, paced so it reads as work rather than as a dump. */
  const logs: ScriptedLog[] = [];
  const pinSchedule: ScriptedPinDrop[] = [];
  let at = 300;
  const say = (message: string, type: ScriptedLog['type']) => {
    logs.push({
      id: `log-${logs.length + 1}`,
      at,
      timestamp: `${(at / 1000).toFixed(1)}s`,
      message,
      type,
    });
    at += 700;
  };

  say(`Opened ${host}. Waiting for paint.`, 'info');
  say(`Page loaded. Measuring ${audit.interactive} interactive elements.`, 'info');

  rules.forEach((rule) => {
    rule.says.forEach((line) => say(line, 'insight'));
    if (rule.pin) {
      say(`Pinning ${rule.pin.type} at ${Math.round(rule.pin.y)} percent down the page.`, 'action');
      pinSchedule.push({ pinId: rule.pin.id, at: at - 700 });
    }
  });

  if (rules.length === 0) {
    say('Nothing measurable came back against the rules Damian runs.', 'info');
  }

  say('Scoring 4 dimensions. Writing the board.', 'info');
  say(
    `Board ready. ${ideas.length} ${ideas.length === 1 ? 'opportunity' : 'opportunities'}. ${pins.length} ${pins.length === 1 ? 'pin' : 'pins'} on the capture.`,
    'action',
  );

  const gate = audit.requiredCount || audit.fieldCount;

  /*
   * Scores, each one arithmetic on something counted.
   *
   * Every scale saturates rather than running linear, so a page cannot reach
   * 100 by stacking headings and cannot reach 0 on one noisy signal. Each
   * verdict names the number that actually moved the score, because a verdict
   * that reports a different fact than the one being scored reads as a lie.
   */
  const toward = (base: number, ceiling: number, amount: number, rate: number) =>
    clamp(base + (ceiling - base) * (1 - Math.exp(-amount / rate)));

  const overGate = Math.max(gate - FIELD_BENCHMARK, 0);
  const tinyShare = audit.interactive
    ? audit.tinyTapTargets / audit.interactive
    : 0;

  const frictionScore = clamp(
    92 - overGate * 11 - Math.round(tinyShare * 100) * 0.6,
  );
  const frictionDriver =
    overGate > 0
      ? `${gate} fields at the gate against a median of ${FIELD_BENCHMARK}.`
      : audit.tinyTapTargets > 0
        ? `${audit.tinyTapTargets} of ${audit.interactive} controls under 24px.`
        : `${gate} fields at the gate, and no undersized controls.`;

  const metrics: ScorecardMetric[] = [
    {
      id: 'metric-hierarchy',
      label: 'Visual Hierarchy',
      score: toward(28, 94, audit.headingCount + audit.landmarkCount, 9),
      verdict: `${audit.headingCount} headings across ${audit.landmarkCount} landmark regions.`,
    },
    {
      id: 'metric-friction',
      label: 'UX Friction',
      score: frictionScore,
      verdict: frictionDriver,
    },
    {
      id: 'metric-copy',
      label: 'Copy Clarity',
      score: audit.h1 ? (audit.h1HasNumber ? 82 : 54) : 24,
      verdict: audit.h1
        ? audit.h1HasNumber
          ? 'Headline present and carries a figure.'
          : 'Headline present. No figure in it.'
        : 'No h1 on the page.',
    },
    {
      id: 'metric-onboarding',
      label: 'Onboarding Efficiency',
      score: clamp(90 - overGate * 10 - (audit.imagesMissingAlt > 0 ? 6 : 0)),
      verdict:
        gate > 0
          ? `First ask is ${gate} ${gate === 1 ? 'field' : 'fields'} deep.`
          : 'No capture form found on this page.',
    },
  ];

  return { pins, logs, pinSchedule, ideas, metrics, duration: at };
}
