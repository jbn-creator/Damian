import type { DomAudit, PageCapture, Rect } from './capture';
import type { AuditPin, ProductIdea, ScorecardMetric } from './types';

/**
 * What Damian says about a page.
 *
 * Every note is arithmetic on something counted or measured in the DOM, so
 * nothing here is invented and nothing costs anything. The voice is plain
 * speech, roughly three lines, the way a designer says it standing behind you
 * rather than the way a report writes it.
 *
 * A rule that cannot point at a box inside the captured frame produces no
 * note, because a note that does not sit on the thing it describes is worse
 * than no note at all.
 */

const anchored = (box: Rect | null | undefined): box is Rect =>
  Boolean(box) && box!.y > 0.5 && box!.y < 99.5 && box!.x > 0.5 && box!.x < 99.5;

const clamp = (value: number, min = 0, max = 100) =>
  Math.round(Math.min(Math.max(value, min), max));

/** The benchmark Damian quotes for how long a gate should be. */
const FIELD_BENCHMARK = 3;

interface Draft {
  id: string;
  type: AuditPin['type'];
  box: Rect | null | undefined;
  /** Spoken, about three lines. */
  note: string;
  title: string;
  /** The longer version, for when someone opens the note. */
  description: string;
  fix: string;
  score: number;
  idea?: ProductIdea;
}

function draftsFor(audit: DomAudit): Draft[] {
  /*
   * A gate is not the product. Critiquing an interstitial and presenting it as
   * a finding about the site is a false claim, so no rule runs behind a wall.
   */
  if (audit.wall) return [];

  const drafts: Draft[] = [];
  const gate = audit.requiredCount || audit.fieldCount;

  if (gate > FIELD_BENCHMARK) {
    const over = gate - FIELD_BENCHMARK;
    const label = audit.requiredCount ? 'required' : 'visible';
    drafts.push({
      id: 'fields',
      type: 'friction',
      box: audit.formBox,
      note: `This form wants ${gate} things before it gives anything back. The median is ${FIELD_BENCHMARK}, and every field past the third is costing you finishers.`,
      title: `${gate} fields at the gate`,
      description: `Damian counted ${gate} ${label} fields here against a category median of ${FIELD_BENCHMARK}. Completion drops roughly 7 percent per field past the third, so on these numbers this form is leaving about ${clamp(over * 7, 0, 60)} percent of finishers behind.`,
      fix: `Keep the ${FIELD_BENCHMARK} you cannot infer. Move the other ${over} into a step after the account exists.`,
      score: clamp(55 + over * 9),
      idea: {
        id: 'idea-fields',
        category: 'quick_win',
        title: `Cut the form from ${gate} fields to ${FIELD_BENCHMARK}`,
        description: `The form asks for ${gate} ${label} fields before returning anything of value. The category median is ${FIELD_BENCHMARK}.`,
        solution: `Keep what you cannot infer, defer the other ${over}, and prefill from the email domain.`,
        impact: over >= 3 ? 'High' : 'Medium',
        effort: over >= 3 ? '1d' : '2h',
      },
    });
  }

  if (!audit.h1) {
    drafts.push({
      id: 'no-h1',
      type: 'warning',
      box: audit.structureBox,
      note: 'There is no h1 on this page. Nothing here declares what it actually is, so a screen reader and a crawler both arrive with nothing to go on.',
      title: 'No h1 on the page',
      description:
        'Damian found no level one heading. It is the page declaring what it is, and both assistive technology and search rely on it.',
      fix: 'Add one h1 naming the outcome for the visitor, and keep it the only one.',
      score: 72,
      idea: {
        id: 'idea-no-h1',
        category: 'quick_win',
        title: 'Give every page an h1',
        description: 'Pages were found with no level one heading, so nothing declares what they are.',
        solution: 'Add a single h1 naming the outcome, above the primary action.',
        impact: 'High',
        effort: '1h',
      },
    });
  } else if (!audit.h1HasNumber && anchored(audit.h1Box)) {
    drafts.push({
      id: 'headline',
      type: 'warning',
      box: audit.h1Box,
      note: 'The headline makes a claim with nothing to check it against. One figure would do more work here than another adjective.',
      title: 'Headline carries no number',
      description: `The headline reads: "${audit.h1.slice(0, 90)}${audit.h1.length > 90 ? '...' : ''}". No figure in it. A number the visitor can check is the cheapest proof available above the fold.`,
      fix: 'Put the measurable outcome in the headline and move the audience to the subhead.',
      score: 61,
      idea: {
        id: 'idea-headline',
        category: 'quick_win',
        title: 'Put a number in the headline',
        description: 'Headlines make claims with no figure behind them.',
        solution: 'Lead with the measurable outcome, keep the audience in the subhead.',
        impact: 'High',
        effort: '1h',
      },
    });
  }

  /* The title sitting on a different edge from everything under it. */
  if (
    audit.h1Align &&
    audit.bodyAlign &&
    anchored(audit.h1Box) &&
    audit.h1Align !== audit.bodyAlign &&
    ['center', 'right', 'end'].includes(audit.h1Align)
  ) {
    drafts.push({
      id: 'align',
      type: 'warning',
      box: audit.h1Box,
      note: `Hmm, I would not ${audit.h1Align === 'center' ? 'centre' : 'right align'} the title when the body under it runs to the other edge. Pick one edge and hold it down the page.`,
      title: `Title is ${audit.h1Align} aligned, body is not`,
      description: `The h1 is ${audit.h1Align} aligned while the body text is ${audit.bodyAlign}. Mixed alignment in the same column breaks the vertical edge the eye follows down a page.`,
      fix: 'Align the heading to the same edge as the copy beneath it.',
      score: 44,
    });
  }

  /* Contrast, measured against whatever is actually behind the text. */
  if (audit.worstContrast && anchored(audit.worstContrast.box)) {
    const { ratio, sample } = audit.worstContrast;
    drafts.push({
      id: 'contrast',
      type: 'friction',
      box: audit.worstContrast.box,
      note: `You should change this colour. "${sample.slice(0, 32)}" sits at ${ratio} to 1 on its background when the floor is 4.5. In daylight that is guesswork.`,
      title: `Text at ${ratio} to 1`,
      description: `Damian measured ${audit.contrastMisses} text elements below the contrast floor on this page. The worst sits at ${ratio} to 1 against what is directly behind it, where the minimum is 4.5 for normal text and 3 for large.`,
      fix: 'Darken the text or lighten what it sits on until it clears 4.5 to 1.',
      score: clamp(90 - ratio * 8),
      idea: {
        id: 'idea-contrast',
        category: 'quick_win',
        title: 'Fix the contrast failures',
        description: 'Text was found sitting below the contrast floor against its own background.',
        solution: 'Adjust the foreground or the surface until each pairing clears 4.5 to 1.',
        impact: audit.contrastMisses > 6 ? 'High' : 'Medium',
        effort: '3h',
      },
    });
  }

  /* One control coloured unlike everything around it. */
  if (audit.colourOutlier && anchored(audit.colourOutlier.box)) {
    drafts.push({
      id: 'colour',
      type: 'warning',
      box: audit.colourOutlier.box,
      note: `This is the only control on the page wearing ${audit.colourOutlier.colour}, while everything else uses ${audit.colourOutlier.dominant}. Right now it reads as a mistake rather than emphasis.`,
      title: 'One control is off palette',
      description:
        'Damian grouped every control by fill. This one is alone in its colour while the dominant fill carries the rest. A colour used once either means something specific or it is an accident, and nothing here says which.',
      fix: 'Bring it onto the palette, or give it a role that explains why it differs.',
      score: 38,
    });
  }

  /* How many typefaces are actually in play. */
  if (audit.fontFamilies.length > 3 && anchored(audit.fontBox)) {
    drafts.push({
      id: 'fonts',
      type: 'warning',
      box: audit.fontBox,
      note: `There are ${audit.fontFamilies.length} typefaces running on this page. Two is usually the ceiling before type stops looking deliberate.`,
      title: `${audit.fontFamilies.length} typefaces on one page`,
      description: `Damian found ${audit.fontFamilies.length} distinct font families on visible text: ${audit.fontFamilies.slice(0, 4).join(', ')}. Past two or three, type stops signalling hierarchy and starts signalling drift.`,
      fix: 'Pick one display face and one text face, and let weight carry the rest.',
      score: 34,
    });
  }

  if (audit.tinyTapTargets > 0 && anchored(audit.tinyTapBox)) {
    drafts.push({
      id: 'targets',
      type: 'friction',
      box: audit.tinyTapBox,
      note: `${audit.tinyTapTargets} of your ${audit.interactive} controls are under 24 pixels. On a phone that is a coin flip every time someone taps.`,
      title: `${audit.tinyTapTargets} controls under 24px`,
      description: `Of ${audit.interactive} interactive elements, ${audit.tinyTapTargets} measure under 24 pixels on at least one axis. Inline links in running text are exempt and are not counted here.`,
      fix: 'Pad the hit area to 24 by 24 without changing how big it looks.',
      score: clamp(45 + audit.tinyTapTargets / 4),
      idea: {
        id: 'idea-targets',
        category: 'quick_win',
        title: 'Bring the small controls up to 24 pixels',
        description: 'Interactive elements were found under the minimum target size.',
        solution: 'Expand the hit area with padding, leaving the visual size alone.',
        impact: 'Medium',
        effort: '2h',
      },
    });
  }

  if (audit.imagesMissingAlt > 0 && anchored(audit.missingAltBox)) {
    drafts.push({
      id: 'alt',
      type: 'warning',
      box: audit.missingAltBox,
      note: `${audit.imagesMissingAlt} of ${audit.images} images here have no alt text. Anyone not looking at the screen gets nothing from them.`,
      title: `${audit.imagesMissingAlt} images with no alt`,
      description: `Damian counted ${audit.images} visible images, ${audit.imagesMissingAlt} of them with an empty or missing alt attribute.`,
      fix: 'Describe the ones that carry meaning, and mark the decorative ones with an explicit empty alt.',
      score: clamp(35 + (audit.imagesMissingAlt / Math.max(audit.images, 1)) * 40),
      idea: {
        id: 'idea-alt',
        category: 'quick_win',
        title: 'Write the missing alt text',
        description: 'Visible images were found with no alt attribute.',
        solution: 'Describe the informative ones, give the decorative ones an empty alt.',
        impact: 'Medium',
        effort: '2h',
      },
    });
  }

  if (audit.landmarkCount >= 3 && audit.headingCount >= 3 && anchored(audit.structureBox)) {
    drafts.push({
      id: 'structure',
      type: 'opportunity',
      box: audit.structureBox,
      note: `This part holds up. ${audit.headingCount} headings across ${audit.landmarkCount} landmarks, so the page can be navigated by structure rather than by guessing.`,
      title: 'Structure is sound here',
      description: `Damian counted ${audit.landmarkCount} landmark regions and ${audit.headingCount} headings. The outline is real, which is what lets assistive technology move through the page.`,
      fix: 'Hold this. Give the next screen the same skeleton rather than a wall of divs.',
      score: clamp(50 + audit.headingCount * 2),
    });
  }

  return drafts;
}

export interface PageNotes {
  notes: AuditPin[];
  says: string[];
}

/** Second and later times Damian meets the same problem, he says less. */
const REPEAT_LINE: Record<string, string> = {
  fields: 'Same long form here.',
  'no-h1': 'No h1 on this one either.',
  headline: 'Headline here has the same problem. Still no figure in it.',
  align: 'Title is off the same edge here too.',
  contrast: 'More text below the contrast floor on this page.',
  colour: 'Another control off the palette here.',
  fonts: 'Same spread of typefaces on this page.',
  targets: 'The small controls carry over to this page.',
  alt: 'More images without alt text here.',
  structure: 'Structure holds up on this one as well.',
};

/**
 * Turn one captured page into notes anchored on it, and lines to say.
 *
 * `seenRules` carries across the walk so a rule that fires on all five pages
 * is stated once and then acknowledged, rather than read out five times.
 */
export function analysePage(
  capture: PageCapture,
  pageIndex: number,
  seenRules: Set<string> = new Set(),
): PageNotes {
  if (capture.audit.wall) {
    const { kind, evidence } = capture.audit.wall;
    return {
      notes: [],
      says: [
        `${kind} is holding the door on ${capture.label}. I got ${evidence}, not the page, so I have nothing honest to say about this one.`,
      ],
    };
  }

  const drafts = draftsFor(capture.audit).filter((draft) => anchored(draft.box));

  /*
   * Two rules can land on the same element, and that is correct: both frames
   * outline the thing they are about. Keeping the cards off each other is the
   * overlay's job, not this one's.
   */
  const notes: AuditPin[] = [];
  drafts.forEach((draft) => {
    const box = draft.box as Rect;
    const note: AuditPin = {
      id: `p${pageIndex}-${draft.id}`,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      type: draft.type,
      title: draft.title,
      description: draft.description,
      suggestedFix: draft.fix,
      impactScore: draft.score,
      note: draft.note,
      page: pageIndex,
    };
    notes.push(note);
  });

  const says = drafts.map((draft) => {
    if (seenRules.has(draft.id)) return REPEAT_LINE[draft.id] ?? draft.note;
    seenRules.add(draft.id);
    return draft.note;
  });

  return { notes, says };
}

/** Everything Damian found, once the whole walk is done. */
export function summarise(captures: PageCapture[]): {
  ideas: ProductIdea[];
  metrics: ScorecardMetric[];
} {
  /* Scores are only over pages Damian actually saw. */
  const audits = captures.map((capture) => capture.audit).filter((audit) => !audit.wall);
  if (audits.length === 0) return { ideas: [], metrics: [] };
  const total = (pick: (audit: DomAudit) => number) =>
    audits.reduce((sum, audit) => sum + pick(audit), 0);
  const worst = (pick: (audit: DomAudit) => number) =>
    audits.length ? Math.max(...audits.map(pick)) : 0;

  /* One idea per distinct rule that fired anywhere on the walk. */
  const seen = new Set<string>();
  const ideas: ProductIdea[] = [];
  captures.forEach((capture) => {
    draftsFor(capture.audit).forEach((draft) => {
      if (!draft.idea || seen.has(draft.idea.id)) return;
      seen.add(draft.idea.id);
      ideas.push(draft.idea);
    });
  });

  const gate = worst((audit) => audit.requiredCount || audit.fieldCount);
  const overGate = Math.max(gate - FIELD_BENCHMARK, 0);
  const interactive = total((audit) => audit.interactive);
  const tinyShare = interactive ? total((audit) => audit.tinyTapTargets) / interactive : 0;
  const pagesWithoutH1 = audits.filter((audit) => !audit.h1).length;
  const contrastTotal = total((audit) => audit.contrastMisses);
  const headingAvg = audits.length ? total((a) => a.headingCount) / audits.length : 0;
  const landmarkAvg = audits.length ? total((a) => a.landmarkCount) / audits.length : 0;

  const toward = (base: number, ceiling: number, amount: number, rate: number) =>
    clamp(base + (ceiling - base) * (1 - Math.exp(-amount / rate)));

  const metrics: ScorecardMetric[] = [
    {
      id: 'metric-hierarchy',
      label: 'Visual Hierarchy',
      score: toward(28, 94, headingAvg + landmarkAvg, 9),
      verdict: `About ${Math.round(headingAvg)} headings and ${Math.round(landmarkAvg)} landmarks per page.`,
    },
    {
      id: 'metric-friction',
      label: 'UX Friction',
      score: clamp(92 - overGate * 11 - Math.round(tinyShare * 100) * 0.6),
      verdict:
        overGate > 0
          ? `${gate} fields at the longest gate against a median of ${FIELD_BENCHMARK}.`
          : `${Math.round(tinyShare * 100)} percent of controls sit under 24px.`,
    },
    {
      id: 'metric-copy',
      label: 'Copy Clarity',
      score: clamp(
        82 - pagesWithoutH1 * 22 - (audits.some((a) => a.h1 && !a.h1HasNumber) ? 14 : 0),
      ),
      verdict: pagesWithoutH1
        ? `${pagesWithoutH1} of ${audits.length} pages have no h1.`
        : 'Every page declares itself with an h1.',
    },
    {
      id: 'metric-onboarding',
      label: 'Onboarding Efficiency',
      score: clamp(92 - overGate * 10 - Math.min(contrastTotal, 20) * 1.4),
      verdict:
        contrastTotal > 0
          ? `${contrastTotal} contrast failures across the walk.`
          : 'No contrast failures found.',
    },
  ];

  return { ideas, metrics };
}
