# Side

**Set aside. Be beside. Step inside. By your side.**

Side is a desktop app and a Chrome extension for people who can't stop when they're in flow, and can't start when they're not. Chrome is the first tool it connects to; calendars, IDEs, Office files and databases come next.

- **Set Aside.** When you stop, Side folds your Chrome tabs into named groups, one per piece of work. It asks one optional question: *What are you most curious about tomorrow?* Nothing is closed unless you choose to close it, and Undo brings everything back.
- **Be Beside.** While you rest, **sidy** stays quietly at the right edge of your screen. sidy is Side's face: a small rounded square with a blue side. It doesn't nag, and nothing piles up.
- **Step Inside.** When you come back, the next day or three days later, sidy offers one tiny step: the page you stopped on, opened where you stopped reading.
- **By your side.** Side keeps a record of which steps got you going again and whether you kept working ten minutes later, so the next step can learn from it.

## Join the waitlist

**[side-waitlist.vercel.app](https://side-waitlist.vercel.app/)**: one email field, nothing else stored.

<img src="docs/assets/waitlist-qr.png" width="160" alt="QR code for the Side waitlist">

## Install (about 3 minutes)

Requirements: macOS (the build checked for this event), Node 22 or newer, Google Chrome 116 or newer.

```bash
git clone https://github.com/ssyutudio/side.git
cd side
npm install        # also builds the Chrome extension into apps/extension/dist
npm start          # builds and launches Side; the first start downloads Electron (about 100 MB)
```

On first launch a small **Set up Side** window walks you through connecting Chrome:

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `apps/extension/dist` folder in this repo.
3. Side connects by itself. The first connected extension is paired; no code to type.

Optional: to let Side name your work groups with Claude, put your key in `.env.local` at the repo root. This file is git-ignored and is read only by the app's main process.

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, Side groups tabs with its built-in rules.

Drag sidy up or down the right edge to move it; Side remembers the spot after a relaunch. A click that doesn't move still opens Mini.

Keyboard: **Control+Option+S** hides sidy completely and brings it back. Clicking Side in the Dock also brings it back.

## Using it

1. **First run.** Once Chrome is connected, the setup window shows how sidy would fold the tabs you have open right now; nothing changes yet. **Meet sidy** hands over to sidy at the right edge of your screen.
2. **Set Aside.** Click sidy, then **Set aside today**. Every group folds by default; pick **Close** on a group only after you've seen its tab list. One click confirms. Side saves first, then asks Chrome, and reports only what Chrome confirmed. **Undo** brings everything back. One optional line answers *What are you most curious about tomorrow?*
3. **One more hour.** Not stopping yet? Side won't stop you. It tells you how long you'd sleep if you stopped now, closes nothing, and checks in exactly once at the time you pick.
4. **Be Beside.** sidy stays tucked in (eyes only) and quiet. It speaks first only when you come back (launching Side, waking or unlocking your computer, or touching the keyboard after 15 minutes away), at most once an hour, never in quiet hours or focus. It may stretch on unlock, whistle when a video starts, or nod to music: once, then still. Turn reactions off in Settings; Reduce Motion turns them off too.
5. **Step Inside.** The next time, sidy offers one step with **Step inside** or **Rest today**. Step inside opens the page where you stopped and marks the spot with *You stopped here*. After three days away it is still one step, and it never counts what you "missed".
6. **Desktop apps.** In **Settings → Connections → Desktop apps**, turn on the apps sidy may open a file in: Word, Excel, PowerPoint and Photoshop, as found on this computer (all off by default). Mini then lists them under **Desktop apps**. Wrap up shows **Files saved today** apart from your tabs and closes none of them; the next day's step can open that file in its app, for example Excel at the last filled cell, Word at the end, or PowerPoint on the last slide. sidy reads only file names and when you last used them, never what's inside.
7. **Calendar.** Also in Connections, off by default. The first time you turn it on, macOS asks for permission. sidy then reads only when tomorrow's first event starts and how many events are left today, never a title, place or attendee, and never creates or changes an event. With it on, **One more hour** counts to tomorrow's first event instead of your wake-up time. If macOS said no, the row says where to allow it.
8. **Ask sidy.** In Mini, type one line (*I'm done for today*). sidy does at most one of seven fixed things, the same as its own buttons; Set aside only opens the preview. Anything else gets a fixed answer: the seven buttons, or a search phrase for a how-to question.
9. **By your side.** **Open Side** (from Mini) shows Today, History, Excluded sites, What Side saw and Settings. **Settings → Language** switches every Side screen between English and Korean; Claude then names groups and answers in that language too (English is the default). Hide sidy with **Control+Option+S**; the same keys or the Dock bring it back.

## What Side reads, stores and sends

**Reads.** For tabs in normal Chrome windows, Side reads the tab title and URL. On a short list of sites it also reads where you were reading: the scroll offset, and on some pages a short visible sentence. It skips incognito windows, browser pages and any site you add to Excluded sites. It never captures your screen.

With **Calendar** on, Side reads only the start time of tomorrow's first event and how many events are left today. Titles, places and attendees are never read. With **Desktop apps** on, it reads the names and last-used times of files in the apps you turned on, never their contents.

**Stores.** Everything stays in one file on this computer: `~/Library/Application Support/Side/side-data.json`.

**Sends.** By default, Side sends to Anthropic's API (Claude): **tab titles** with temporary ids to group and name your work; your set-aside **group names** to suggest a question for tomorrow; **your one line** with those titles to pick the next morning's step; once you have three or more steps, **your step counts** (numbers only) for the By your side sentence; with desktop apps turned on, **file names** (no folders) of files you saved today, to pick the next step; and **the line you type in Ask sidy**, to pick one action. It never sends URLs, folders, page text, file contents or excluded sites, and you can turn this off in Settings so everything is done locally with simple rules. Anonymous usage counts (numbers only, no text) are **off** unless you turn them on.

Main → **What Side saw** lists what Side read, what it skipped and what it sent.

## Real vs. demo

| Real | Demo clock |
|---|---|
| Your actual Chrome tabs, groups, closing and Undo | `SIDE_DEMO=night npm start` makes Side's own clock read 1:30 AM tonight |
| Reading position captured and restored in the page | `SIDE_DEMO=next-day npm start` makes it read the next evening |
| Quitting and relaunching the app | `SIDE_DEMO=three-days npm start` makes it read three days later |
| Every number on the Main screen comes from local records | `SIDE_DEMO=reset npm start` returns to real time |

The demo clock moves only Side's own clock and never your system clock. The video says where it was used.

Demo helpers:

- `node scripts/demo/open-tabs.mjs` opens 26 real public tabs across four pieces of work. Add `--dry-run` to only print them.
- `node scripts/demo/reset.mjs --yes` deletes Side's local data file for a fresh run. Quit the app first.

## Develop

```bash
npm test             # unit + integration tests (Chrome APIs are faked)
npm run typecheck
npm run build
```

Layout:

- `packages/shared`: data types and the validated message format
- `apps/desktop`: the Electron app
  - `src/core`: pure logic (grouping, steps, when sidy speaks)
  - `src/main`: data file, bridge, services, windows
- `apps/extension`: the MV3 extension (tabs, groups, Undo journal, reading position)
- `web/waitlist`: Vercel functions for the waitlist and the opt-in anonymous counts

Manual checks that need a real screen are in `docs/manual-check.md`.

## Known limits

- **Full screen.** sidy shows over full-screen apps through a macOS panel window. If your macOS version does not allow that, sidy stays on top of normal windows only.
- **Check-ins.** A check-in you set ("One more hour") cannot fire while the app is quit or the computer is asleep. It appears when you come back.
- **Reading position.** It is captured on the built-in list of work sites. Google Docs and Notion are restored by the scroll offset of their inner reading area, not cursor position, and Google Docs draws text on a canvas, so the sentence fallback does not apply there. Inner-scrolling pages are covered by tests; the real-Chrome checks for this build used ordinary pages (Wikipedia), so check one of your own Docs.
- **Pairing.** If you load the extension from a different folder, Chrome gives it a new id, so it pairs as a new extension.
- **Desktop apps.** Checked on this Mac with Excel, Word and PowerPoint (the last filled cell, the end, the last slide). Other apps only open the file, never a spot inside it, and sidy says so. The first time, macOS asks to let your terminal control the app; if you say no, the file still opens. Reactions hear sound from Chrome tabs only.
- **"You stopped here".** The mark appears only on sites Side may read (the built-in list) and only when the spot was confirmed. Otherwise the page opens and sidy says it could not find the exact spot.
- **Right after waking or relaunching.** The extension may need a few seconds to reconnect; Step inside waits up to ten seconds, then says Chrome is not connected.

## Next

- Voice input for the line for tomorrow
- Detailed statistics
- Personalization (sidy styles) and rewards for coming back
- Claude Code and IDE integration: steps that open a file at a line, or re-run your last command
- Results prepared in advance (step stage 2), so the first thing you see is already done

## License

MIT
