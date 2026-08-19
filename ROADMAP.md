# Roadmap

Ordered by what would change your mind fastest, not by what is most fun to build.

---

## Phase 0 — Run the model path once ✅ DONE 2026-08-19

The model path was verified working: four calls, all HTTP 200, 20,795 tokens,
$0.043 for three pages. `glm-5v-turbo` looked at real pages and returned real
findings. The earlier claim that it had never run was wrong.

It was unanswerable either way because nothing in the repo logged anything.
`trace()` in `lib/judge.ts` is the durable outcome — nine call sites covering every
path that previously returned `null` in silence.

**Still outstanding from this phase:** the blind comparison. Same site, rule-only
output versus rule+judgement, labels stripped, handed to one builder. That is the
thesis test and it has not been run.

---

## Phase 1 — Recover the discarded quarter ✅ DONE 2026-08-19

The evidence run said the inferred cause was wrong: zero anchor near misses. The
model mangles boxes in transit — dropped key names, width/height for w/h, corner
pairs — three shapes across runs. Unambiguous transport damage is repaired, anchor
lookup is normalised, and text with no box degrades to a page-level note. Verified:
19 back / 18 usable / 0 dropped where the same site lost 11 of 19 before.

`toNote` drops one finding in four. Deterministic: 4 back / 3 usable, three times,
across structurally different pages. The walk call kept 5 of 5 because `toIdea`
validates text only. **The loss is entirely rect resolution.**

1. Log the rejected anchor string and whether a box came with it. Two lines. Names
   the cause instead of inferring it.
2. Normalise anchor lookup — `.trim().toLowerCase()` — which catches near misses.
3. **Findings with text but no box become page-level notes**, spoken without the
   dim-and-frame treatment. See the reversed rule in CLAUDE.md.

Step 3 is the one that matters. Normalisation fixes near misses; the degrade path
fixes the category. And nothing currently knows whether the discarded finding was
the *best* one — if the model leads with its most specific observation, the
validator may be deleting the sharpest thing it says, every single time.

**Exit:** usable findings per page rises from 3 toward 4, and every remaining drop
is logged with a named cause.

---

## Phase 2 — Survive the walk ✅ DONE 2026-08-19

Judge calls fire at capture and narrate strictly in order; travel replays from a
buffer so nothing on screen is ahead of the narration. A soft deadline under
maxDuration ends every path in a real done event — forced to 45s it produced five
pages of measured notes, not a blank error. Two judge calls in flight at most: the
endpoint serves one per key and five at once starved the tail into its own timeout.
Measured on the same five pages: 275s serial, 175–198s pipelined. maxDuration stays.

Three pages spent 90.5s in the model. Five pages ≈ 150s, plus crawl (~50s), plus
the reading dwells — which the **server** holds, so they are inside the same budget:
15 notes at ~4s is another ~57s. That lands at 260–290s against a `maxDuration` of
300s.

**The default run is five pages. This is not a bigger-site problem, it is the next
slow site.** And the failure is total: the route dies mid-walk with no `done` event,
the client shows a generic error, and the user loses the pages that already
succeeded.

1. **Emit `done` on every error path**, always. A timeout must degrade to a partial
   run, never a blank failure. Do this first — it is the safety net for everything
   else.
2. **Fire each page's judge the moment that page is captured.** Narrate in strict
   order as they resolve. Model latency leaves the serial path entirely and the
   viewer never sees anything out of order.
3. Raise `maxDuration` only after 1 and 2. Raising it first buys headroom and hides
   the problem.

**Exit:** a five-page walk on a slow site completes, and a forced timeout produces a
partial run with a `done` event rather than an error screen.

---

## Phase 3 — Provenance on screen ✅ DONE 2026-08-19

Every note and idea carries measured or judged from construction to the interface.
When the model was expected and did not answer, the feed says so. The receipt —
real token counts, dollars at an env-overridable rate — is spoken at the end of
the walk and rides the done event.

Every finding carries `measured` or `judged` through to the UI. Roughly three lines,
and it is what stops "did the model actually run" from ever being asked again.

While in here: cost per run, read from real token usage, surfaced at the end of the
walk. The receipt exists in `judge.log` already — put it where the user can see it.

**Exit:** you can tell which brain wrote a note by looking at it.

---

## Phase 4 — Close the credential hole

Ranked by what a bad outcome costs, not by how hard it looks.

**First, alone, today: login form origin.** Every other hole costs money or
embarrassment. This one takes a real password and types it into a third party's form
because a "Sign in" link pointed off-site. That is credential exfiltration with
Damian as the vector. Assert the password field's document origin matches the target
before typing; abort loudly otherwise.

**Then the SSRF cluster.** DNS-resolution bypass, IPv6 (only literal `::1` blocked —
mapped, longhand and private-range forms all pass), redirects unchecked, route
unauthenticated. Individually these read as scoping bugs. Together, plus the fact
that **Damian returns screenshots to the caller**, they compose into a hosted
readable SSRF: point it at a hostname resolving to a cloud metadata endpoint and it
renders IAM credentials as a PNG.

Fix structurally, not with more string matching: resolve the hostname, validate the
resolved IP, re-validate on every redirect hop.

**Already handled correctly:** prompt injection is bounded by validation — worst case
is misleading advice, not execution. Signed-in screens reaching the provider is a
disclosure question; add the consent line and it is fine.

**Exit:** "not deployable as is" is no longer true.

---

## Phase 5 — Goal mode

The mode parameter ships with `tour` as default and `goal` labelled honestly as new.

- Goal proposal call after the homepage capture: three goals that fit this site.
- Preset goals as specified in CLAUDE.md, each with a checkable success condition.
- `give_up` as a first-class outcome with a reason.
- Goal fills a slot in the brief. It is never concatenated onto the system prompt.
- Custom goals gated to registered users, normalised through a validator.

**Exit:** on ten varied sites, ≥7 either reach the goal or give up with a reason you
agree with. Log every failure; that is your regression corpus forever.

**Promote `goal` to default** once it clears that bar. Not before — a first-time
visitor should not land on the mode that sometimes produces nothing.

**Kill criterion:** if goal mode does not produce findings that feel meaningfully
sharper than tour findings, it is complexity for its own sake. Cut it and say so.

---

## Phase 6 — Capture the walk to video

Built before launch, exposed after.

Screencast frames already stream, and notes are already timed — subtitle timings
fall out of the pacing that exists. Pipe frames to ffmpeg alongside the live feed.

**Live stays primary.** It is the more convincing experience and the pacing work is
the most distinctive thing in the product. Video is the artifact that outlives the
session: shareable, embeddable, re-watchable, and it lets a run go async instead of
holding a tab open for 90 seconds.

**Gating:** founder-produced videos for the Reddit/HN launch; user-generated video
for registered accounts. Same build, different switch. Note the tradeoff honestly —
gating kills user-driven virality and keeps only founder-driven. That is a real cost
and a defensible call at this stage. Revisit if signup is not the bottleneck.

**Exit:** three videos shown to someone who has never seen the project. They wince at
least once without you explaining anything.

---

## Phase 7 — Accounts and persistence

Only now, because only now is there something worth keeping.

Auth, run history, per-run cost, domain ownership verification (DNS TXT or
`/.well-known/`). Verification unlocks form submission, the cancel-flow goal, and
authenticated runs on a hosted deployment.

Start with blob storage and one table. Postgres, Redis and a queue solve problems
this does not yet have.

---

## Phase 8 — Premium: findings to pull requests

Do **not** give an agent the repo. That is expensive, slow, and will blow the
context window exploring a codebase to fix a two-line CSS change.

The bounded shape: one validated finding, plus the single file the element lives in,
fetched by path. Ask for a diff of that file only. No exploration, no repo walk,
input size known in advance.

- Free tier gets a copy-pasteable snippet where the fix is mechanical. Near-zero
  cost, most of the benefit.
- Premium adds a GitHub App that opens the PR: the diff, before/after screenshots,
  and a link to the moment in the walk where the problem appears.
- Never push to a default branch. Ever.
- Be openly honest about the supported surface. Start with well-structured
  React/Next codebases and say so rather than failing quietly on everything else.

**Exit:** a PR merged by someone who is not you.

---

## Parked

Not now. Kept because they are cheap once goal mode exists.

- Personas as constraint bundles: impatient 3G mobile, low vision at 200% zoom,
  screen-reader only, non-native speaker, price-comparing skeptic. Five real ones
  beat twenty shallow ones.
- Chaos matrix: 320px, JS off, auto-translate to German (text expansion breaks more
  layouts than anything else on this list), RTL, 40-char surnames, double-submit,
  back button mid-checkout.
- Set-piece states: empty account, 10k-item account, network failure mid-save.
- Competitor side-by-side: same goal, four sites, timed.
- Analytics integration: quant finds where, Damian explains why.
- Per-PR UX diff on the user's own repo.

---

## Kill criteria

Written now, while it is going well, so they are honest later.

- **The blind comparison fails** if a builder cannot tell the rule-only output from
  the rule+judgement output, or prefers the rules. The measured/judged split is the
  entire thesis. If judgement adds nothing, Damian is a very good linter with a
  beautiful front end — a real product, but a different one, and you should know
  which you are building. Fix `prompts/` and retest before concluding.
- **Phase 5 fails** if goal findings do not beat tour findings.
- **Phase 6 fails** if nobody shares a teardown unprompted.
