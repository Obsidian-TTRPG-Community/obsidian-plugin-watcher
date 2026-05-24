const fs = require("fs");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

if (!WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK secret");
}

const KEYWORDS = [
  "ttrpg",
  "rpg",
  "dice",
  "generator",
  "map",
  "fantasy",
  "initiative",
  "statblock",
  "world",
  "campaign",
  "pf2e",
  "dnd",
  "5e",
  "solo"
];

function repoUrl(repo) {
  if (!repo) {
    return "https://github.com/obsidianmd/obsidian-releases";
  }

  if (repo.startsWith("http")) {
    return repo;
  }

  return `https://github.com/${repo}`;
}

function communityPluginUrl(plugin) {
  return `https://community.obsidian.md/plugins/${plugin.id}`;
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
            name: "Author",
            value: plugin.author || "Unknown",
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

    console.error(
      `Discord rejected ${plugin.id}: ${response.status} ${text}`
    );

    return false;
  }

  console.log(`Posted: ${plugin.name}`);

  // Prevent Discord rate limits
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
    known = JSON.parse(
      fs.readFileSync("known.json", "utf8")
    );
  }

  const knownIds = new Set(known);

  const matches = plugins.filter((plugin) => {
    const text =
      `${plugin.name || ""} ` +
      `${plugin.description || ""} ` +
      `${plugin.id || ""}`.toLowerCase();

    return KEYWORDS.some((keyword) =>
      text.includes(keyword)
    );
  });

  const newPlugins = matches.filter(
    (plugin) => !knownIds.has(plugin.id)
  );

  console.log(`Matched plugins: ${matches.length}`);
  console.log(`New plugins: ${newPlugins.length}`);

  const successfullyPosted = [];

  for (const plugin of newPlugins) {
    console.log(`Posting: ${plugin.name}`);

    const ok = await postToDiscord(plugin);

    if (ok) {
      successfullyPosted.push(plugin.id);
    }
  }

  const updatedKnown = Array.from(
    new Set([
      ...known,
      ...successfullyPosted
    ])
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