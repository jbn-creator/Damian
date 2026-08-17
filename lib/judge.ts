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
 *
 * Any OpenAI shaped chat endpoint will do. It defaults to Z.ai because that is
 * what this runs on, and it has to be a model that can see: the questions above
 * are visual, so a text only model cannot answer them however capable it is.
 */

const ENDPOINT =
  process.env.GLM_BASE_URL?.replace(/\/$/, '') ?? 'https://api.z.ai/api/paas/v4';

/**
 * Vision, deliberately.
 *
 * glm-5.2 is the stronger reasoner but takes text only, so it would be judging
 * a description of the page rather than the page. Override if that changes.
 */
const MODEL = process.env.GLM_MODEL ?? 'glm-5v-turbo';

/** The frame every capture is taken at, and the space boxes come back in. */
const FRAME_W = 1440;
const FRAME_H = 900;

const MAX_FINDINGS = 4;
const TIMEOUT_MS = 90_000;

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

Reply with JSON only, in exactly this shape and nothing else:

{"findings":[{"kind":"friction","box":{"x":0,"y":0,"w":0,"h":0},"title":"","note":"","why":"","fix":"","score":0}]}

- findings: at most ${MAX_FINDINGS}, strongest first. Return an empty array if this screen genuinely has nothing worth saying.
- kind: "friction" when it costs the visitor something now, "warning" when it undermines trust or coherence, "opportunity" when the page is fine and could be better.
- box: the tightest rectangle around the element the note is about, in pixels of the ${FRAME_W} by ${FRAME_H} screenshot, origin top left. Box the element, not the section it sits in. A note whose box is a whole band of the page is a note nobody can act on.
- title: six words at most.
- note: what you say over the page, about three lines.
- why: the longer version for when someone opens the note, two or three sentences.
- fix: one sentence, what you would actually do.
- score: how much this costs them, 0 to 100.`;

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
    say(`Spacing follows a ${audit.spacingBase}px step ${Math.round(audit.spacingAdherence * 100)}% of the time`);
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
export function toRect(box: unknown): Rect | null {
  if (typeof box !== 'object' || box === null) return null;
  const { x, y, w, h } = box as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;

  const width = ((w as number) / FRAME_W) * 100;
  const height = ((h as number) / FRAME_H) * 100;
  const cx = (((x as number) + (w as number) / 2) / FRAME_W) * 100;
  const cy = (((y as number) + (h as number) / 2) / FRAME_H) * 100;

  /* A box the model placed outside the frame cannot be pointed at honestly. */
  if (!(width > 0 && height > 0)) return null;
  if (cx <= 0.5 || cx >= 99.5 || cy <= 0.5 || cy >= 99.5) return null;
  return { x: cx, y: cy, w: Math.min(width, 96), h: Math.min(height, 96) };
}

const KINDS = new Set<AuditPin['type']>(['friction', 'warning', 'opportunity']);

const line = (value: unknown, cap: number): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length ? text.slice(0, cap) : null;
};

/**
 * Turn one finding from the model into a note, or nothing.
 *
 * This endpoint has a JSON mode but no schema enforcement, so the shape is a
 * request rather than a guarantee and every field is checked here. A note that
 * arrives half formed is dropped rather than rendered half formed.
 */
export function toNote(raw: unknown, id: string, page: number): AuditPin | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const finding = raw as Record<string, unknown>;

  const rect = toRect(finding.box);
  if (!rect) return null;

  const note = line(finding.note, 400);
  const title = line(finding.title, 80);
  if (!note || !title) return null;

  const kind = finding.kind as AuditPin['type'];
  const score = typeof finding.score === 'number' && Number.isFinite(finding.score) ? finding.score : 50;

  return {
    id,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    type: KINDS.has(kind) ? kind : 'warning',
    title,
    description: line(finding.why, 600) ?? note,
    suggestedFix: line(finding.fix, 300) ?? 'No fix suggested.',
    impactScore: Math.round(Math.min(Math.max(score, 0), 100)),
    note,
    page,
  };
}

/** Models fence JSON even when told not to. Take the object, wherever it sits. */
function parseFindings(text: string): unknown[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const { findings } = JSON.parse(text.slice(start, end + 1)) as { findings?: unknown };
    return Array.isArray(findings) ? findings : [];
  } catch {
    return [];
  }
}

/** True when a key is available, so callers know whether to expect judgement. */
export const canJudge = () => Boolean(process.env.GLM_API_KEY);

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
  /* Already a data URI from the capture, which is what image_url wants. */
  if (!capture.screenshot.startsWith('data:image/')) return null;

  try {
    const response = await fetch(`${ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.GLM_API_KEY}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: BRIEF },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: capture.screenshot } },
              {
                type: 'text',
                text: `This is ${capture.label} at ${FRAME_W} by ${FRAME_H}.\n\nMeasured on this page, and the only figures you may quote:\n${digest(capture.audit)}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const notes = parseFindings(content)
      .slice(0, MAX_FINDINGS)
      .map((finding, order) => toNote(finding, `p${pageIndex}-j${order}`, pageIndex))
      .filter((note): note is AuditPin => note !== null);

    /* Nothing usable came back, so the measured rules are the better answer. */
    return notes.length ? { notes, says: notes.map((note) => note.note as string) } : null;
  } catch {
    return null;
  }
}
