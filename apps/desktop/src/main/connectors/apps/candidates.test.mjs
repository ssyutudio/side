import { beforeEach, describe, expect, it } from "vitest";
import { ADAPTERS } from "./adapters.mjs";
import { appCandidates } from "./index.mjs";
import { __clearWorkForTests, capPerApp, makeWork } from "./lib/work.mjs";

const FILE = "/Users/someone/Documents/secret plans.xlsx";
const excel = (extra = {}) => makeWork({ adapterId: "excel", path: FILE, name: "secret plans.xlsx", touchedMs: Date.UTC(2026, 10, 1), ...extra });
const sizes = (list) => list.map((candidate) => candidate.size);

beforeEach(() => __clearWorkForTests());

describe("appCandidates", () => {
  it("offers Excel's jump at size 1 and a plain open at size 3", () => {
    const list = appCandidates(excel());
    expect(sizes(list)).toEqual([1, 3]);
    expect(list[0].effect).toBe("runs");
    expect(list[1].effect).toBe("opens");
  });

  it("offers PowerPoint's go-to, slide show and open at sizes 1, 2, 3", () => {
    const work = makeWork({ adapterId: "powerpoint", path: "/Users/someone/deck.pptx", name: "deck.pptx", touchedMs: 1 });
    expect(sizes(appCandidates(work))).toEqual([1, 2, 3]);
  });

  it("marks every candidate read-only and of kind app", () => {
    for (const candidate of appCandidates(excel())) {
      expect(candidate.kind).toBe("app");
      expect(candidate.safety).toBe("read_only");
      expect([1, 2, 3]).toContain(candidate.size);
      expect(["runs", "opens"]).toContain(candidate.effect);
    }
  });

  it("says apps that can only open do only that", () => {
    for (const id of ["tableau", "photoshop", "premiere", "hangul", "logic"]) {
      const work = makeWork({ adapterId: id, path: `/Users/someone/x.${id}`, name: `x.${id}`, touchedMs: 1 });
      const list = appCandidates(work);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ effect: "opens", size: 3 });
    }
  });

  it("writes in English and names the file without its extension", () => {
    expect(appCandidates(excel(), { locale: "ko" })[0].label).toBe("Go to the last filled cell of secret plans in Excel");
    expect(appCandidates(excel(), { locale: "en" })[0].label).toBe("Go to the last filled cell of secret plans in Excel");
  });

  it("uses CapCut's project name and says which one to look for", () => {
    const work = makeWork({ adapterId: "capcut", path: null, key: "capcut:Summer", name: "Summer", touchedMs: 1 });
    const [candidate] = appCandidates(work, { locale: "en" });
    expect(candidate.label).toBe("Open CapCut. Look for Summer");
    expect(candidate.effect).toBe("opens");
  });

  it("adds the last result to look at as a size 1 step for creative work", () => {
    const look = { path: "/Users/someone/Movies/final.mp4", name: "final.mp4", media: "video" };
    const work = makeWork({ adapterId: "premiere", path: "/Users/someone/film.prproj", name: "film.prproj", touchedMs: 1, lookback: look });
    const list = appCandidates(work, { locale: "en" });
    expect(sizes(list)).toEqual([1, 3]);
    expect(list[0]).toMatchObject({ effect: "runs", tool: "QuickTime Player", label: "Play the last ten seconds of final in QuickTime" });
  });

  it("offers audio both ways, and an image in Preview", () => {
    const audio = makeWork({ adapterId: "quicktime", path: "/Users/someone/Music/mix.wav", name: "mix.wav", touchedMs: 1, lookback: { path: "/Users/someone/Music/mix.wav", name: "mix.wav", media: "audio" } });
    const image = makeWork({ adapterId: "preview", path: "/Users/someone/Desktop/still.png", name: "still.png", touchedMs: 1, lookback: { path: "/Users/someone/Desktop/still.png", name: "still.png", media: "image" } });
    expect(appCandidates(audio).map((candidate) => candidate.tool)).toEqual(["QuickTime Player", "Mac"]);
    expect(appCandidates(image)[0]).toMatchObject({ tool: "Preview", size: 1, effect: "runs" });
  });

  it("offers DBeaver's scratch query first, and only that when there's no script", () => {
    const withScript = makeWork({ adapterId: "dbeaver", path: "/Users/someone/Script.sql", name: "Script.sql", touchedMs: 1 });
    const noScript = makeWork({ adapterId: "dbeaver", path: null, key: "dbeaver:app", name: "DBeaver", touchedMs: 1 });
    expect(sizes(appCandidates(withScript))).toEqual([1, 2]);
    expect(sizes(appCandidates(noScript))).toEqual([1]);
  });

  it("offers nothing for an item it didn't make", () => {
    expect(appCandidates({ id: "doc-forged", path: "/etc/passwd" })).toEqual([]);
    expect(appCandidates(null)).toEqual([]);
  });

  it("gives each adapter at least one action with an English label", () => {
    for (const adapter of ADAPTERS) {
      for (const action of [...adapter.actions, ...(adapter.appActions ?? [])]) {
        expect(action.label.ko, adapter.id).toBeUndefined();
        expect(action.label.en, adapter.id).toBeTruthy();
      }
      if (adapter.id !== "quicktime" && adapter.id !== "preview") expect(adapter.actions.length, adapter.id).toBeGreaterThan(0);
    }
  });
});

describe("nothing internal can leave", () => {
  it("exposes exactly the public fields on a candidate", () => {
    for (const candidate of appCandidates(excel())) {
      expect(Object.keys(candidate).sort()).toEqual(["effect", "id", "kind", "label", "safety", "size", "tool"]);
    }
  });

  it("keeps the path off serialized and spread work items", () => {
    const work = excel();
    expect(work.path).toBe(FILE);
    expect(Object.keys(work).sort()).toEqual(["app", "id", "name", "tool", "touched_at"]);
    expect(JSON.stringify(work)).not.toContain("/Users/");
    expect(JSON.stringify({ ...work })).not.toContain("/Users/");
    expect({ ...work }.path).toBeUndefined();
  });

  it("doesn't let the path be overwritten on a work item", () => {
    const work = excel();
    expect(() => {
      "use strict";
      work.path = "/etc/passwd";
    }).toThrow();
    expect(work.path).toBe(FILE);
  });

  it("puts no path, script or action name in what the browser gets", () => {
    const text = JSON.stringify(appCandidates(excel()));
    for (const secret of ["/Users/", "secret plans.xlsx", "excel_jump_last_cell", "jump_last_cell", "adapter"]) expect(text).not.toContain(secret);
  });

  it("uses ids a helper can accept, that are the same on every run", () => {
    const first = appCandidates(excel());
    __clearWorkForTests();
    const second = appCandidates(excel());
    expect(second.map((candidate) => candidate.id)).toEqual(first.map((candidate) => candidate.id));
    for (const candidate of first) expect(candidate.id).toMatch(/^[\w.:-]{1,80}$/);
  });

  it("gives different files different ids", () => {
    const a = makeWork({ adapterId: "excel", path: "/a.xlsx", name: "a.xlsx", touchedMs: 1 });
    const b = makeWork({ adapterId: "excel", path: "/b.xlsx", name: "b.xlsx", touchedMs: 1 });
    expect(a.id).not.toBe(b.id);
  });

  it("keeps a name out of labels when it's hostile, without losing it", () => {
    const work = makeWork({ adapterId: "excel", path: '/x/a"$(id)`b`.xlsx', name: 'a"$(id)`b`\n.xlsx', touchedMs: 1 });
    const [candidate] = appCandidates(work, { locale: "en" });
    expect(candidate.label).toContain('a"$(id)`b`');
    expect(/\p{Cc}/u.test(candidate.label)).toBe(false);
  });
});

describe("capPerApp", () => {
  it("keeps order and limits each app", () => {
    const list = ["excel", "excel", "excel", "excel", "word"].map((adapterId, index) => makeWork({ adapterId, path: `/f${index}.x`, name: `f${index}.x`, touchedMs: 1 }));
    const kept = capPerApp(list, 3);
    expect(kept.map((work) => work.tool)).toEqual(["Excel", "Excel", "Excel", "Word"]);
  });
});
