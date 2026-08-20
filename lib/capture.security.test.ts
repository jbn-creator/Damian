import assert from 'node:assert/strict';
import { assertPublicHttpUrl, forbiddenAddress, mayReceiveCredentials } from './capture.ts';

/**
 * The three ways the old guard could be walked past, and the door that must
 * never open.
 *
 * The old guard matched strings, so a public hostname with an A record
 * pointing at 127.0.0.1 sailed through, an IPv6 loopback spelled longhand
 * sailed through, and a mapped IPv4 sailed through. Each of those is a
 * request forgery primitive on a hosted deployment, and Damian returns
 * screenshots, which makes it a *readable* one.
 *
 * Run with: node lib/capture.security.test.ts
 * Needs the network: the resolve-then-validate cases do real DNS lookups.
 */

/* Literal addresses, every coat they wear. */
assert.equal(forbiddenAddress('127.0.0.1'), true);
assert.equal(forbiddenAddress('127.8.9.10'), true);
assert.equal(forbiddenAddress('10.1.2.3'), true);
assert.equal(forbiddenAddress('172.16.0.9'), true);
assert.equal(forbiddenAddress('192.168.1.1'), true);
assert.equal(forbiddenAddress('169.254.169.254'), true); // cloud metadata
assert.equal(forbiddenAddress('100.64.0.1'), true); // carrier NAT
assert.equal(forbiddenAddress('0.0.0.0'), true);
assert.equal(forbiddenAddress('::1'), true);
assert.equal(forbiddenAddress('::'), true);
assert.equal(forbiddenAddress('0:0:0:0:0:0:0:1'), true); // longhand loopback
assert.equal(forbiddenAddress('::ffff:127.0.0.1'), true); // IPv4-mapped
assert.equal(forbiddenAddress('::ffff:10.0.0.1'), true);
assert.equal(forbiddenAddress('64:ff9b::7f00:1'), true); // NAT64-embedded loopback
assert.equal(forbiddenAddress('fd12:3456::1'), true); // unique local
assert.equal(forbiddenAddress('fe80::1'), true); // link local
assert.equal(forbiddenAddress('fe80::1%en0'), true); // zoned link local
assert.equal(forbiddenAddress('not-an-ip'), true); // unparseable: refuse

/* Public addresses stay open. */
assert.equal(forbiddenAddress('8.8.8.8'), false);
assert.equal(forbiddenAddress('2606:4700::1111'), false);

/* Who may receive the target's credentials: subdomains either way, nobody else. */
assert.equal(mayReceiveCredentials('basecamp.com', 'basecamp.com'), true);
assert.equal(mayReceiveCredentials('auth.basecamp.com', 'basecamp.com'), true);
assert.equal(mayReceiveCredentials('basecamp.com', 'www.basecamp.com'), true);
assert.equal(mayReceiveCredentials('launchpad.37signals.com', 'basecamp.com'), false);
assert.equal(mayReceiveCredentials('evil-basecamp.com', 'basecamp.com'), false);
assert.equal(mayReceiveCredentials('basecamp.com.evil.io', 'basecamp.com'), false);
assert.equal(mayReceiveCredentials('', 'basecamp.com'), false);

/* The guard proper. Refusals must throw; a real site must not. */
const refuses = async (url: string, label: string) => {
  try {
    await assertPublicHttpUrl(url);
  } catch {
    console.log(`refused  ${label}: ${url}`);
    return;
  }
  throw new Error(`ALLOWED, must refuse: ${label}: ${url}`);
};

/* Name-based and literal forms. */
await refuses('http://localhost:3000', 'localhost by name');
await refuses('http://127.0.0.1', 'loopback literal');
await refuses('http://[::1]/', 'IPv6 loopback literal');
await refuses('http://[0:0:0:0:0:0:0:1]/', 'IPv6 loopback longhand');
await refuses('http://[::ffff:127.0.0.1]/', 'IPv4-mapped IPv6 loopback');
await refuses('http://10.0.0.8/admin', 'private range literal');
await refuses('http://169.254.169.254/latest/meta-data/', 'cloud metadata');

/*
 * The one the old guard could not see: a public hostname whose DNS answer is
 * loopback. localtest.me and nip.io both resolve to 127.0.0.1 by design.
 */
await refuses('http://localtest.me', 'public hostname resolving to 127.0.0.1');
await refuses('http://127.0.0.1.nip.io', 'wildcard DNS to loopback');

/* And a real public site still opens. */
const fine = await assertPublicHttpUrl('https://basecamp.com');
assert.equal(fine.hostname, 'basecamp.com');
console.log('allowed  standing target: https://basecamp.com');

console.log('capture security: ok');
