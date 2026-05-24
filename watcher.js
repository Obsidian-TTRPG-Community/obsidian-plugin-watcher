const fs = require("fs");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

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
  "campaign"
];

async function main() {
  const response = await fetch(
    "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
  );

  const plugins = await response.json();

  let known = [];

  if (fs.existsSync("known.json")) {
    known = JSON.parse(fs.readFileSync("known.json"));
  }

  const knownIds = new Set(known);

  const matches = plugins.filter((plugin) => {
    const text = (
      (plugin.name || "") +
      " " +
      (plugin.description || "")
    ).toLowerCase();

    return KEYWORDS.some((k) => text.includes(k));
  });

  const newPlugins = matches.filter(
    (p) => !knownIds.has(p.id)
  );

  for (const plugin of newPlugins) {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "Obsidian Plugin Watcher",
        embeds: [
          {
            title: plugin.name,
            url: plugin.repo,
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
                value: plugin.id,
                inline: true
              }
            ]
          }
        ]
      })
    });

    console.log("Posted:", plugin.name);
  }

  fs.writeFileSync(
    "known.json",
    JSON.stringify(matches.map((p) => p.id), null, 2)
  );
}

main();