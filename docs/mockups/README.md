# Side screen mockups (made during the event, 11/9)

Static HTML mockups the room made and the Director approved before the screens were built. They are not the product; the app's screens live in `apps/desktop/src/renderer`.

- `scene.html?s=<state>` runs the click-through flow. Serve the folder over http (`python3 -m http.server`) to open it.
- Boards (`peek.html`, `mini.html`, `wrapup.html`, `main.html`, `onboarding.html`, `sidy.html`, `sidy-reactions.html`, `wrapup-chips.html`, `waitlist.html`) show frozen states; captures are in `shots/`.
- Tokens and decisions: `direction-1109.md`.

Approved with two Director notes that the build follows instead of the mockup:

1. At the edge there is only sidy. The white rounded panel drawn behind sidy in some boards is not part of the product.
2. When quiet, sidy is tucked in further, so its blue side is not visible. On mouse-over it slides out until the blue side shows.
