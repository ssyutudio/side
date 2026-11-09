# Desktop app adapters

Brought over from side-service (`helper/apps`, commit `e9ea984`), so Side's desktop app can find
the file someone was working on in Word, Excel, PowerPoint, Photoshop and others, and open it in
that app. Side's changes: English only, "this computer" wording, `recentWork({ only })` so only the
apps someone turned on are looked at, and `privateFacts()` so a step kept overnight can register the
same work again after a restart. The Electron main process calls it directly instead of a separate
helper daemon. Keep the two copies in step.

How Side finds what someone was working on in Office, Hangul, Tableau, CapCut, Lightroom and so on, and does one small, harmless thing there. The helper imports `index.mjs`. Plain Node 20+ ESM, no dependencies, macOS first.

## Interface

```js
installedApps()                         // [{ id, name }]
frontDocument(frontAppName)             // { app, name } | null. Only when asked. Never starts an app.
recentWork({ limit })                   // newest first: [{ id, app, tool, name, touched_at }], plus a non-enumerable `path`
appCandidates(work, { locale })         // LocalCandidate[]: kind "app", tool, effect, safety "read_only", size. Smallest first.
performAppAction(work, candidateId, { locale }) // { ok, did, tool, error?, message? }
```

**Results.** `ok: true` means something real happened and `did` says what: `"ran"`, or `"opened"` if it only got as far as opening. `ok: false` means nothing happened. `error` is a short code for the program. `message` is the sentence for the person, in their language.

| `error` | Meaning | `ok` / `did` |
|---|---|---|
| `automation_denied` | -1743. The message says where to allow it in System Settings. | `true` / `"opened"` |
| `automation_pending` | The app didn't answer in time, usually a dialog or a permission question waiting on the person. | `true` / `"opened"` |
| `action_incomplete` | Opened, but the script couldn't finish. | `true` / `"opened"` |
| `already_running` | A one-project app was already running, so it only came to the front. The file was not passed. | `true` / `"opened"` |
| `file_moved`, `app_not_installed`, `open_failed`, `stale_candidate` | Nothing happened. | `false` / `null` |

Ids are stable: the same file gives the same `work.id` and candidate ids on every run, so a step saved tonight still resolves tomorrow. `performAppAction` ignores anything the caller's object says about a path. It looks up its own record by id.

## What keeps this safe

- **Every AppleScript is fixed text** in `lib/applescript.mjs`. File names reach it only through `on run argv`, as separate `osascript` arguments, through `execFile` with no shell. Tests fail if a script could save, close, quit, export, change content, or reach a shell or keystrokes.
- **Documents are opened through LaunchServices** (`open -a App file`), the same as a double-click. A file that's already open just comes to the front. Apps' own open commands are not used, because Excel's, for one, offers to reload a file that's already open and discard the changes.
- **A script only runs after the document is open**, and checks that it's the one in front. If the script fails, the person still has the document, and the result says `opened`, not `ran`.
- **Apps that hold one project at a time** (After Effects, Premiere, Logic, GarageBand, Ableton) are never given a file while they're running, because opening another project closes the current one. Side only brings them forward and says why.
- **Lightroom Classic is never given a catalog.** It opens one at a time and a catalog from an older version brings up an upgrade dialog, so Side only starts the app and lets its own settings decide.
- **Every program call has a timeout**, because a dialog can block AppleScript forever.
- **Only file names leave.** Paths are non-enumerable on work items and never appear in candidates or results. File contents are never read. CapCut's project is named from its folder.
- **Nothing runs on its own.** Spotlight is queried only when `recentWork` is called, and the scan is reused for 30 seconds.

## What each app really does

Sizes: 1 is the smallest step. "Runs" means the app does something and answers; "opens" means it can only open the place.

| App | Size 1 | Size 2 | Size 3 | Tested for real |
|---|---|---|---|---|
| Excel | Runs: jumps to the last filled cell | | Opens | Yes (Side, Nov 9): C10 picked over a formatted empty F40; unsaved typing kept on reopen and re-jump |
| Word | Runs: jumps to the end | | Opens | Yes (Side, Nov 9): cursor at the end; a renamed file gives file_moved and opens nothing |
| PowerPoint | Runs: goes to the last slide | Runs: slide show from the last slide | Opens | Yes (Side, Nov 9): slide 3 of 3; show from slide 3, nothing to save afterwards |
| Numbers | Runs: jumps to the last filled cell | | Opens | No |
| Keynote | Runs: goes to the last slide | Runs: plays from the last slide | Opens | No |
| Pages | | | Opens. No documented way to move inside the document. | No |
| Photoshop | | | Opens. Jumping to the last history state does nothing on a fresh file and changes things on a file someone stepped back in. | Yes, opened a throwaway PSD |
| Tableau, Premiere, After Effects, Final Cut, Logic, GarageBand, Ableton, Hangul, Figma, Sketch, Affinity | | | Opens the document | No |
| Lightroom Classic | | | Opens the app only, by design | No, on purpose |
| Lightroom, Notion | | | Opens the app. Their documents aren't local files. | No |
| Obsidian | | | Opens the newest note through its URI scheme | No |
| CapCut | | | Opens the app and names the project to look for | Yes, app launch and project naming |
| DaVinci Resolve | | | Opens the app and names the project to look for | No |
| DBeaver | Opens a scratch `SELECT 1;` | Opens the newest script | | No |
| DataGrip, TablePlus | | | Opens the `.sql` | No |
| QuickTime Player (last result) | Runs: plays the last ten seconds | | | Opening yes. Playback no: it waited on the Automation permission. |
| `afplay` (last result, audio) | Runs: plays the first ten seconds. Needs no permission. | | | Yes, on a silent file |
| Preview (last result, image) | Runs: shows the image | | | Yes, with a hostile file name |

Creative work (video, audio, image apps) also gets the last exported result of its kind as a size 1 step, named in the label. CapCut's only links are feature shortcuts that start a new draft, and it declares no document types, so a specific draft can't be opened from outside.

`verified` in `adapters.mjs` is true only for what has been run for real.

## Tests

```
npx vitest run apps/desktop/src/main/connectors/apps
```

Run from the project root; the root `vitest.config.ts` includes these `.test.mjs` files.

## Checklist for a machine with Office and Tableau

Takes a few minutes. Use throwaway copies, never real documents. Say yes when macOS asks whether to allow control of an app the first time. If you say no, turn it on later in System Settings > Privacy & Security > Automation.

In a terminal at the project root, set up the command and a folder:

```
SIDE="$PWD"
try() { node "$SIDE/apps/desktop/src/main/connectors/apps/try.mjs" "$@"; }
mkdir -p ~/Desktop/side-check && cd ~/Desktop/side-check
```

Then make these by hand and save them in `~/Desktop/side-check`:

- `book.xlsx`, with values in A1 and C10, plus a formatted but empty cell at F40.
- `doc.docx`, with several paragraphs.
- `deck.pptx`, with three slides.
- `sheet.twbx`, any saved Tableau workbook.

Close them all. Each line below should show `"did": "ran"` or `"did": "opened"` as stated. Nothing should ever ask to save.

| # | Run | What should happen |
|---|---|---|
| 1 | `try book.xlsx 1` | Excel opens the book. The cell C10 is selected, not F40. `ran`. |
| 2 | Type in another cell without saving, then `try book.xlsx 3` | The book comes forward with your typing still there. `opened`. |
| 3 | `try book.xlsx 1` again | Selection moves to the last filled cell. Excel doesn't offer to reload. `ran`. Close without saving. |
| 4 | `try doc.docx 1` | Word opens it with the cursor at the very end. `ran`. |
| 5 | `try deck.pptx 1` | PowerPoint opens on slide 3. `ran`. |
| 6 | `try deck.pptx 2` | A slide show starts on slide 3. Press Esc. `ran`. Closing the deck doesn't ask to save. |
| 7 | `try sheet.twbx open` | Tableau opens the workbook. `opened`. |
| 8 | In System Settings, turn off the permission for Excel, then `try book.xlsx 1` | The book opens. `opened`, with `"error": "automation_denied"` and a message naming the place in System Settings. Turn it back on. |
| 9 | Rename `doc.docx`, then `try doc.docx 1` with the old name | A plain error about not finding the file. Nothing opens. Rename it back. |

If 1, 4, 5 or 6 say `opened` with `action_incomplete`, the dictionary term in `lib/applescript.mjs` doesn't match that Office version. Open the app's dictionary in Script Editor (File > Open Dictionary) and fix the term. The Office, Numbers and Keynote scripts were written without those apps installed, from public examples of their dictionaries, so expect to correct a term or two.

When an item passes, set `verified: true` on that adapter in `adapters.mjs`. Then do the same for any other app you have: Hangul, Premiere and so on with `open`, Numbers and Keynote with `1` and `2`.

For a Pages expert: if a Pages version gains a way to move to the end of a document, it can become a `jump` like Word's.

## Adding an app

Add an entry to `ADAPTERS` in `adapters.mjs` with what it can really do. Any AppleScript goes in `SCRIPTS` in `lib/applescript.mjs` as fixed text.

**Windows** fits the same shape. A Windows Office adapter would be entries with `platform: "win32"` and an action kind that runs a fixed PowerShell script through COM (`New-Object -ComObject Excel.Application`, attaching with `GetActiveObject` to a running instance), with the path passed as an argument and never spliced into the script. Discovery would use the Recent folder or Windows Search in place of Spotlight. `adaptersForPlatform` already filters by platform.
