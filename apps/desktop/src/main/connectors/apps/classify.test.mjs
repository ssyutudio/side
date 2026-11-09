import { describe, expect, it } from "vitest";
import { ADAPTERS, classifyFile } from "./adapters.mjs";
import { cleanName, extensionOf, fillLabel, isExcludedPath, labelName, mediaKind, withoutExtension } from "./lib/paths.mjs";
import { documentQuery, parseSpotlightDate } from "./lib/spotlight.mjs";

const HOME = "/Users/someone";
const everything = new Set(ADAPTERS.map((adapter) => adapter.id));
const only = (...ids) => new Set(ids);

describe("classifyFile", () => {
  it.each([
    ["xlsx", "excel"],
    ["XLSX", "excel"],
    ["docx", "word"],
    ["pptx", "powerpoint"],
    ["numbers", "numbers"],
    ["pages", "pages"],
    ["key", "keynote"],
    ["psd", "photoshop"],
    ["twbx", "tableau"],
    ["lrcat", "lightroom_classic"],
    ["prproj", "premiere"],
    ["aep", "after_effects"],
    ["fcpbundle", "final_cut"],
    ["logicx", "logic"],
    ["band", "garageband"],
    ["als", "ableton"],
    ["hwp", "hangul"],
    ["hwpx", "hangul"],
    ["fig", "figma"],
    ["sketch", "sketch"],
    ["afdesign", "affinity"],
  ])("%s goes to %s", (ext, id) => {
    expect(classifyFile(ext, everything)).toBe(id);
  });

  it("gives Office formats to Office when both are installed", () => {
    expect(classifyFile("docx", only("word", "pages"))).toBe("word");
    expect(classifyFile("xlsx", only("excel", "numbers"))).toBe("excel");
  });

  it("falls back to iWork only when Office is missing", () => {
    expect(classifyFile("docx", only("pages"))).toBe("pages");
    expect(classifyFile("pptx", only("keynote"))).toBe("keynote");
  });

  it("returns null when nothing installed can open it", () => {
    expect(classifyFile("hwp", only("word"))).toBeNull();
    expect(classifyFile("exe", everything)).toBeNull();
    expect(classifyFile("", everything)).toBeNull();
  });
});

describe("isExcludedPath", () => {
  it.each([
    [`${HOME}/Documents/report.xlsx`],
    [`${HOME}/Desktop/3\uBD84\uAE30 \uACB0\uC0B0.hwp`],
    [`${HOME}/Library/Mobile Documents/com~apple~CloudDocs/budget.numbers`],
    [`${HOME}/Library/CloudStorage/Dropbox/deck.pptx`],
    ["/Volumes/Work SSD/edit/film.prproj"],
    [`${HOME}/Music/Logic/song.logicx`],
  ])("keeps %s", (path) => {
    expect(isExcludedPath(path, HOME)).toBe(false);
  });

  it.each([
    ["Office lock file", `${HOME}/Documents/~$report.xlsx`],
    ["LibreOffice lock file", `${HOME}/Documents/.~lock.report.xlsx#`],
    ["AppleDouble file", `${HOME}/Documents/._report.xlsx`],
    ["Trash", `${HOME}/.Trash/report.xlsx`],
    ["volume Trash", "/Volumes/Work/.Trashes/501/film.prproj"],
    ["node_modules", `${HOME}/code/app/node_modules/pkg/fixture.xlsx`],
    ["cache", `${HOME}/Library/Caches/com.app/x.docx`],
    ["app data in Library", `${HOME}/Library/Containers/com.microsoft.Excel/Data/x.xlsx`],
    ["hidden folder", `${HOME}/code/.git/x.docx`],
    ["inside an app", "/Applications/Foo.app/Contents/Resources/template.docx"],
    ["inside a project package", `${HOME}/Music/song.logicx/Alternatives/000/x.band`],
    ["Premiere auto-save", `${HOME}/Documents/Adobe/Premiere Pro/Adobe Premiere Pro Auto-Save/a.prproj`],
    ["Lightroom backup", `${HOME}/Pictures/Lightroom/Backups/2026/cat.lrcat`],
    ["Ableton backup", `${HOME}/Music/Song Project/Backup/song [2026].als`],
    ["temp", "/private/tmp/report.xlsx"],
    ["var folders", "/var/folders/ab/T/report.xlsx"],
    ["partial download", `${HOME}/Downloads/film.mp4.crdownload`],
    ["relative path", "Documents/report.xlsx"],
  ])("drops a %s", (_, path) => {
    expect(isExcludedPath(path, HOME)).toBe(true);
  });
});

describe("names", () => {
  it("keeps only the file name and removes invisible characters", () => {
    expect(cleanName("/Users/x/Documents/a.xlsx")).toBe("a.xlsx");
    expect(cleanName("new\nline\t.xlsx")).toBe("new line .xlsx");
    expect(cleanName("a‮b​.docx")).toBe("a b .docx");
  });

  it("composes Korean file names", () => {
    const decomposed = "\uBCF4\uACE0\uC11C.hwp".normalize("NFD");
    expect(cleanName(decomposed)).toBe("\uBCF4\uACE0\uC11C.hwp");
  });

  it("drops the extension and shortens for a sentence", () => {
    expect(labelName("3\uBD84\uAE30 \uACB0\uC0B0.xlsx")).toBe("3\uBD84\uAE30 \uACB0\uC0B0");
    expect(Array.from(labelName("\uAC00".repeat(80))).length).toBe(40);
    expect(labelName(".xlsx")).toBe(".xlsx");
  });

  it("fills a label in one pass, leaving odd names literal", () => {
    expect(fillLabel("Open {name}", { name: "$& {look}" })).toBe("Open $& {look}");
    expect(fillLabel("{look} and {name}", { name: "b", look: "{name}" })).toBe("{name} and b");
  });

  it("reads extensions and kinds of media", () => {
    expect(extensionOf("a.b.XLSX")).toBe("xlsx");
    expect(withoutExtension("a.b.xlsx")).toBe("a.b");
    expect(mediaKind("cut.MOV")).toBe("video");
    expect(mediaKind("mix.wav")).toBe("audio");
    expect(mediaKind("still.png")).toBe("image");
    expect(mediaKind("notes.txt")).toBeNull();
  });
});

describe("spotlight helpers", () => {
  it("finds Keynote by file type, since *.key also matches private keys", () => {
    const query = documentQuery(["key", "xlsx"], 60);
    expect(query).not.toContain('"*.key"');
    expect(query).toContain("com.apple.iwork.keynote");
    expect(query).toContain('"*.xlsx"c');
  });

  it("parses Spotlight's date format", () => {
    expect(parseSpotlightDate("2026-11-08 03:12:11 +0000")).toBe(Date.UTC(2026, 10, 8, 3, 12, 11));
    expect(parseSpotlightDate("(null)")).toBe(0);
  });
});
