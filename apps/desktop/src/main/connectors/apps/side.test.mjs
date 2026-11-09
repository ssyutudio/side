// Side's two additions to the adapters: only the apps someone turned on are looked at, and a
// work item can be registered again after a restart from what Side keeps on this computer.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { __clearRecentCacheForTests, appCandidates, recentWork } from "./index.mjs";
import { __setProcessForTests } from "./lib/exec.mjs";
import { __setInstalledForTests } from "./lib/installed.mjs";
import { __clearWorkForTests, makeWork, privateFacts } from "./lib/work.mjs";

let dir;
let queries;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "side-apps-only-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  __clearWorkForTests();
  __clearRecentCacheForTests();
  __setInstalledForTests({ excel: "/Applications/Microsoft Excel.app", word: "/Applications/Microsoft Word.app", photoshop: "/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app" });
  queries = [];
  const xlsx = join(dir, "november-orders.xlsx");
  const docx = join(dir, "letter.docx");
  writeFileSync(xlsx, "x");
  writeFileSync(docx, "x");
  __setProcessForTests({
    execFile(file, args, _options, callback) {
      let stdout = "";
      if (file.endsWith("mdfind")) {
        const query = args[args.length - 1];
        queries.push(query);
        const hits = [];
        if (query.includes('"*.xlsx"')) hits.push(xlsx);
        if (query.includes('"*.docx"')) hits.push(docx);
        stdout = hits.join("\n");
      }
      setImmediate(() => callback(null, stdout, ""));
    },
  });
});

afterEach(() => {
  __setProcessForTests();
  __setInstalledForTests(null);
});

describe("recentWork({ only })", () => {
  // Files under the temp folder count as system files and are dropped, so these tests read the
  // Spotlight queries themselves: what is never asked can never be stored, sent or shown.
  it("asks Spotlight only about the apps that were turned on", async () => {
    await recentWork({ limit: 40, only: ["excel"] });
    const asked = queries.join(" ");
    expect(asked).toContain('"*.xlsx"');
    expect(asked).not.toContain(".docx");
    expect(asked).not.toContain(".psd");
  });

  it("looks at nothing at all when no app is turned on", async () => {
    expect(await recentWork({ limit: 40, only: [] })).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("does not reuse a scan made for a different set of apps", async () => {
    await recentWork({ limit: 40, only: ["excel"] });
    queries = [];
    await recentWork({ limit: 40, only: ["excel", "word"] });
    expect(queries.join(" ")).toContain('"*.docx"');
  });
});

describe("privateFacts", () => {
  it("gives back what makeWork needs to register the same work, with the same ids", () => {
    const path = join(dir, "november-orders.xlsx");
    const first = makeWork({ adapterId: "excel", path, name: "november-orders.xlsx", touchedMs: 5 });
    const facts = privateFacts(first);
    expect(facts).toMatchObject({ adapterId: "excel", path, key: path });
    const ids = appCandidates(first).map((c) => c.id);

    __clearWorkForTests();
    expect(privateFacts(first)).toBeNull();
    const again = makeWork({ adapterId: facts.adapterId, path: facts.path, key: facts.key, name: first.name, touchedMs: 5 });
    expect(again.id).toBe(first.id);
    expect(appCandidates(again).map((c) => c.id)).toEqual(ids);
  });

  it("knows nothing about an id it never made", () => {
    expect(privateFacts({ id: "doc-forged" })).toBeNull();
    expect(privateFacts(null)).toBeNull();
  });
});
