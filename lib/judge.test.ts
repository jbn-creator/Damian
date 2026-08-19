import assert from 'node:assert/strict';
import { toIdea, toNote, toRect } from './judge.ts';

/**
 * The two things here that fail silently.
 *
 * The model answers in pixels from the top left because that is what it can
 * see. The overlay draws from a centre point in percentages. Get the
 * conversion wrong and every box still renders, just in the wrong place, which
 * looks like a bad model rather than bad arithmetic.
 *
 * And the endpoint has a JSON mode but no schema enforcement, so the shape is
 * a request rather than a guarantee. A missing field has to end as no note,
 * not as a note reading "undefined" over somebody's landing page.
 *
 * Run with: node lib/judge.test.ts
 */

/* A 200 by 100 box at 320,180 in a 1440 by 900 frame. */
const rect = toRect({ x: 320, y: 180, w: 200, h: 100 });
assert.ok(rect);
assert.equal(Math.round(rect.w * 100) / 100, 13.89); // 200 / 1440
assert.equal(Math.round(rect.h * 100) / 100, 11.11); // 100 / 900
assert.equal(Math.round(rect.x * 100) / 100, 29.17); // centre 420 / 1440
assert.equal(Math.round(rect.y * 100) / 100, 25.56); // centre 230 / 900

/* Dead centre of the frame lands dead centre. */
const middle = toRect({ x: 620, y: 400, w: 200, h: 100 });
assert.ok(middle);
assert.equal(middle.x, 50);
assert.equal(middle.y, 50);

/* A box whose centre sits outside the frame cannot be pointed at. */
assert.equal(toRect({ x: 1430, y: 400, w: 200, h: 100 }), null);
assert.equal(toRect({ x: 100, y: -400, w: 200, h: 100 }), null);
assert.equal(toRect({ x: 100, y: 100, w: 0, h: 100 }), null);

/* Nothing sane comes out of nonsense. */
assert.equal(toRect(null), null);
assert.equal(toRect({ x: '620', y: 400, w: 200, h: 100 }), null);
assert.equal(toRect({ x: NaN, y: 400, w: 200, h: 100 }), null);

/*
 * Transport repair. The endpoint's JSON mode was seen sending width and height
 * where the brief said w and h, and dropping a key name so its value glues
 * into the next key. Both carry the model's own numbers, so both are read.
 */
const renamed = toRect({ x: 320, y: 180, width: 200, height: 100 });
assert.ok(renamed);
assert.deepEqual(renamed, rect); // identical to the well-formed 320,180 200x100 box

const glued = toRect({ x: 320, '180,"w': 200, h: 100 });
assert.ok(glued);
assert.deepEqual(glued, rect); // y recovered from the key, w from its value

/* Two missing fields is ambiguity, not repair material. */
assert.equal(toRect({ '180,"w': 200, h: 100 }), null);

/* Corner pairs, the third malformation seen live. Converted, not estimated. */
const cornered = toRect({ x: 320, y: 180, x2: 520, y2: 280 });
assert.ok(cornered);
assert.deepEqual(cornered, rect);

/* An inverted pair has negative width, which is nowhere honest to point. */
assert.equal(toRect({ x: 520, y: 180, x2: 320, y2: 280 }), null);

const whole = {
  kind: 'friction',
  box: { x: 620, y: 400, w: 200, h: 100 },
  title: 'Nothing says which to press',
  note: 'Three buttons up here are wearing the same weight.',
  why: 'The eye has no reason to land on one over another.',
  fix: 'Promote one and outline the rest.',
  score: 78,
};

const note = toNote(whole, 'p0-j0', 0);
assert.ok(note);
assert.equal(note.id, 'p0-j0');
assert.equal(note.type, 'friction');
assert.equal(note.impactScore, 78);
assert.equal(note.page, 0);

/* An unknown kind still has to render in one of the three token colours. */
assert.equal(toNote({ ...whole, kind: 'catastrophe' }, 'x', 0)?.type, 'warning');

/* A score off the scale is clamped rather than trusted. */
assert.equal(toNote({ ...whole, score: 900 }, 'x', 0)?.impactScore, 100);
assert.equal(toNote({ ...whole, score: -5 }, 'x', 0)?.impactScore, 0);
assert.equal(toNote({ ...whole, score: 'high' }, 'x', 0)?.impactScore, 50);

/* The optional halves fall back rather than reaching the card as undefined. */
const bare = toNote({ ...whole, why: undefined, fix: null }, 'x', 0);
assert.ok(bare);
assert.equal(bare.description, whole.note);
assert.ok(bare.suggestedFix.length > 0);

/* What a note cannot do without is something to say. */
assert.equal(toNote({ ...whole, note: '   ' }, 'x', 0), null);
assert.equal(toNote({ ...whole, title: 42 }, 'x', 0), null);
assert.equal(toNote('a note', 'x', 0), null);
assert.equal(toNote(null, 'x', 0), null);

/*
 * Text with nowhere to point degrades to a page-level note, never to nothing.
 * The old rule dropped these, which deleted one finding in four, and nothing
 * knew whether the deleted one was the best one.
 */
const unplaced = toNote({ ...whole, box: undefined }, 'x', 0);
assert.ok(unplaced);
assert.equal(unplaced.pageLevel, true);
assert.equal(unplaced.w, undefined); // no box means no frame, not a guessed one
assert.equal(unplaced.note, whole.note);

/* An anchored note is not page level, and says so by omission. */
assert.equal(note.pageLevel, undefined);

/*
 * Anchors. A rectangle the DOM measured is exact and one the model estimated is
 * not, so a named anchor has to win outright. If this ever inverts, every note
 * silently goes back to framing the neighbourhood of its subject.
 */
const measured = { x: 12, y: 34, w: 5, h: 6 };
const anchors = new Map([['headline', measured]]);

const byName = toNote({ ...whole, anchor: 'headline' }, 'x', 0, anchors);
assert.ok(byName);
assert.deepEqual({ x: byName.x, y: byName.y, w: byName.w, h: byName.h }, measured);

/* Even when the model also sent a box of its own, the measured one is used. */
const both = toNote({ ...whole, anchor: 'headline', box: { x: 0, y: 0, w: 1400, h: 880 } }, 'x', 0, anchors);
assert.deepEqual({ x: both?.x, y: both?.y }, { x: measured.x, y: measured.y });

/* An anchor nobody offered falls through to the estimate rather than vanishing. */
const invented = toNote({ ...whole, anchor: 'the vibe' }, 'x', 0, anchors);
assert.ok(invented);
assert.equal(invented.x, 50);
assert.equal(invented.pageLevel, undefined); // the model's own box still places it

/* A near-miss name still lands on the measured rectangle. */
const cased = toNote({ ...whole, anchor: '  HEADLINE ' }, 'x', 0, anchors);
assert.equal(cased?.x, measured.x);

/* No anchor and no box has nowhere to point, so it speaks at page level. */
const spoken = toNote({ ...whole, anchor: 'the vibe', box: undefined }, 'x', 0, anchors);
assert.equal(spoken?.pageLevel, true);

const idea = {
  category: 'missing_feature',
  title: 'Show which applications got replies',
  problem: 'Nothing on these pages tells a returning user what changed.',
  solution: 'Track reply state per application and surface it on the dashboard.',
  impact: 'High',
  effort: '1w',
};

const built = toIdea(idea, 'idea-j0');
assert.ok(built);
assert.equal(built.category, 'missing_feature');
assert.equal(built.impact, 'High');
assert.equal(built.description, idea.problem); // the card reads problem as description
assert.equal(built.effort, '1w');

/* Categories and impacts drive grouping and colour, so neither may be freeform. */
assert.equal(toIdea({ ...idea, category: 'growth_hack' }, 'x')?.category, 'missing_feature');
assert.equal(toIdea({ ...idea, impact: 'Huge' }, 'x')?.impact, 'Medium');
assert.equal(toIdea({ ...idea, effort: undefined }, 'x')?.effort, '1d');

/* An idea with no problem or no solution is half an idea, so it is dropped. */
assert.equal(toIdea({ ...idea, problem: '' }, 'x'), null);
assert.equal(toIdea({ ...idea, solution: null }, 'x'), null);
assert.equal(toIdea({ ...idea, title: undefined }, 'x'), null);
assert.equal(toIdea(null, 'x'), null);

console.log('judge: ok');
