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
  const description = (plugin.description || "No description").slice(0, 3900);

  const payload = {
    username: "Obsidian Plugin Watcher",
    embeds: [
      {
        title: (plugin.name || plugin.id || "Unknown Plugin").slice(0, 250),
        url: repoUrl(plugin.repo),
        description,
        color: 5814783,
        fields: [
          {
            name: "Author",
            value: (plugin.author || "Unknown").slice(0, 1000),
            inline: true
          },
          {
            name: "Plugin ID",
            value: (plugin.id || "Unknown").slice(0, 1000),
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
    console.error(`Discord rejected ${plugin.id}: ${response.status} ${text}`);
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));
  return true;
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
}

main();