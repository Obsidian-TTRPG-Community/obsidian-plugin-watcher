const fs = require("fs");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

// Safety valve. A normal day adds 0-2 new TTRPG plugins. If a run ever decides
// more than this many plugins are "new", that is a bug by definition (e.g. a
// logic change that invalidates known.json, or a site-format change that breaks
// matching). Refuse to post, log loudly, and exit non-zero so the Actions run
// fails visibly instead of flooding Discord.
const MAX_POSTS_PER_RUN = 10;

const COMMUNITY_PLUGINS_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";

const KNOWN_PATH = "known.json";

// ---------------------------------------------------------------------------
// Pure helpers (no network, no fs) — these are what the test harness exercises.
// ---------------------------------------------------------------------------

function pluginPageUrl(plugin) {
  return `https://community.obsidian.md/plugins/${plugin.id}`;
}

function repoUrl(repo) {
  if (!repo) return "https://github.com/obsidianmd/obsidian-releases";
  if (repo.startsWith("http")) return repo;
  return `https://github.com/${repo}`;
}

function repoOwner(repo) {
  if (!repo) return "Unknown";
  if (repo.startsWith("http")) {
    try {
      const parts = new URL(repo).pathname.split("/");
      return parts[1] || "Unknown";
    } catch {
      return "Unknown";
    }
  }
  return repo.split("/")[0] || "Unknown";
}

// The precise category test. The community plugin page exposes each of the
// plugin's OWN categories as a link of the form:
//   /search?type=plugin&categories=<name>
// A plugin tagged TTRPG (and only such a plugin) emits a link whose query
// string contains `categories=ttrpg`. This is the discriminating marker.
//
// The old code also had `html.includes("TTRPG")`, which matched the word
// anywhere on the page (nav, related-plugins, breadcrumbs) and so matched
// essentially every page — that was the flood. We deliberately do NOT fall
// back to a loose word match: a false negative (missing one plugin) is a far
// better failure than a false positive (spamming the server).
//
// `categories=ttrpg` is sufficient on its own; the URL-encoded `categories%3Dttrpg`
// is included to be robust to encoded hrefs. We do not match the bare word.
function htmlIndicatesTtrpg(html) {
  if (typeof html !== "string") return false;
  return (
    html.includes("categories=ttrpg") ||
    html.includes("categories%3Dttrpg")
  );
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

async function isTtrpgPlugin(plugin) {
  let response;
  try {
    response = await fetch(pluginPageUrl(plugin));
  } catch (err) {
    console.log(`Could not fetch page for ${plugin.id}: ${err.message}`);
    return false;
  }

  if (!response.ok) {
    console.log(`Could not check category for ${plugin.id} (HTTP ${response.status})`);
    return false;
  }

  const html = await response.text();
  return htmlIndicatesTtrpg(html);
}

async function postToDiscord(plugin) {
  const description = (plugin.description || "No description").slice(0, 3900);

  const payload = {
    username: "Obsidian TTRPG Plugin Watcher",
    embeds: [
      {
        title: `New TTRPG Plugin Released: ${plugin.name || plugin.id}`,
        url: pluginPageUrl(plugin),
        description:
          `A new TTRPG-related plugin has been released to the Obsidian Community Plugins repo.\n\n` +
          `**${description}**`,
        color: 5814783,
        fields: [
          {
            name: "Community Plugin Page",
            value: `[Open Plugin Page](${pluginPageUrl(plugin)})`,
            inline: false
          },
          { name: "GitHub", value: repoOwner(plugin.repo), inline: true },
          { name: "Plugin ID", value: plugin.id || "Unknown", inline: true },
          {
            name: "GitHub Repository",
            value: `[View Source](${repoUrl(plugin.repo)})`,
            inline: false
          }
        ],
        footer: { text: "Detected from Obsidian Community Plugin releases" },
        timestamp: new Date().toISOString()
      }
    ]
  };

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Discord rejected ${plugin.id}: ${response.status} ${text}`);
    return false;
  }

  console.log(`Posted: ${plugin.name}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return true;
}

function loadKnown() {
  if (!fs.existsSync(KNOWN_PATH)) return [];
  return JSON.parse(fs.readFileSync(KNOWN_PATH, "utf8"));
}

function saveKnown(ids) {
  fs.writeFileSync(KNOWN_PATH, JSON.stringify(Array.from(new Set(ids)).sort(), null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!WEBHOOK_URL) {
    throw new Error("Missing DISCORD_WEBHOOK secret");
  }

  console.log("Fetching Obsidian community plugins...");
  const response = await fetch(COMMUNITY_PLUGINS_URL);
  const plugins = await response.json();

  const known = loadKnown();
  const knownIds = new Set(known);

  const candidates = plugins.filter((plugin) => !knownIds.has(plugin.id));
  console.log(`Unchecked plugins: ${candidates.length}`);

  // Evaluate every candidate. CRUCIAL CHANGE: we record EVERY candidate we
  // evaluate as "seen" — not only the ones we successfully posted. Previously,
  // only successfully-posted plugins were added to known.json, so every
  // non-match and every post-failure was re-evaluated on the next run, and a
  // first run after any logic change treated the whole back-catalogue as new.
  // That amplification is what turned a matching bug into a server flood.
  const evaluated = [];   // every candidate id we looked at this run
  const newPlugins = [];  // the subset that matched TTRPG

  for (const plugin of candidates) {
    const isTtrpg = await isTtrpgPlugin(plugin);
    evaluated.push(plugin.id);

    if (isTtrpg) {
      console.log(`TTRPG match: ${plugin.name}`);
      newPlugins.push(plugin);
    } else {
      console.log(`Skipped non-TTRPG plugin: ${plugin.name}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`New TTRPG plugins: ${newPlugins.length}`);

  // Flood cap. If an absurd number of plugins suddenly "match", treat it as a
  // bug, not a real event. Do NOT post, do NOT update known.json (so a real
  // fix can re-run cleanly), and fail the job so a human looks at it.
  if (newPlugins.length > MAX_POSTS_PER_RUN) {
    console.error(
      `ABORT: ${newPlugins.length} plugins matched TTRPG in one run, ` +
      `exceeding the cap of ${MAX_POSTS_PER_RUN}. This is almost certainly a ` +
      `bug (matching logic or known.json baseline), not ${newPlugins.length} ` +
      `genuine new releases. Refusing to post or update known.json.`
    );
    process.exit(1);
  }

  const successfullyPosted = [];
  for (const plugin of newPlugins) {
    console.log(`Posting: ${plugin.name}`);
    const ok = await postToDiscord(plugin);
    if (ok) successfullyPosted.push(plugin.id);
  }

  // Mark every evaluated plugin as seen. A matched plugin that failed to post
  // is intentionally NOT marked seen, so it will be retried next run (a missed
  // post is worth one retry); everything else is marked so it is never
  // re-evaluated. Net effect: a future false-positive misfires at most once on
  // a given plugin, never forever.
  const seenThisRun = evaluated.filter(
    (id) => !newPlugins.some((p) => p.id === id) || successfullyPosted.includes(id)
  );

  saveKnown([...known, ...seenThisRun]);
  console.log(`known.json updated (${seenThisRun.length} newly marked seen)`);
}

// Only run main() when executed directly, so the test harness can require()
// this file and exercise the pure helpers without triggering a real run.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  htmlIndicatesTtrpg,
  pluginPageUrl,
  repoUrl,
  repoOwner,
  MAX_POSTS_PER_RUN
};
