# Side: 90-second demo video script

**Four beats: Set Aside · Be Beside · Step Inside · By your side.** The order is the timeline: stop at night (Set Aside), sidy stays quiet while you are away (Be Beside), the next day one step takes you back in (Step Inside), and over days the record of what worked builds up (By your side).

- **Screen recording only.** No mockups and no motion graphics: real Chrome tabs, the real app, real clicks. Editing is limited to cuts, captions, and a slow zoom toward sidy.
- **Ending.** The video ends on the next-day step. Tidying the tabs is the middle scene, not the ending.
- **Demo clock.** The night and the next day come from Side's demo clock, which moves only Side's own clock and never the system clock. The last card says so in small text, and the README says it too.

## The 90 seconds

| # | Time | Beat | On screen (what you do) | sidy / screen text | Narration | Real / demo clock |
|---|---|---|---|---|---|---|
| 1 | 0–10 s (10) | The problem | A black card with one sentence, then Chrome with 26+ tabs. sidy peeks from the right edge, eyes only. | (none) | "Some nights I can't stop. Most mornings I can't start." | Real tabs |
| 2 | 10–35 s (25) | Set Aside | Click sidy → Mini → **One more hour** → pick **30 min**. Cut. Then **Done — set aside now**. The Wrap up preview shows the groups and the tabs that stay, with reasons. Click **Set aside N tabs** → "Checking with Chrome…" → the tabs fold into named Chrome groups. Write one line for tomorrow and click **Save**. | "Sure. Keep going." with one fact line (the time left before your wake-up time) · "N tabs set aside in M groups. K still open. Chrome confirmed." · "What are you most curious about tomorrow?" | "Set aside. When I stop, Side takes the tabs and the loose thoughts, plus one line for tomorrow." | Demo clock (night), real tabs, real folding |
| 3 | 35–50 s (15) | Be Beside | The folded tab bar at night. sidy at the edge with eyes only and no bubble. Hover to show it slide out, then move away. Card: "Next evening". | (no bubble) | "Be beside. All night and all day, it says nothing. Nothing piles up, not even after three days." | Demo clock (night), real app |
| 4 | 50–70 s (20) | Step Inside | A YouTube video plays in front. Side relaunches with the next-day clock, and one bubble appears. Click **Step inside**. The doc from last night opens at the paragraph, marked "You stopped here". Click into it and type a sentence. | "Yesterday you asked: …" + the work name · **Step inside** / **Rest today** · "You stopped here" | "Step inside. Not a plan. One tiny step that's already open." | Real relaunch, real reading position, demo clock (next day) |
| 5 | 70–90 s (20) | By your side | Click sidy → **Open Side**. Main/Today shows the next step on top, the real counts under it, and the By your side sentence. End card: the four beats, then the waitlist QR card. | "Set aside · Be beside · Step inside · By your side" | "By your side. It learns which steps get you started. Planners tell you what to do. Side gets you started." | Real counts from your own use |

Check: the durations add up to 90 s (10 + 25 + 15 + 20 + 20).

## When sidy speaks (read this before recording)

sidy speaks first only at a return moment:
- the app starts
- the Mac wakes or the screen is unlocked
- you type or click again after 15+ minutes idle

It speaks at most once an hour, never while hidden, in quiet hours or in focus, and never after **Rest today**. The check-in you pick under **One more hour** fires exactly once at that time. Plan the cuts around these rules instead of waiting on the clock. That is why scene 4 relaunches the app: the relaunch is a real return moment.

## Before recording

1. Quit Side if it is running. Then reset its local data for a clean run:
   ```bash
   node scripts/demo/reset.mjs --yes
   ```
2. Set up Chrome for recording:
   - Use a fresh Chrome profile with English as the display language (`chrome://settings/languages`).
   - Hide the bookmarks bar.
   - Make sure no personal tabs or account pictures are visible.
3. Load the extension:
   - Open `chrome://extensions` and turn on Developer mode.
   - Click **Load unpacked** and choose `apps/extension/dist`.
4. Open the demo tabs: 26 real public tabs across four works, plus your Google Doc:
   ```bash
   node scripts/demo/open-tabs.mjs "https://docs.google.com/document/d/<your-doc>/edit"
   ```
   Scroll the doc to a paragraph in the middle and click into it, then switch to another tab. Side records your reading position when you leave a tab.
5. Set up the recording:
   - Make sidy **Large** for the recording (Main → Settings → sidy size).
   - Record with ⌘⇧5 → *Record Selected Portion*. Use the same region for every cut so the cuts line up.

## Recording each cut

**Cut 1, the problem (real tabs).** Record 5 seconds of the full tab bar with sidy quiet at the edge. The black sentence card is added in editing.

**Cut 2, Set Aside (night).**
```bash
SIDE_DEMO=night npm start
```
1. Click sidy, then **One more hour** in Mini.
2. sidy answers with respect and one fact line. Pick **30 min**. Nothing closes.
3. Cut here, then click **Done — set aside now**.
4. In the preview, leave every group on **Fold**. Click **Set aside N tabs**.
5. Wait for "Chrome confirmed." In the result, write one line, for example "Why does the retry need jitter?", and click **Save**.

**Cut 3, Be Beside (night).** Keep recording the folded tab bar for 5 seconds with no bubble. Hover sidy so it slides out until the blue side shows, then move away. Optionally show Main → History to show that nothing is counted as missed.

**Cut 4, Step Inside (next day).**
1. Quit Side from the Side menu, then **Quit**.
2. In Chrome, open a YouTube video and let it play in front.
3. Relaunch Side with the next-day clock:
   ```bash
   SIDE_DEMO=next-day npm start
   ```
4. One bubble appears. It brings back last night's line and the work it points to.
5. Click **Step inside**. Chrome brings the doc to the front at the paragraph, marked "You stopped here".
6. Click into the doc and type a sentence.

For a "three days later" take, use `SIDE_DEMO=three-days npm start`. The bubble then names the real date of the last wrap-up, and there is still one step and no count of days missed.

**Cut 5, By your side.** Keep working in the doc for 10 minutes; Side judges "still working" at ten minutes. Then:
1. Click sidy, then **Open Side**.
2. Record Main → Today: the next step on top, the counts under it and the By your side sentence.

The counts are real: they come from this run's own records.

**End cards (editing).**
- Card 1: "Set aside. Be beside. Step inside. By your side."
- Card 2: the waitlist QR (`docs/assets/waitlist-qr.png`) and its address, with the small line "Night and next day shown with Side's demo clock."

## Voice and captions

Record the narration above separately, for example with QuickTime, and lay it over the cuts. Add the same words as captions for viewers watching without sound. Each beat name appears as a one-line lower caption when its beat starts.

## Real vs. demo clock

| Real | Demo clock |
|---|---|
| The Chrome tabs, folding into groups, closing and Undo | `SIDE_DEMO=night` makes Side read 1:30 AM tonight |
| The reading position captured and restored in the doc | `SIDE_DEMO=next-day` makes it read the next evening |
| Quitting and relaunching the app | `SIDE_DEMO=three-days` makes it read three days later |
| Every number in Main | `SIDE_DEMO=reset` returns to real time |
