# Manual checks (need a real screen and real Chrome)

The room runs the unit and integration tests, headless captures of every screen state, and a full rehearsal of the app driven over the DevTools protocol, with the extension logic running on a fake Chrome. The checks below need a real screen and real Chrome, so a person runs them and pastes the output or captures back. Nothing here is marked done without that evidence.

## 0. Start clean

```bash
npm install
node scripts/demo/reset.mjs --yes      # forget earlier test runs (quit Side first)
npm start                              # Side starts; a "Set up Side" window opens on first launch
```

Load the extension once: `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`. After pulling new code, run `npm install` again and press the extension's reload button in `chrome://extensions`.

## AC1 · sidy on the edge, over a full-screen app

1. With Side running, make Chrome full screen (Ctrl+Cmd+F).
2. Look at the right edge: sidy is tucked in, eyes only, with no blue and nothing behind it. Hover over it: it slides out and the blue side shows.
3. `sleep 3; screencapture -x ~/Desktop/sidy-fs.png` → paste the capture.
4. Click next to sidy: the click reaches Chrome. Type in Chrome's address bar while sidy talks: typing is not interrupted.

## AC2 · Connection

1. Turn the Side extension **off** in `chrome://extensions`, then `node scripts/demo/reset.mjs --yes` and `npm start`. The setup window shows "Not connected yet." and **Check again**.
2. Turn the extension **on**, then press **Check again**. It changes to "Side is connected" and shows how your real tabs would fold. Press **Meet sidy**. sidy's first bubble counts your tabs.
3. Quit Chrome, wait 10 seconds, and reopen it. Mini shows "Chrome not connected", then "Chrome connected" again with no action from you.

## AC3 · Set Aside (no tab is lost)

1. `node scripts/demo/open-tabs.mjs` opens 26 real tabs. Add a Google Doc you own as the last argument to include an inner-scrolling page.
2. Click sidy. In Mini, **Tabs in Chrome** equals Chrome's tab count. Close one tab: the number follows.
3. Press **Set aside today**. Groups fold by default. Pick **Close** on one group: its tab list opens and the button says **Fold N · Close M**. Confirm once.
4. Chrome now shows named, collapsed groups. Only that one group's tabs are closed. The active tab, pinned tabs, tabs playing sound and excluded sites stay, each with its reason.
5. Press **Undo · bring back N tabs**: the groups unfold and the closed tabs come back, once each.

## AC4 · Step Inside after a relaunch (and after three days)

1. Scroll halfway down one of the work tabs (Wikipedia, GitHub, MDN or your Google Doc). Switch tabs, then run Set aside today and type one line for tomorrow → **Save**.
2. Quit Side (Cmd+Q from the Dock menu), then `SIDE_DEMO=next-day npm start`. Before you touch anything, sidy's bubble shows your line and the step; the browser does not open on its own.
3. Press **Step inside**. The same page opens at the same spot, with a blue **You stopped here** mark for about 8 seconds.
4. Quit, then `SIDE_DEMO=three-days npm start`. There is still one step, labelled with the real date, and no count of missed days anywhere.

## AC5 · One more hour and reactions

1. Main → Settings → Demo clock → **Tonight**. In Mini, choose **One more hour**: it shows the time left before your wake-up, closes nothing, and offers 30 min or 1 hour. Pick **30 min** → **Check in at …**.
2. Demo clock → **+30 min**. Within 30 seconds one bubble asks **Set aside / Keep going / Not today**, exactly once. **Set aside** opens the Wrap up preview.
3. Reactions: lock and unlock the computer (sidy stretches once), start a YouTube video (sidy whistles once), start music on Spotify or YouTube Music (sidy nods once). Turn on System Settings → Accessibility → Display → Reduce motion: sidy stays still.

## AC6 · Mini, Main, exclusions, hiding

1. Click sidy → **Open Side** → Main: count the clicks (target 3 or fewer). Main's numbers match Mini's.
2. Main → Excluded sites → add `en.wikipedia.org`, then Wrap up. What Side saw shows it as skipped, by count only. Check the data file: `grep -c wikipedia ~/Library/Application\ Support/Side/side-data.json` → 0 for tabs from after the exclusion.
3. Press Control+Option+S: a toast, then no sidy at all (`screencapture -x ~/Desktop/sidy-hidden.png`). Press it again, or click Side in the Dock, and sidy comes back.
4. Settings → sidy size → Large: sidy changes at once. Quit and relaunch: it is still Large.
5. Drag sidy up to the top of the screen, then down to the bottom: it follows the pointer and stays whole on screen; a bubble or Mini opened there stays on screen too. Quit and relaunch: sidy is where you left it. A plain click still opens Mini.
6. With 9 or more groups, open Wrap up: the list scrolls inside Mini and the Set aside button stays in view. Drag a tab toward the bottom edge of the list: the list scrolls to the last group.
7. In Mini's tomorrow-line field, Cmd+C and Cmd+V work.
8. Main → Settings → Language → Korean: Main, Mini, sidy's bubble and toasts switch at once, and the next Wrap up names groups in Korean. Step inside shows the Korean page marker. Back to English: everything switches back.

## AC8 · Waitlist and the full video flow

1. Scan `docs/assets/waitlist-qr.png` with a phone: https://side-waitlist.vercel.app opens. Sign up: the count rises by one. Sign up again with the same email: still one row.
2. Run the video flow (`docs/video-script.md`) three times in a row with real tabs and a real relaunch.

Paste the terminal lines and captures for each item.
