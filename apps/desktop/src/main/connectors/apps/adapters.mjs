// One entry per app. Each says what it can really do. Adding an app, or a Windows
// version of one, means adding an entry here with its own `platform`.
//
// Fields:
//   id, app, tool   adapter id, the app's name, and the name a person would use
//   platform        process.platform this entry works on
//   appFile         matches the .app bundle's file name
//   exts            file extensions this app owns (classification order is list order)
//   alsoOpens       extensions it can open when the owning app isn't installed
//   creative        what kind of result this work produces, for "look at the last export"
//   singleDocument  opening another file replaces the current one, so never do it while the app runs
//   appLevel        folders whose change time says when the app was last used, for apps with no local files
//   front           script that names the front document, when the app can say
//   verified        false until someone has really run it against the app. A true here means
//                   the action listed was run on a real machine, never just that it compiled.
//   actions         what can be offered, smallest first

const open = (en) => ({ key: "open", kind: "open", effect: "opens", size: 3, label: { en } });
const openApp = (en) => ({ key: "open_app", kind: "open_app", effect: "opens", size: 3, label: { en } });
const jump = (key, size, script, en) => ({ key, kind: "jump", script, effect: "runs", size, label: { en } });

const SCRATCH_SQL = { key: "scratch_sql", kind: "cli_scratch", effect: "opens", size: 1, label: { en: "Open a one-line SELECT 1 in DBeaver" } };

export const ADAPTERS = Object.freeze([
  {
    id: "excel",
    app: "Microsoft Excel",
    tool: "Excel",
    platform: "darwin",
    appFile: /^Microsoft Excel\.app$/,
    exts: ["xlsx", "xlsm", "xlsb", "xls"],
    front: "excel_front",
    verified: false,
    actions: [
      jump("jump_last_cell", 1, "excel_jump_last_cell", "Go to the last filled cell of {name} in Excel"),
      open("Open {name} in Excel"),
    ],
  },
  {
    id: "word",
    app: "Microsoft Word",
    tool: "Word",
    platform: "darwin",
    appFile: /^Microsoft Word\.app$/,
    exts: ["docx", "docm", "doc"],
    front: "word_front",
    verified: false,
    actions: [jump("jump_end", 1, "word_jump_end", "Go to the end of {name} in Word"), open("Open {name} in Word")],
  },
  {
    id: "powerpoint",
    app: "Microsoft PowerPoint",
    tool: "PowerPoint",
    platform: "darwin",
    appFile: /^Microsoft PowerPoint\.app$/,
    exts: ["pptx", "pptm", "ppt"],
    front: "powerpoint_front",
    verified: false,
    actions: [
      jump("go_last_slide", 1, "powerpoint_go_last_slide", "Go to the last slide of {name} in PowerPoint"),
      jump("play_last_slide", 2, "powerpoint_play_last_slide", "Play the last slide of {name} as a slide show"),
      open("Open {name} in PowerPoint"),
    ],
  },
  {
    id: "numbers",
    app: "Numbers",
    tool: "Numbers",
    platform: "darwin",
    appFile: /^Numbers( Creator Studio)?\.app$/,
    exts: ["numbers"],
    alsoOpens: ["xlsx", "xls"],
    front: "numbers_front",
    verified: false,
    actions: [jump("jump_last_cell", 1, "numbers_jump_last_cell", "Go to the last filled cell of {name} in Numbers"), open("Open {name} in Numbers")],
  },
  {
    // Pages has no documented way to move to a page or the end of the text, so it only opens.
    id: "pages",
    app: "Pages",
    tool: "Pages",
    platform: "darwin",
    appFile: /^Pages( Creator Studio)?\.app$/,
    exts: ["pages"],
    alsoOpens: ["docx", "doc"],
    front: "pages_front",
    verified: false,
    actions: [open("Open {name} in Pages")],
  },
  {
    id: "keynote",
    app: "Keynote",
    tool: "Keynote",
    platform: "darwin",
    appFile: /^Keynote( Creator Studio)?\.app$/,
    exts: ["key"],
    alsoOpens: ["pptx", "ppt"],
    front: "keynote_front",
    verified: false,
    actions: [
      jump("go_last_slide", 1, "keynote_go_last_slide", "Go to the last slide of {name} in Keynote"),
      jump("play_last_slide", 2, "keynote_play_last_slide", "Play the last slide of {name} as a slide show"),
      open("Open {name} in Keynote"),
    ],
  },
  {
    // Going to the last history state does nothing on a freshly opened file, and on a file
    // someone has stepped back in, it would change what they have. So Photoshop only opens.
    id: "photoshop",
    app: "Adobe Photoshop",
    tool: "Photoshop",
    platform: "darwin",
    appFile: /^Adobe Photoshop( \d{4})?\.app$/,
    exts: ["psd", "psb"],
    creative: "image",
    front: "photoshop_front",
    verified: true,
    actions: [open("Open {name} in Photoshop")],
  },
  {
    id: "tableau",
    app: "Tableau Desktop",
    tool: "Tableau",
    platform: "darwin",
    appFile: /^Tableau( Desktop)?( \d[\d.-]*)?\.app$/,
    exts: ["twb", "twbx"],
    verified: false,
    actions: [open("Open {name} in Tableau")],
  },
  {
    // Never given a catalog path. It opens one catalog at a time, and a catalog from an older
    // version brings up an upgrade dialog. Launching it leaves the choice to its own settings.
    id: "lightroom_classic",
    app: "Adobe Lightroom Classic",
    tool: "Lightroom Classic",
    platform: "darwin",
    appFile: /^Adobe Lightroom Classic\.app$/,
    exts: ["lrcat"],
    creative: "image",
    verified: false,
    actions: [openApp("Open Lightroom Classic")],
  },
  {
    id: "lightroom",
    app: "Adobe Lightroom",
    tool: "Lightroom",
    platform: "darwin",
    appFile: /^Adobe Lightroom( CC)?\.app$/,
    exts: [],
    creative: "image",
    appLevel: ["Pictures/Lightroom Library.lrlibrary", "Library/Application Support/Adobe/Lightroom CC"],
    verified: false,
    actions: [openApp("Open Lightroom")],
  },
  {
    id: "premiere",
    app: "Adobe Premiere Pro",
    tool: "Premiere Pro",
    platform: "darwin",
    appFile: /^Adobe Premiere Pro( \d{4})?\.app$/,
    exts: ["prproj"],
    creative: "video",
    singleDocument: true,
    verified: false,
    actions: [open("Open {name} in Premiere Pro")],
  },
  {
    id: "after_effects",
    app: "Adobe After Effects",
    tool: "After Effects",
    platform: "darwin",
    appFile: /^Adobe After Effects( \d{4})?\.app$/,
    exts: ["aep", "aepx"],
    creative: "video",
    singleDocument: true,
    verified: false,
    actions: [open("Open {name} in After Effects")],
  },
  {
    id: "final_cut",
    app: "Final Cut Pro",
    tool: "Final Cut Pro",
    platform: "darwin",
    appFile: /^Final Cut Pro( Trial| Creator Studio)?\.app$/,
    exts: ["fcpbundle"],
    creative: "video",
    verified: false,
    actions: [open("Open {name} in Final Cut Pro")],
  },
  {
    // Resolve keeps projects in its own database. A project can't be opened from outside.
    id: "davinci",
    app: "DaVinci Resolve",
    tool: "DaVinci Resolve",
    platform: "darwin",
    appFile: /^DaVinci Resolve\.app$/,
    exts: [],
    creative: "video",
    projectsDir: "Library/Application Support/Blackmagic Design/DaVinci Resolve/Resolve Disk Database/Resolve Projects/Users/guest/Projects",
    projectFile: "Project.db",
    verified: false,
    actions: [openApp("Open DaVinci Resolve. Look for {name}")],
  },
  {
    id: "logic",
    app: "Logic Pro",
    tool: "Logic Pro",
    platform: "darwin",
    appFile: /^Logic Pro( X| Creator Studio)?\.app$/,
    exts: ["logicx"],
    creative: "audio",
    singleDocument: true,
    verified: false,
    actions: [open("Open {name} in Logic Pro")],
  },
  {
    id: "garageband",
    app: "GarageBand",
    tool: "GarageBand",
    platform: "darwin",
    appFile: /^GarageBand\.app$/,
    exts: ["band"],
    creative: "audio",
    singleDocument: true,
    verified: false,
    actions: [open("Open {name} in GarageBand")],
  },
  {
    id: "ableton",
    app: "Ableton Live",
    tool: "Ableton Live",
    platform: "darwin",
    appFile: /^Ableton Live \d+.*\.app$/,
    exts: ["als"],
    creative: "audio",
    singleDocument: true,
    verified: false,
    actions: [open("Open {name} in Ableton Live")],
  },
  {
    id: "hangul",
    app: "Hancom Office Hangul",
    tool: "Hangul",
    platform: "darwin",
    appFile: /^(Hancom ?Office.*(HWP|Hangul)|\uD55C\uCEF4\uC624\uD53C\uC2A4.*\uD55C\uAE00|HWP).*\.app$/i,
    exts: ["hwp", "hwpx"],
    verified: false,
    actions: [open("Open {name} in Hangul")],
  },
  {
    id: "figma",
    app: "Figma",
    tool: "Figma",
    platform: "darwin",
    appFile: /^Figma\.app$/,
    exts: ["fig"],
    appLevel: ["Library/Application Support/Figma"],
    verified: false,
    actions: [open("Open {name} in Figma")],
    appActions: [openApp("Open Figma")],
  },
  {
    id: "sketch",
    app: "Sketch",
    tool: "Sketch",
    platform: "darwin",
    appFile: /^Sketch\.app$/,
    exts: ["sketch"],
    verified: false,
    actions: [open("Open {name} in Sketch")],
  },
  {
    id: "obsidian",
    app: "Obsidian",
    tool: "Obsidian",
    platform: "darwin",
    appFile: /^Obsidian\.app$/,
    exts: [],
    verified: false,
    actions: [{ key: "open_uri", kind: "open_uri", effect: "opens", size: 3, label: { en: "Open {name} in Obsidian" } }],
  },
  {
    id: "notion",
    app: "Notion",
    tool: "Notion",
    platform: "darwin",
    appFile: /^Notion\.app$/,
    exts: [],
    appLevel: ["Library/Application Support/Notion"],
    verified: false,
    actions: [openApp("Open Notion")],
  },
  {
    id: "affinity",
    app: "Affinity",
    tool: "Affinity",
    platform: "darwin",
    appFile: /^Affinity( Designer| Photo| Publisher)?( 2)?\.app$/,
    exts: ["afdesign", "afphoto", "afpub", "af"],
    creative: "image",
    verified: false,
    actions: [open("Open {name} in Affinity")],
  },
  {
    // CapCut declares no document types, and its only links are feature shortcuts that start a
    // new draft. A specific draft can't be opened from outside, so it says which one to look for.
    id: "capcut",
    app: "CapCut",
    tool: "CapCut",
    platform: "darwin",
    appFile: /^CapCut\.app$/,
    exts: [],
    creative: "video",
    projectsDir: "Movies/CapCut/User Data/Projects/com.lveditor.draft",
    projectFile: "draft_info.json",
    newestProjectOnly: true,
    verified: true,
    actions: [openApp("Open CapCut. Look for {name}")],
  },
  {
    id: "dbeaver",
    app: "DBeaver",
    tool: "DBeaver",
    platform: "darwin",
    appFile: /^DBeaver(EE|Lite|Ultimate|Team)?\.app$/,
    exts: [],
    scriptsDir: "Library/DBeaverData/workspace6/General/Scripts",
    appLevel: ["Library/DBeaverData/workspace6"],
    verified: false,
    actions: [SCRATCH_SQL, { key: "open_script", kind: "cli_open", effect: "opens", size: 2, label: { en: "Open {name} in DBeaver" } }],
    appActions: [SCRATCH_SQL],
  },
  {
    id: "datagrip",
    app: "DataGrip",
    tool: "DataGrip",
    platform: "darwin",
    appFile: /^DataGrip.*\.app$/,
    exts: ["sql"],
    verified: false,
    actions: [open("Open {name} in DataGrip")],
  },
  {
    id: "tableplus",
    app: "TablePlus",
    tool: "TablePlus",
    platform: "darwin",
    appFile: /^TablePlus\.app$/,
    exts: ["sql"],
    verified: false,
    actions: [open("Open {name} in TablePlus")],
  },
  // These two only ever show a result. Their actions are added by lookbackActions().
  {
    id: "quicktime",
    app: "QuickTime Player",
    tool: "QuickTime Player",
    platform: "darwin",
    appFile: /^QuickTime Player\.app$/,
    exts: [],
    front: "quicktime_front",
    verified: false,
    actions: [],
  },
  {
    id: "preview",
    app: "Preview",
    tool: "Preview",
    platform: "darwin",
    appFile: /^Preview\.app$/,
    exts: [],
    verified: true,
    actions: [],
  },
]);

const BY_ID = new Map(ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function adapterById(id) {
  return BY_ID.get(id) ?? null;
}

/** The adapters for this computer. */
export function adaptersForPlatform(platform = process.platform) {
  return ADAPTERS.filter((adapter) => adapter.platform === platform);
}

/**
 * Which installed app should open a file with this extension. The app that owns the
 * format wins; another app only takes it when the owner isn't installed.
 */
export function classifyFile(extension, installedIds, adapters = ADAPTERS) {
  const ext = String(extension).toLowerCase();
  if (!ext) return null;
  const owner = adapters.find((adapter) => installedIds.has(adapter.id) && adapter.exts.includes(ext));
  if (owner) return owner.id;
  return adapters.find((adapter) => installedIds.has(adapter.id) && adapter.alsoOpens?.includes(ext))?.id ?? null;
}

/** "Look at the last result" actions for a file of this kind. */
export function lookbackActions(media) {
  if (media === "video") {
    return [{ key: "look_last_ten", kind: "look_play", adapter: "quicktime", effect: "runs", size: 1, label: { en: "Play the last ten seconds of {look} in QuickTime" } }];
  }
  if (media === "audio") {
    return [
      { key: "look_last_ten", kind: "look_play", adapter: "quicktime", effect: "runs", size: 1, label: { en: "Hear the last ten seconds of {look} in QuickTime" } },
      { key: "listen_first_ten", kind: "look_afplay", adapter: null, tool: "Mac", effect: "runs", size: 1, label: { en: "Hear the first ten seconds of {look}" } },
    ];
  }
  if (media === "image") {
    return [{ key: "look_image", kind: "look_image", adapter: "preview", effect: "runs", size: 1, label: { en: "Look at {look} in Preview" } }];
  }
  return [];
}
