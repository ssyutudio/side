# Side — mockup direction (11/9, @ux)

Mockups: `scene.html?s=<state>` is the click-through (every button goes somewhere; dashed bar bottom-left is mockup-only).
Boards: peek · mini · wrapup · main · onboarding · sidy · waitlist (`.html` → `.war-room-state/shots/mockup-<name>.png`).
Serve the folder over http to open them (`python3 -m http.server` in this folder); `file://` drops the `?s=` query in the shot tool.

## Tokens (contrast measured, WCAG relative luminance)
| token | value | on | ratio |
|---|---|---|---|
| ink | #1E2025 | canvas #F2F3F5 | 14.68 |
| ink-2 | #5B6168 | canvas #F2F3F5 | 5.64 |
| blue (the one action colour = sidy's blue side) | #3B54E7 | white | 5.82 |
| blue-ink (labels on blue-soft) | #3A47C9 | #EEF1FD | 6.37 |
| warn | #8A5300 | #FFF4E0 | 5.81 |
| ok | #1F7A5C | white | 5.25 |
Type: Pretendard; sizes 13 meta · 15–16 body · 17 bubble · 19–20 card titles · 26–28 headings. Nothing under 13.
Icons: Tossface, only in Mini quick actions and Main sidebar.

## Signature
sidy's blue side is the product's only action colour, and the Mini/Wrap up panel carries a 6 px blue right edge — the panel reads as sidy opening its blue side. One filled (blue) button per state.

## Changed from the 11/8 direction (on purpose)
- Accent green → sidy blue, so the character and the action are one thing.
- Wrap up groups each have Fold (default) / Close — the GOAL's "close only groups the user confirmed" without a second screen.
- Return bubble: Step inside + Rest today at equal size; × is Not now.
- Mini counts "Tabs in Chrome 38" and "Set aside 31 in 3 groups" separately (folded tabs are still open tabs).
