// Pure rules about file paths and names. No file is read here.

import { basename, extname } from "node:path";

const JUNK_FOLDERS = new Set([
  "node_modules",
  "Caches",
  "Cache",
  "DerivedData",
  "__MACOSX",
  "Backup",
  "Backups",
  "Backups.backupdb",
  "Auto-Save",
  "Autosave Information",
  "Adobe Premiere Pro Auto-Save",
  "Adobe After Effects Auto-Save",
  "Media.localized",
  "Temp",
  "tmp",
]);

// Packages that hold other files we must not list as separate work.
const PACKAGE_SUFFIXES = [".app", ".logicx", ".band", ".fcpbundle", ".lrdata", ".lrlibrary", ".photoslibrary", ".imovielibrary", ".tvlibrary", ".musiclibrary", ".pages", ".numbers", ".key"];

const SYSTEM_ROOTS = ["/Applications/", "/Library/", "/System/", "/bin/", "/sbin/", "/usr/", "/opt/", "/private/", "/tmp/", "/var/", "/cores/", "/dev/"];

// Inside ~/Library, only these hold people's own documents (iCloud Drive and cloud-sync folders).
const LIBRARY_DOCUMENT_FOLDERS = ["Mobile Documents/", "CloudStorage/"];

const VIDEO = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "mxf"]);
const AUDIO = new Set(["wav", "aif", "aiff", "mp3", "m4a", "flac", "aac", "ogg"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "tif", "tiff", "heic", "webp"]);

export function extensionOf(name) {
  return extname(String(name)).slice(1).toLowerCase();
}

export function withoutExtension(name) {
  const text = String(name);
  const ext = extname(text);
  return ext && ext !== text ? text.slice(0, -ext.length) : text;
}

export function mediaKind(name) {
  const ext = extensionOf(name);
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (IMAGE.has(ext)) return "image";
  return null;
}

/** True for anything that isn't someone's own work: lock files, caches, Trash, temp, app internals. */
export function isExcludedPath(path, home) {
  if (typeof path !== "string" || !path.startsWith("/")) return true;
  if (SYSTEM_ROOTS.some((root) => path.startsWith(root))) return true;

  if (home) {
    const library = `${home}/Library/`;
    if (path.startsWith(library) && !LIBRARY_DOCUMENT_FOLDERS.some((folder) => path.startsWith(library + folder))) return true;
  }

  const segments = path.split("/").filter(Boolean);
  const name = segments.pop() ?? "";
  if (!name || name.startsWith(".") || name.startsWith("~$") || name.startsWith("~") || /\.(tmp|crdownload|part|download)$/i.test(name)) return true;
  for (const segment of segments) {
    if (segment.startsWith(".") || JUNK_FOLDERS.has(segment)) return true;
    const lower = segment.toLowerCase();
    if (PACKAGE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  }
  return false;
}

/** The name as it may be shown: file name only, composed, with no control or invisible characters. */
export function cleanName(value) {
  const name = basename(String(value ?? "")).normalize("NFC").replace(/\p{C}+/gu, " ").replace(/\s+/g, " ").trim();
  return name.slice(0, 120);
}

/** A shorter form for a sentence: no extension, cut to a length a person can read. */
export function labelName(value, max = 40) {
  const name = withoutExtension(cleanName(value)).trim() || cleanName(value);
  const letters = Array.from(name);
  return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : name;
}

/** Puts names into a label. One pass, so a name containing "{look}" or "$&" stays literal. */
export function fillLabel(template, values) {
  return template.replace(/\{(name|look)\}/g, (_, key) => values[key] ?? "");
}
