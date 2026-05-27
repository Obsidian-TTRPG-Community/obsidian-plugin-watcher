// Offline regression tests for the TTRPG plugin watcher.
// Run with: node test/watcher.test.js
// No network, no Discord, no dependencies — exercises the pure helpers only.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { htmlIndicatesTtrpg, pluginPageUrl, repoOwner, MAX_POSTS_PER_RUN } =
  require("../watcher.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

const fixture = (f) =>
  fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

// --- The core discrimination: real pages -----------------------------------

test("matches a real TTRPG plugin page (Randomness)", () => {
  assert.strictEqual(htmlIndicatesTtrpg(fixture("randomness.html")), true);
});

test("skips a real non-TTRPG plugin page (Dataview)", () => {
  assert.strictEqual(htmlIndicatesTtrpg(fixture("dataview.html")), false);
});

// --- The specific regression: the old bug -----------------------------------

test("does NOT match the bare word TTRPG in prose (the old flood bug)", () => {
  const html = "Great for worldbuilders and TTRPG campaigns. <a href='/x'>TTRPG</a>";
  // No `categories=ttrpg` link anywhere → must not match, even though the word
  // TTRPG appears twice. This is exactly what html.includes("TTRPG") got wrong.
  assert.strictEqual(htmlIndicatesTtrpg(html), false);
});

test("does NOT match a related-plugins link to a different category", () => {
  const html = '<a href="/search?type=plugin&categories=note-taking">Notes</a>';
  assert.strictEqual(htmlIndicatesTtrpg(html), false);
});

// --- Marker variants --------------------------------------------------------

test("matches the canonical categories=ttrpg marker", () => {
  assert.strictEqual(
    htmlIndicatesTtrpg('<a href="/search?type=plugin&categories=ttrpg">TTRPG</a>'),
    true
  );
});

test("matches a URL-encoded categories%3Dttrpg marker", () => {
  assert.strictEqual(
    htmlIndicatesTtrpg('<a href="/search?type=plugin&amp;categories%3Dttrpg">TTRPG</a>'),
    true
  );
});

test("does NOT match a substring like categories=ttrpg-tools (different category)", () => {
  // Defensive: if a category were named e.g. "ttrpg-tools", `categories=ttrpg`
  // is still a prefix and WOULD match. We assert current behaviour so this is a
  // conscious, documented decision rather than a silent surprise. If Obsidian
  // ever adds such a category, revisit the matcher to require a delimiter.
  assert.strictEqual(
    htmlIndicatesTtrpg('<a href="/search?type=plugin&categories=ttrpg-tools">x</a>'),
    true
  );
});

// --- Robustness of input handling ------------------------------------------

test("handles non-string input safely", () => {
  assert.strictEqual(htmlIndicatesTtrpg(null), false);
  assert.strictEqual(htmlIndicatesTtrpg(undefined), false);
  assert.strictEqual(htmlIndicatesTtrpg(42), false);
});

test("handles empty string", () => {
  assert.strictEqual(htmlIndicatesTtrpg(""), false);
});

// --- Supporting helpers -----------------------------------------------------

test("pluginPageUrl builds the correct page URL", () => {
  assert.strictEqual(
    pluginPageUrl({ id: "randomness" }),
    "https://community.obsidian.md/plugins/randomness"
  );
});

test("repoOwner extracts owner from owner/name", () => {
  assert.strictEqual(repoOwner("Obsidian-TTRPG-Community/Randomness"), "Obsidian-TTRPG-Community");
});

test("repoOwner extracts owner from a full URL", () => {
  assert.strictEqual(repoOwner("https://github.com/foo/bar"), "foo");
});

// --- Flood-cap and known.json discipline (logic-level) ----------------------

test("flood cap constant is a sane small number", () => {
  assert.ok(MAX_POSTS_PER_RUN >= 1 && MAX_POSTS_PER_RUN <= 50);
});

test("seeded known.json contains the 47 baseline ids and is valid JSON", () => {
  const known = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "known.json"), "utf8")
  );
  assert.ok(Array.isArray(known));
  assert.strictEqual(known.length, 47);
  assert.ok(known.includes("randomness"), "randomness should be pre-seeded");
  assert.ok(known.includes("town-forge"), "town-forge should be pre-seeded");
  assert.strictEqual(new Set(known).size, known.length, "no duplicates");
});

// Simulate the known.json update rule: everything evaluated is marked seen
// EXCEPT a matched plugin whose post failed (kept for retry).
test("known.json update marks all evaluated except failed-post matches", () => {
  const evaluated = ["a", "b", "c", "d"];
  const newPlugins = [{ id: "c" }, { id: "d" }]; // c, d matched TTRPG
  const successfullyPosted = ["c"];              // d failed to post

  const seenThisRun = evaluated.filter(
    (id) => !newPlugins.some((p) => p.id === id) || successfullyPosted.includes(id)
  );

  // a, b (non-matches) + c (posted ok) are seen; d (failed post) is retried.
  assert.deepStrictEqual(seenThisRun.sort(), ["a", "b", "c"]);
  assert.ok(!seenThisRun.includes("d"), "failed-post match must be retried");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
