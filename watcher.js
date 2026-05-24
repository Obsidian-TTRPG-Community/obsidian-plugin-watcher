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
  if (!repo) return "https://github.com/obsidianmd/obsidian-releases";
  if (repo.startsWith("http")) return repo;
  return `https://github.com/${repo}`;
}

async function postToDiscord(plugin) {
  const payload = {
    username: "Obsidian Plugin Watcher",
    embeds: [
      {
        title: plugin.name || plugin.id,
        url: repoUrl(plugin.repo),
        description: plugin.description || "No description",
        color: 5814783,
        fields: [
          {
            name: "Author",
            value: plugin.author || "Unknown",
            inline: true
          },
          {
            name: "Plugin ID",
            value: plugin.id || "Unknown",
            inline: true
          }
        ]
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
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
}

async function main() {
  const response = await fetch(
    "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
  );

  const plugins = await response.json();

  let known = [];

  if (fs.existsSync("known.json")) {
    known = JSON.parse(fs.readFileSync("known.json", "utf8"));
  }

  const knownIds = new Set(known);

  const matches = plugins.filter((plugin) => {
    const text = `${plugin.name || ""} ${plugin.description || ""} ${plugin.id || ""}`.toLowerCase();
    return KEYWORDS.some((k) => text.includes(k));
  });

  const newPlugins = matches.filter((p) => !knownIds.has(p.id));

  console.log(`Matched plugins: ${matches.length}`);
  console.log(`New plugins: ${newPlugins.length}`);

  for (const plugin of newPlugins) {
    console.log(`Posting: ${plugin.name}`);
    await postToDiscord(plugin);
  }

  fs.writeFileSync(
    "known.json",
    JSON.stringify(matches.map((p) => p.id), null, 2)
  );
}

main();