import assert from 'node:assert/strict';
import { toRect } from './judge.ts';

/**
 * The one thing here that fails silently.
 *
 * The model answers in pixels from the top left because that is what it can
 * see. The overlay draws from a centre point in percentages. Get the
 * conversion wrong and every box still renders, just in the wrong place, which
 * looks like a bad model rather than bad arithmetic.
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

console.log('toRect: ok');
