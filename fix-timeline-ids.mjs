
import fs from "node:fs";
import path from "node:path";

const root = "src/content";
let changedFiles = 0;
let addedIds = 0;

function processDirectory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(file);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const source = fs.readFileSync(file, "utf8");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;

    const frontmatter = match[1].split(/\r?\n/);
    const slug = path.basename(file, ".md")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let inTimeline = false;
    let itemIndex = 0;
    let changed = false;
    const output = [];

    for (let i = 0; i < frontmatter.length; i++) {
      const line = frontmatter[i];

      if (/^timeline:\s*$/.test(line)) {
        inTimeline = true;
        output.push(line);
        continue;
      }

      if (inTimeline && /^\S/.test(line)) {
        inTimeline = false;
      }

      if (inTimeline && /^  - /.test(line)) {
        itemIndex++;

        if (/^  - id:\s*/.test(line)) {
          output.push(line);
          continue;
        }

        const rest = line.replace(/^  - /, "");
        output.push(`  - id: "${slug}-timeline-${itemIndex}"`);
        output.push(`    ${rest}`);
        addedIds++;
        changed = true;
        continue;
      }

      output.push(line);
    }

    if (changed) {
      const updated = source.replace(
        match[1],
        output.join("\n")
      );
      fs.writeFileSync(file, updated, "utf8");
      changedFiles++;
      console.log(`Fixed: ${file}`);
    }
  }
}

processDirectory(root);
console.log(`\nFiles changed: ${changedFiles}`);
console.log(`Timeline IDs added: ${addedIds}`);
