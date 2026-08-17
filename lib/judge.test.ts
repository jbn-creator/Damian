import assert from 'node:assert/strict';
import { toNote, toRect } from './judge.ts';

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

/* What a note cannot do without: somewhere to point, and something to say. */
assert.equal(toNote({ ...whole, box: undefined }, 'x', 0), null);
assert.equal(toNote({ ...whole, note: '   ' }, 'x', 0), null);
assert.equal(toNote({ ...whole, title: 42 }, 'x', 0), null);
assert.equal(toNote('a note', 'x', 0), null);
assert.equal(toNote(null, 'x', 0), null);

console.log('judge: ok');
