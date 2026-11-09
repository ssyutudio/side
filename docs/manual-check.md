# Manual checks (need a real Mac, Chrome and screen)

The room runs unit tests and headless captures. These checks need the real desktop, so a person runs them and pastes the output or the capture back. Nothing here is marked done without that evidence.

## 0. Install

```bash
npm install          # also builds the extension into apps/extension/dist
npm start            # builds the desktop app and launches Side
```

## First card 1: sidy on the edge, over a full-screen app

1. `npm start`
2. In another terminal: `sleep 8; screencapture -x ~/Desktop/sidy-fs.png`
3. Within those 8 seconds, switch to Chrome and make it full screen (Ctrl+Cmd+F).
4. Look at `~/Desktop/sidy-fs.png`: a small shape should peek from the right edge, on top of full-screen Chrome.
5. Move the mouse over empty space next to the shape and click: the click should reach Chrome.
6. Type in Chrome's address bar while Side is running: typing must not be interrupted.
7. Press Control+Option+S: the shape disappears (zero sidy windows). Press it again, or click Side in the Dock: it comes back.

Room evidence so far: `.war-room-state/shots/card1-fullscreen.png`. The room started Side next to a throwaway full-screen window on this Mac and captured the screen. The shape showed at the right edge over the full-screen Space. Steps 3 to 7 with real Chrome still need a person.

If only the full-screen part fails, Side continues as an always-on-top window over normal windows, and README "Known limits" says so.

## First card 2: extension to app, one round trip

1. `npm start` (keep the terminal visible: Side logs there).
2. Chrome: open `chrome://extensions`, turn on Developer mode, click "Load unpacked", choose `apps/extension/dist` in this repo.
3. The terminal shows `[side] extension connected` and a `[side] report: N tabs ...` line. The Dock icon badge shows N.
4. Count Chrome's tabs (normal windows only). N should match.
5. Close one tab: the badge and the next report line drop by one.
6. Open a long page on one of the demo sites (for example, a Wikipedia article), scroll halfway, then switch to another tab. The terminal prints that host with `top=` greater than 0.
7. Do the same in a Google Doc (it scrolls an inner element, so `window.scrollY` stays 0). The terminal shows `docs.google.com element ... top=` greater than 0.
8. Quit Chrome, wait 10 seconds, and open it again. The terminal shows `disconnected`, then `connected` again with no action from you.

Paste the terminal lines from steps 3, 5, 6, 7 and 8.
