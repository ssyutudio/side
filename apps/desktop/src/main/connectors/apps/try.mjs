#!/usr/bin/env node
// Tries an adapter by hand, for the checklist in README.md. Not part of the helper.
//
//   node apps/desktop/src/main/connectors/apps/try.mjs "/path/to/file.xlsx"        lists what Side can do with it
//   node apps/desktop/src/main/connectors/apps/try.mjs "/path/to/file.xlsx" 1      does the size 1 action
//   node apps/desktop/src/main/connectors/apps/try.mjs "/path/to/file.xlsx" open   does the plain open

import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { adapterById, classifyFile } from "./adapters.mjs";
import { appCandidates, performAppAction } from "./index.mjs";
import { installedMap } from "./lib/installed.mjs";
import { extensionOf } from "./lib/paths.mjs";
import { makeWork } from "./lib/work.mjs";

const [file, choice] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node apps/desktop/src/main/connectors/apps/try.mjs "/path/to/file" [1|2|3|open]');
  process.exit(1);
}

// A missing file is allowed through, so the checklist can see the "file moved" answer.
let path = resolve(file);
try {
  path = realpathSync(file);
} catch {}
const installed = await installedMap();
const adapterId = classifyFile(extensionOf(path), new Set(installed.keys()));
if (!adapterId) {
  console.log("No installed app on this computer handles that kind of file.");
  process.exit(1);
}

const work = makeWork({ adapterId, path, name: basename(path), touchedMs: Date.now() });
const candidates = appCandidates(work, { locale: "en" });
console.log(`${adapterById(adapterId).app} (${installed.get(adapterId)})`);
for (const candidate of candidates) console.log(`  size ${candidate.size}  ${candidate.effect.padEnd(5)}  ${candidate.label}`);

if (choice) {
  const wanted = choice === "open" ? candidates.find((candidate) => candidate.effect === "opens") : candidates.find((candidate) => candidate.size === Number(choice));
  if (!wanted) {
    console.log(`Nothing at "${choice}".`);
    process.exit(1);
  }
  console.log(`\nDoing: ${wanted.label}`);
  console.log(JSON.stringify(await performAppAction(work, wanted.id), null, 2));
}
