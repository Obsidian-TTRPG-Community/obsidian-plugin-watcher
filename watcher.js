const fs = require("fs");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

if (!WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK secret");
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

function communityPluginUrl(plugin) {
  return `https://community.obsidian.md/plugins/${plugin.id}`;
}

async function isTtrpgPlugin(plugin) {
  const response = await fetch(communityPluginUrl(plugin));

  if (!response.ok) {
    console.log(`Could not check category for ${plugin.id}`);
    return false;
  }

  const html = await response.text();

  return (
    html.includes("/plugins?categories=ttrpg") ||
    html.includes(">TTRPG<") ||
    html.includes("TTRPG")
  );
}

async function postToDiscord(plugin) {
  const description = (plugin.description || "No description").slice(0, 3900);

  const payload = {
    username: "Obsidian TTRPG Plugin Watcher",
    embeds: [
      {
        title: `New TTRPG Plugin Released: ${plugin.name || plugin.id}`,
        url: communityPluginUrl(plugin),
        description:
          `A new TTRPG-related plugin has been released to the Obsidian Community Plugins repo.\n\n` +
          `**${description}**`,
        color: 5814783,
        fields: [
          {
            name: "Community Plugin Page",
            value: `[Open Plugin Page](${communityPluginUrl(plugin)})`,
            inline: false
          },
          {
            name: "GitHub",
            value: repoOwner(plugin.repo),
            inline: true
          },
          {
            name: "Plugin ID",
            value: plugin.id || "Unknown",
            inline: true
          },
          {
            name: "GitHub Repository",
            value: `[View Source](${repoUrl(plugin.repo)})`,
            inline: false
          }
        ],
        footer: {
          text: "Detected from Obsidian Community Plugin releases"
        },
        timestamp: new Date().toISOString()
      }
    ]
  };

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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

async function main() {
  console.log("Fetching Obsidian community plugins...");

  const response = await fetch(
    "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
  );

  const plugins = await response.json();

  let known = [];

  if (fs.existsSync("known.json")) {
    known = JSON.parse(fs.readFileSync("known.json", "utf8"));
  }

  const knownIds = new Set(known);

  const candidates = plugins.filter((plugin) => !knownIds.has(plugin.id));

  console.log(`Unchecked plugins: ${candidates.length}`);

  const newPlugins = [];

  for (const plugin of candidates) {
    console.log(`Checking TTRPG category: ${plugin.name}`);

    const isTtrpg = await isTtrpgPlugin(plugin);

    if (isTtrpg) {
      console.log(`TTRPG match: ${plugin.name}`);
      newPlugins.push(plugin);
    } else {
      console.log(`Skipped non-TTRPG plugin: ${plugin.name}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`New TTRPG plugins: ${newPlugins.length}`);

  const successfullyPosted = [];

  for (const plugin of newPlugins) {
    console.log(`Posting: ${plugin.name}`);

    const ok = await postToDiscord(plugin);

    if (ok) {
      successfullyPosted.push(plugin.id);
    }
  }

  const updatedKnown = Array.from(
    new Set([...known, ...successfullyPosted])
  );

  fs.writeFileSync(
    "known.json",
    JSON.stringify(updatedKnown, null, 2)
  );

  console.log("known.json updated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
