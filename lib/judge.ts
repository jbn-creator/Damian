import { appendFileSync } from 'node:fs';
import type { DomAudit, PageCapture, Rect } from './capture';
import type { AuditPin, ProductIdea } from './types';
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
 * Say what the model did, out loud and on disk.
 *
 * Every failure in here used to return null in silence, which meant a run that
 * fell back to the measured rules looked exactly like a run that did not, and
 * the question of whether the model had ever answered had no answer anywhere.
 * The console line is for whoever is watching the dev server. The file is so
 * the question can still be settled after the run has scrolled away.
 */
function trace(line: string) {
  const stamped = `${new Date().toISOString()} judge: ${line}`;
  console.warn(stamped);
  /* A read only filesystem is not a reason to take the walk down. */
  try {
    appendFileSync('judge.log', `${stamped}\n`);
  } catch {
    /* the console line already went out */
  }
}

/**
 * What Damian is for.
 *
 * This is the whole brief, and it is deliberately about outcomes rather than
 * checks. It says who is watching, what they are afraid of, and what a finding
 * has to earn its place. What to look at is the model's call.
 */
const BRIEF = `You are Damian. You look at one screen of a real website and say what you would change, the way a senior product designer says it standing behind someone rather than the way an audit report writes it.

Who you are talking to: one person who built this themselves, on their own time, and needs people to like it enough to come back. Not an enterprise with a design team. Their fear is that it looks generated, generic, or unconsidered, and that visitors will pass through once and never return.

So the question behind every note is whether this screen earns a visitor's trust and gives them a reason to stay. Polish that no one would notice is not worth their evening.

What earns a note:
- Something a visitor would actually feel. Confusion about what to press, a claim they cannot believe, copy they cannot read, a path that dead ends.
- Something that would make someone leave and not come back, or something small that would make them stay.
- Something that reads as machine generated or template default rather than designed for this product. Say so plainly and say what gives it away.
- A theme that does not hold together. A colour, a corner radius, a shadow, a typeface, a density that belongs to a different page than the one it is on.
- A pattern broken so badly it is jarring, not a few pixels of drift. If you would have to measure it to notice, it does not go here.
- A place where structure is the problem rather than styling. A stack that should be a comparison, a wall of prose that should be three cards, an action buried where nobody scrolls.
- A place where a specific number, or motion on a specific element, would carry the point better than what is there now.
- A specific interface element that would be better as something else. A dropdown of four options that should be four buttons, a date typed by hand that should be a picker, a table that should be cards on this width, a wall of fields that should be two steps, a state with nothing in it and nothing to do about that. Name the element and name what it should become.

What does not earn a note:
- Anything a linter would catch. Missing alt attributes, heading order, near duplicate tokens.
- Sub pixel or few pixel drift of any kind.
- Restating what the screen obviously is.
- Praise, hedging, or a caveat about being unable to see something.

Numbers: you may only state a figure that appears in the measurements given to you. Never estimate a percentage, a conversion effect, a size, or a ratio yourself. If you have no measured figure, say the thing without one.

Voice: second person, present tense, about three lines per note, no em dashes, no en dashes, no double hyphens, no lists inside a note. Say the problem and what you would do about it. Do not name yourself.

Reply with JSON only, in exactly this shape and nothing else:

{"findings":[{"kind":"friction","anchor":"headline","box":{"x":0,"y":0,"w":0,"h":0},"title":"","note":"","why":"","fix":"","score":0}]}

- findings: at most ${MAX_FINDINGS}, strongest first. Return an empty array if this screen genuinely has nothing worth saying.
- kind: "friction" when it costs the visitor something now, "warning" when it undermines trust or coherence, "opportunity" when the page is fine and could be better.
- anchor: when the note is about one of the measured elements listed below, give its name here and leave box out. Those rectangles were measured in the page, so they are exact and yours would not be.
- box: only when the note is about something that is not in that list. The tightest rectangle around the element, in pixels of the ${FRAME_W} by ${FRAME_H} screenshot, origin top left. Box the element, not the section it sits in. A note whose box is a whole band of the page is a note nobody can act on.
- title: six words at most.
- note: what you say over the page, about three lines.
- why: the longer version for when someone opens the note, two or three sentences.
- fix: one sentence, what you would actually do.
- score: how much this costs them, 0 to 100.`;

/**
 * Elements the DOM pass already has exact rectangles for.
 *
 * A vision model estimating a box by eye lands close and not on it, so a note
 * frames the neighbourhood of the thing rather than the thing. These are the
 * boxes measured in the page, offered by name. When a finding is about one of
 * them the model names it and the rectangle is used verbatim, which is exact by
 * construction. Estimating is the fallback, not the default.
 */
function anchorsFor(audit: DomAudit): Map<string, Rect> {
  const found = new Map<string, Rect>();
  const offer = (name: string, box: Rect | null | undefined) => {
    if (box && box.w > 0 && box.h > 0) found.set(name, box);
  };

  offer('headline', audit.h1Box);
  offer('form', audit.formBox);
  offer('competing-actions', audit.competingActions?.box);
  offer('first-real-button', audit.actionBelowFold?.box);
  offer('smallest-copy', audit.smallText?.box);
  offer('widest-text', audit.longLine?.box);
  offer('lowest-contrast-text', audit.worstContrast?.box);
  offer('off-palette-control', audit.colourOutlier?.box);
  offer('smallest-control', audit.tinyTapBox);
  offer('overflowing-element', audit.mobileCulpritBox);
  offer('image-without-alt', audit.missingAltBox);
  offer('main-content', audit.structureBox);

  return found;
}

/** Centre percentages back to the pixel rectangle the model is looking at. */
const asPixels = (box: Rect) =>
  `${Math.round(((box.x - box.w / 2) / 100) * FRAME_W)},${Math.round(((box.y - box.h / 2) / 100) * FRAME_H)} ${Math.round((box.w / 100) * FRAME_W)}x${Math.round((box.h / 100) * FRAME_H)}`;

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

  /*
   * The endpoint's JSON mode sometimes mangles a box on the way out. Two shapes,
   * both seen in one run of eleven rejections: keys named width and height
   * where the brief said w and h, and a dropped key name that glues its value
   * into the next key, so {"x":62,"y":588,"w":1290,"h":312} arrives as
   * {"x":62,"588,\"w":1290,"h":312}. In the second shape both numbers are still
   * present and the orphan is unambiguous when exactly one field is missing, so
   * this is transport repair rather than invention: every figure is the model's
   * own. Anything still short of four finite numbers is refused as before.
   */
  const fields: Record<string, unknown> = {};
  let orphan: number | null = null;
  for (const [key, value] of Object.entries(box as Record<string, unknown>)) {
    const glued = /^(\d+(?:\.\d+)?)\s*,\s*"?(x|y|w|h|width|height)$/.exec(key);
    if (glued) {
      orphan = Number(glued[1]);
      fields[glued[2]] = value;
    } else {
      fields[key] = value;
    }
  }
  fields.w ??= fields.width;
  fields.h ??= fields.height;
  /* A third shape seen live: corner pairs. x2 and y2 are the model's own
     numbers too, so the conversion invents nothing. */
  if (typeof fields.w !== 'number' && typeof fields.x === 'number' && typeof fields.x2 === 'number')
    fields.w = fields.x2 - fields.x;
  if (typeof fields.h !== 'number' && typeof fields.y === 'number' && typeof fields.y2 === 'number')
    fields.h = fields.y2 - fields.y;
  const missing = (['x', 'y', 'w', 'h'] as const).filter(
    (name) => typeof fields[name] !== 'number',
  );
  if (orphan !== null && missing.length === 1) fields[missing[0]] = orphan;

  const { x, y, w, h } = fields;
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
export function toNote(
  raw: unknown,
  id: string,
  page: number,
  anchors: Map<string, Rect> = new Map(),
): AuditPin | null {
  if (typeof raw !== 'object' || raw === null) {
    trace(`${id} rejected: not an object`);
    return null;
  }
  const finding = raw as Record<string, unknown>;

  /*
   * Every rejection names its branch, what the model actually sent, and what
   * this page had on offer. One finding in four dies in here and the cause has
   * only ever been inferred; a near miss must be visible as a near miss.
   */
  const rejected = (branch: string) => {
    trace(
      `${id} rejected: ${branch} :: anchor=${JSON.stringify(finding.anchor ?? null)}, box ${
        finding.box === undefined ? 'absent' : `sent ${JSON.stringify(finding.box)}`
      }, offered: ${[...anchors.keys()].join(', ') || 'none'}`,
    );
    return null;
  };

  /* Only a finding with nothing to say is nothing. */
  const note = line(finding.note, 400);
  const title = line(finding.title, 80);
  if (!note) return rejected('no note text');
  if (!title) return rejected('no title text');

  /*
   * A measured rectangle beats an estimated one every time, so the named
   * anchor wins and the model's own box is only read when it named nothing
   * that was actually offered. The name is normalised on the way in, so
   * "Main Content" still finds main-content.
   */
  const named =
    typeof finding.anchor === 'string'
      ? anchors.get(finding.anchor.trim().toLowerCase().replace(/\s+/g, '-'))
      : undefined;
  const rect = named ?? toRect(finding.box);

  /*
   * Text but nowhere to point degrades to a page-level note: spoken, listed,
   * but never framed, because a frame around nothing in particular is a lie
   * about precision. Losing the pointer is a formatting problem; losing the
   * judgement was a product problem, measured at one finding in four.
   */
  if (!rect) {
    trace(
      `${id} degraded to page level :: anchor=${JSON.stringify(finding.anchor ?? null)}, box ${
        finding.box === undefined ? 'absent' : `sent ${JSON.stringify(finding.box)}`
      }, offered: ${[...anchors.keys()].join(', ') || 'none'}`,
    );
  }

  const kind = finding.kind as AuditPin['type'];
  const score = typeof finding.score === 'number' && Number.isFinite(finding.score) ? finding.score : 50;

  return {
    id,
    x: rect?.x ?? 50,
    y: rect?.y ?? 50,
    w: rect?.w,
    h: rect?.h,
    ...(rect ? {} : { pageLevel: true }),
    type: KINDS.has(kind) ? kind : 'warning',
    title,
    description: line(finding.why, 600) ?? note,
    suggestedFix: line(finding.fix, 300) ?? 'No fix suggested.',
    impactScore: Math.round(Math.min(Math.max(score, 0), 100)),
    note,
    page,
    origin: 'judged',
  };
}

/** Models fence JSON even when told not to. Take the object, wherever it sits. */
function parseList(text: string, key: string): unknown[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return Array.isArray(parsed[key]) ? (parsed[key] as unknown[]) : [];
  } catch {
    return [];
  }
}

/**
 * What one run actually spent, counted from the endpoint's own usage figures.
 *
 * The receipt existed only in judge.log, which meant the person paying could
 * not see it. The route makes one of these per run, threads it through every
 * call, and puts the total on screen at the end of the walk.
 */
export interface Receipt {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export const newReceipt = (): Receipt => ({ calls: 0, promptTokens: 0, completionTokens: 0 });

/**
 * Tokens to dollars, at Z.ai's published rate for glm-5v-turbo:
 * $1.20 per million prompt tokens, $4.00 per million completion tokens.
 * Env-overridable because the rates belong to the provider, not this repo.
 *
 * Known overstatement: cached prompt tokens bill lower than fresh ones, and
 * this arithmetic charges every prompt token at the full rate. The receipt
 * therefore reads slightly high on cache-heavy walks. Token counts are exact.
 */
const USD_PER_M_PROMPT = Number(process.env.GLM_USD_PER_M_PROMPT ?? 1.2);
const USD_PER_M_COMPLETION = Number(process.env.GLM_USD_PER_M_COMPLETION ?? 4.0);

export const toUsd = (receipt: Receipt) =>
  (receipt.promptTokens * USD_PER_M_PROMPT + receipt.completionTokens * USD_PER_M_COMPLETION) /
  1_000_000;

/** One request to the endpoint. Returns the reply text, or null on any trouble. */
async function ask(
  system: string,
  content: unknown[],
  maxTokens: number,
  label: string,
  receipt?: Receipt,
): Promise<string | null> {
  const started = Date.now();
  const took = () => `${Date.now() - started}ms`;
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
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    });

    if (!response.ok) {
      trace(`${label} HTTP ${response.status} in ${took()} :: ${(await response.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: Record<string, number>;
    };
    const reply = body.choices?.[0]?.message?.content;
    if (typeof reply !== 'string') {
      trace(`${label} 200 in ${took()} but no text in the reply`);
      return null;
    }
    if (receipt) {
      receipt.calls += 1;
      receipt.promptTokens += body.usage?.prompt_tokens ?? 0;
      receipt.completionTokens += body.usage?.completion_tokens ?? 0;
    }
    trace(`${label} 200 in ${took()}, ${reply.length} chars, tokens ${JSON.stringify(body.usage ?? {})}`);
    return reply;
  } catch (error) {
    /* Overwhelmingly the 90s timeout, so name it rather than guessing later. */
    trace(`${label} ${(error as Error).name}: ${(error as Error).message} after ${took()}`);
    return null;
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
  receipt?: Receipt,
): Promise<PageNotes | null> {
  try {
    return await judgePageInner(capture, pageIndex, receipt);
  } catch (error) {
    /*
     * A crash in here is a fallback like any other, and a fallback that does
     * not say its own name cost two pages of judgement with no evidence of
     * why. Nothing in this file may fail silently, including this file.
     */
    trace(`page ${pageIndex} judge crashed: ${(error as Error).message}`);
    return null;
  }
}

async function judgePageInner(
  capture: PageCapture,
  pageIndex: number,
  receipt?: Receipt,
): Promise<PageNotes | null> {
  if (!canJudge()) {
    trace('no GLM_API_KEY, so every note on this walk is a measured one');
    return null;
  }
  /* The wall is said out loud by the rules, so it needs no line of its own. */
  if (capture.audit.wall) return null;
  /* Already a data URI from the capture, which is what image_url wants. */
  if (!capture.screenshot.startsWith('data:image/')) {
    trace(`page ${pageIndex} has no screenshot to look at`);
    return null;
  }

  const anchors = anchorsFor(capture.audit);
  const offered = [...anchors]
    .map(([name, box]) => `- ${name}: at ${asPixels(box)}`)
    .join('\n');

  const reply = await ask(
    BRIEF,
    [
      { type: 'image_url', image_url: { url: capture.screenshot } },
      {
        type: 'text',
        text: `This is ${capture.label} at ${FRAME_W} by ${FRAME_H}.

Measured elements you can name as an anchor, with where each one sits:
${offered || '- none measured on this page'}

Measured on this page, and the only figures you may quote:
${digest(capture.audit)}`,
      },
    ],
    4000,
    `page ${pageIndex} (${capture.label})`,
    receipt,
  );
  if (!reply) return null;

  /*
   * Held separately from the notes because the gap between them is the thing
   * worth knowing. Findings back but no notes out means the reply was fine and
   * this file threw it away, which reads from the outside as a useless model.
   */
  const raw = parseList(reply, 'findings');
  const notes = raw
    .slice(0, MAX_FINDINGS)
    .map((finding, order) => toNote(finding, `p${pageIndex}-j${order}`, pageIndex, anchors))
    .filter((note): note is AuditPin => note !== null);
  trace(`page ${pageIndex} ${raw.length} findings back, ${notes.length} usable`);

  /* Nothing usable came back, so the measured rules are the better answer. */
  return notes.length ? { notes, says: notes.map((note) => note.note as string) } : null;
}

/**
 * What this product should build, cut, or charge for.
 *
 * Separate from the per page notes on purpose. A note is about a screen; this
 * is about the product, and it needs to have seen the whole walk before it can
 * say anything worth hearing. It runs once, after the walk, so it costs one
 * call and slows nothing down.
 */
const PRODUCT_BRIEF = `You have just walked a whole product. You are advising the one person who built it, on their own time, and who needs users to like it enough to come back. Judge the product, not the pixels.

The question you are answering is: what should they build next, what should they stop building, and what would make someone choose this over the alternative and then keep using it.

Be willing to tell them to cut things. A solo builder's scarcest resource is evenings, and a feature that duplicates something users can already do elsewhere is worse than nothing, because it costs maintenance and dilutes what the product is for. If you see one, say so plainly, say why the alternative wins, and name what they should build with that time instead.

For example, an internship platform with a built in CV generator: people already write CVs in tools they trust, that feature will never be the reason anyone picks this, and the same effort spent on tracking which applications got replies would be. That is the shape of advice you are giving.

Bias toward the reasons people come back rather than the reasons they arrive once. What gets better the more they use it, what they would lose by leaving, what would make them tell someone else, what brings them back without an email. A single thing done well beats four half things.

Ground every recommendation in something actually on the pages you saw. Never propose a feature for a product this evidently is not. Never invent a figure, a user count, or a conversion number.

No em dashes, no en dashes, no double hyphens. Second person, plain speech.

Reply with JSON only, in exactly this shape and nothing else:

{"ideas":[{"category":"missing_feature","title":"","problem":"","solution":"","impact":"High","effort":"1d"}]}

- ideas: 3 to 6, most valuable first.
- category: "missing_feature" for something to build, "quick_win" for something to change or cut this week, "monetization" for where this could reasonably ask for money.
- title: eight words at most, an instruction rather than a topic.
- problem: what is true today and why it costs them users, two or three sentences, referring to what you saw.
- solution: what to do instead, concretely enough to start on tomorrow.
- impact: "High", "Medium" or "Low".
- effort: a rough span for one person, like "2h", "1d" or "1w".`;

const IMPACTS = new Set<ProductIdea['impact']>(['High', 'Medium', 'Low']);
const CATEGORIES = new Set<ProductIdea['category']>([
  'quick_win',
  'missing_feature',
  'monetization',
]);

/** Same defensive read as the notes: no schema is enforced, so nothing is trusted. */
export function toIdea(raw: unknown, id: string): ProductIdea | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const idea = raw as Record<string, unknown>;

  const title = line(idea.title, 90);
  const problem = line(idea.problem, 600);
  const solution = line(idea.solution, 600);
  if (!title || !problem || !solution) return null;

  const category = idea.category as ProductIdea['category'];
  const impact = idea.impact as ProductIdea['impact'];

  return {
    id,
    category: CATEGORIES.has(category) ? category : 'missing_feature',
    title,
    description: problem,
    solution,
    impact: IMPACTS.has(impact) ? impact : 'Medium',
    effort: line(idea.effort, 12) ?? '1d',
    origin: 'judged',
  };
}

/**
 * Ask what the product should become, having seen every page.
 *
 * Returns null when there is no key or nothing usable came back, and the caller
 * falls back to the measured quick wins.
 */
export async function judgeWalk(
  captures: PageCapture[],
  receipt?: Receipt,
): Promise<ProductIdea[] | null> {
  try {
    return await judgeWalkInner(captures, receipt);
  } catch (error) {
    /* Same rule as judgePage: no silent failures, including our own. */
    trace(`walk judge crashed: ${(error as Error).message}`);
    return null;
  }
}

async function judgeWalkInner(
  captures: PageCapture[],
  receipt?: Receipt,
): Promise<ProductIdea[] | null> {
  if (!canJudge()) return null;

  /* A gate is not the product, so a walled page tells us nothing about it. */
  const seen = captures.filter(
    (capture) => !capture.audit.wall && capture.screenshot.startsWith('data:image/'),
  );
  if (seen.length === 0) return null;

  const content: unknown[] = [];
  seen.forEach((capture) => {
    content.push({ type: 'image_url', image_url: { url: capture.screenshot } });
    content.push({
      type: 'text',
      text: `Above is ${capture.label} (${capture.audit.title}).\n${digest(capture.audit)}`,
    });
  });
  content.push({
    type: 'text',
    text: `That is ${seen.length} ${seen.length === 1 ? 'page' : 'pages'} of this product. Now say what they should build, cut, or charge for.`,
  });

  /* Every screenshot rides in this one request, so its size is worth naming. */
  const reply = await ask(
    PRODUCT_BRIEF,
    content,
    4000,
    `walk (${seen.length} pages, ${Math.round(JSON.stringify(content).length / 1024)}kb)`,
    receipt,
  );
  if (!reply) return null;

  const raw = parseList(reply, 'ideas');
  const ideas = raw
    .slice(0, 6)
    .map((idea, order) => toIdea(idea, `idea-j${order}`))
    .filter((idea): idea is ProductIdea => idea !== null);
  trace(`walk ${raw.length} ideas back, ${ideas.length} usable`);

  return ideas.length ? ideas : null;
}
