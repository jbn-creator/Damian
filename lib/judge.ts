import Anthropic from '@anthropic-ai/sdk';
import type { DomAudit, PageCapture, Rect } from './capture';
import type { AuditPin } from './types';
import type { PageNotes } from './findings';

/**
 * Damian's judgement.
 *
 * The rule engine in findings.ts can only report what it can count, and what
 * matters most about a page is not countable. Whether a palette coheres,
 * whether a layout reads as generated, whether a call to action is actually
 * clear, whether a claim would land harder as a figure: those are all the same
 * kind of question, and no amount of hand written rules answers any of them.
 *
 * So the page is handed to a vision model, along with every measurement the
 * DOM pass already took. The model decides what is worth saying. Nothing here
 * enumerates findings for it, because a list of findings to look for is just
 * the rule engine again with extra steps.
 *
 * The measurements are passed in for one reason: they are the only numbers
 * Damian is allowed to quote. The model may say what it sees, but a figure has
 * to come from something that was actually measured.
 */

const MODEL = 'claude-opus-5';

/** The frame every capture is taken at, and the space boxes come back in. */
const FRAME_W = 1440;
const FRAME_H = 900;

const MAX_FINDINGS = 4;

/**
 * What Damian is for.
 *
 * This is the whole brief, and it is deliberately about outcomes rather than
 * checks. It says who is watching, what they are afraid of, and what a finding
 * has to earn its place. What to look at is the model's call.
 */
const BRIEF = `You are Damian. You look at one screen of a real website and say what you would change, the way a senior product designer says it standing behind someone rather than the way an audit report writes it.

Who you are talking to: the person who built this and is about to show it to customers or investors. Their fear is that it looks generated, generic, or unconsidered, and that visitors will not do the thing the page is asking for.

What earns a note:
- Something a visitor would actually feel. Confusion about what to press, a claim they cannot believe, copy they cannot read, a path that dead ends.
- Something that reads as machine generated or template default rather than designed for this product. Say so plainly and say what gives it away.
- A theme that does not hold together. A colour, a corner radius, a shadow, a typeface, a density that belongs to a different page than the one it is on.
- A pattern broken so badly it is jarring, not a few pixels of drift. If you would have to measure it to notice, it does not go here.
- A place where structure is the problem rather than styling. A stack that should be a comparison, a wall of prose that should be three cards, an action buried where nobody scrolls.
- A place where a specific number, or motion on a specific element, would carry the point better than what is there now.

What does not earn a note:
- Anything a linter would catch. Missing alt attributes, heading order, near duplicate tokens.
- Sub pixel or few pixel drift of any kind.
- Restating what the screen obviously is.
- Praise, hedging, or a caveat about being unable to see something.

Numbers: you may only state a figure that appears in the measurements given to you. Never estimate a percentage, a conversion effect, a size, or a ratio yourself. If you have no measured figure, say the thing without one.

Voice: second person, present tense, about three lines per note, no em dashes, no en dashes, no double hyphens, no lists inside a note. Say the problem and what you would do about it. Do not name yourself.

Boxes: give the tightest rectangle around the element the note is about, in pixels of the ${FRAME_W} by ${FRAME_H} screenshot, origin top left. Box the element, not the section it sits in. A note whose box is a whole band of the page is a note nobody can act on.`;

const SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      description: `At most ${MAX_FINDINGS}, strongest first. Empty if this screen genuinely has nothing worth saying.`,
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['friction', 'warning', 'opportunity'],
            description:
              'friction when it costs the visitor something now, warning when it undermines trust or coherence, opportunity when the page is fine and could be better.',
          },
          box: {
            type: 'object',
            description: `Tightest rectangle around the element, in pixels of the ${FRAME_W} by ${FRAME_H} frame.`,
            properties: {
              x: { type: 'integer' },
              y: { type: 'integer' },
              w: { type: 'integer' },
              h: { type: 'integer' },
            },
            required: ['x', 'y', 'w', 'h'],
            additionalProperties: false,
          },
          note: {
            type: 'string',
            description: 'Spoken over the page. About three lines.',
          },
          title: { type: 'string', description: 'Six words at most.' },
          why: {
            type: 'string',
            description: 'The longer version, for when someone opens the note. Two or three sentences.',
          },
          fix: { type: 'string', description: 'One sentence. What you would actually do.' },
          score: {
            type: 'integer',
            description: 'How much this costs them, 0 to 100.',
          },
        },
        required: ['kind', 'box', 'note', 'title', 'why', 'fix', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
} as const;

interface Finding {
  kind: AuditPin['type'];
  box: { x: number; y: number; w: number; h: number };
  note: string;
  title: string;
  why: string;
  fix: string;
  score: number;
}

/**
 * The measured facts, as a list the model can quote from.
 *
 * Only what was actually found is included, so an absent line means the DOM
 * pass had nothing to say rather than that the value was zero.
 */
function digest(audit: DomAudit): string {
  const facts: string[] = [`Title: ${audit.title}`, `URL: ${audit.url}`];
  const say = (fact: string) => facts.push(fact);

  if (audit.h1) say(`Only h1: "${audit.h1}"${audit.h1HasNumber ? '' : ', contains no figure'}`);
  else say('No h1 on this page');
  if (audit.fieldCount) say(`Form fields visible: ${audit.fieldCount}, of which required: ${audit.requiredCount}`);
  if (audit.interactive) say(`Interactive controls: ${audit.interactive}, under 24px: ${audit.tinyTapTargets}`);
  if (audit.fontFamilies.length) say(`Typefaces rendering: ${audit.fontFamilies.join(', ')}`);
  if (audit.worstContrast)
    say(
      `Worst text contrast: ${audit.worstContrast.ratio} to 1 on "${audit.worstContrast.sample.slice(0, 40)}", and ${audit.contrastMisses} elements sit below 4.5`,
    );
  if (audit.smallText)
    say(`Smallest body copy: ${audit.smallText.size}px, and ${audit.smallText.share}% of body copy is under 14px`);
  if (audit.longLine) say(`Widest text measure: about ${audit.longLine.chars} characters per line`);
  if (audit.competingActions)
    say(`${audit.competingActions.count} controls above the fold carry within a tenth of the same visual weight`);
  if (audit.actionBelowFold) say('No substantial action on the first screen; the first filled button is below it');
  if (audit.mobileOverflow > 8)
    say(
      `At 390px wide the page overflows by ${audit.mobileOverflow}px${audit.mobileCulprit ? `, caused by a ${audit.mobileCulprit}` : ''}`,
    );
  if (audit.spacingBase)
    say(
      `Spacing follows a ${audit.spacingBase}px step ${Math.round(audit.spacingAdherence * 100)}% of the time`,
    );
  else if (audit.commonSpacings.length)
    say(`No spacing step holds; ${audit.spacingSpread} distinct values, commonest ${audit.commonSpacings.join('px, ')}px`);
  if (audit.colourOutlier)
    say(`One control is filled ${audit.colourOutlier.colour} while the dominant control fill is ${audit.colourOutlier.dominant}`);
  if (audit.typeNearDupe) say(`Both ${audit.typeNearDupe.a}px and ${audit.typeNearDupe.b}px carry real text`);
  if (audit.colourNearMiss) say(`${audit.colourNearMiss.a} and ${audit.colourNearMiss.b} are both in use and indistinguishable`);
  if (audit.images) say(`Visible images: ${audit.images}, without alt text: ${audit.imagesMissingAlt}`);

  return facts.join('\n');
}

/** Pixels of the captured frame to the percentage, centre origin, box the overlay wants. */
export function toRect(box: Finding['box']): Rect | null {
  const w = (box.w / FRAME_W) * 100;
  const h = (box.h / FRAME_H) * 100;
  const x = ((box.x + box.w / 2) / FRAME_W) * 100;
  const y = ((box.y + box.h / 2) / FRAME_H) * 100;
  /* A box the model placed outside the frame cannot be pointed at honestly. */
  if (!(w > 0 && h > 0) || x <= 0.5 || x >= 99.5 || y <= 0.5 || y >= 99.5) return null;
  return { x, y, w: Math.min(w, 96), h: Math.min(h, 96) };
}

/** Set once, so the key is read at call time rather than at import time. */
let client: Anthropic | null = null;

/** True when a model key is available, so callers know whether to expect judgement. */
export const canJudge = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * Look at one captured page and say what is worth saying about it.
 *
 * Returns null when there is no key, when the page is a bot wall, or when the
 * call fails, and the caller falls back to the measured rules. Judgement is an
 * upgrade to Damian, never a dependency of his.
 */
export async function judgePage(
  capture: PageCapture,
  pageIndex: number,
): Promise<PageNotes | null> {
  if (!canJudge() || capture.audit.wall) return null;

  const base64 = capture.screenshot.replace(/^data:image\/\w+;base64,/, '');
  if (!base64 || base64 === capture.screenshot) return null;

  client ??= new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: BRIEF,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            {
              type: 'text',
              text: `This is ${capture.label} at ${FRAME_W} by ${FRAME_H}.\n\nMeasured on this page, and the only figures you may quote:\n${digest(capture.audit)}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;

    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') return null;

    const { findings } = JSON.parse(text.text) as { findings: Finding[] };
    const notes: AuditPin[] = [];
    const says: string[] = [];

    findings.slice(0, MAX_FINDINGS).forEach((finding, order) => {
      const rect = toRect(finding.box);
      if (!rect) return;
      notes.push({
        id: `p${pageIndex}-j${order}`,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        type: finding.kind,
        title: finding.title,
        description: finding.why,
        suggestedFix: finding.fix,
        impactScore: Math.round(Math.min(Math.max(finding.score, 0), 100)),
        note: finding.note,
        page: pageIndex,
      });
      says.push(finding.note);
    });

    /* Nothing anchorable came back, so the measured rules are the better answer. */
    return notes.length ? { notes, says } : null;
  } catch {
    return null;
  }
}
