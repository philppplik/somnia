# Present in Slides Studio

Open a PPTX, then choose **Present** in the header. The main button starts at the
current slide. The split-button menu offers **Present from start**, **Save
presentation copy**, and **Publish**. Publish remains a web-project deployment
command, not a presentation hosting service. There is no PDF export menu entry.

Present shows static images from the existing slide renderer. It does not play
animations, transitions, audio or video. Fonts and complex objects can differ
from PowerPoint, so check the deck before presenting it to an audience.

## Controls

- F5: present from the current slide. Shift+F5: present from the first slide.
- Right, Space or PageDown: next slide. Left or PageUp: previous slide.
- Home / End: first / last slide.
- Type a one-based slide number, then Enter: jump. Invalid numbers stay put.
- B: toggle a black screen. Navigation restores the slide image.
- Click: next slide. Click within the left 80 pixels: previous slide.
- Escape or Exit presentation: return to the editor.

Move the pointer to reveal the control bar. It hides after 2.2 seconds, except
while a control has keyboard focus. Tab cycles through the available controls.
Slide changes are announced to assistive technology. Presentation rendering
has no motion, including when reduced motion is enabled. Other studio shortcuts
are blocked while presenting; the hidden editor is inert.

The view fills the browser window and requests browser/OS fullscreen during the
initial user action. If the platform denies fullscreen, full-window presentation
still works. Leaving browser fullscreen also exits the presentation. The editor
keeps the last shown slide and keyboard focus returns to the entry control.

## Implementation and limits

`slides.present` takes optional `{fromStart: boolean}`; no parameters means the
current slide. `slides.present.fromStart` is the menu/Shift+F5 adapter.
`slides.present.exit` remains enabled while rendering. All three commands are
interactive-only and registered with the Slides canvas. The Slides manifest
uses `shell.header.heroAction`, matching the shared `HeroActionDef` contract.
The existing canvas context reports `mode: present` and the current slide.

Images render for the screen's device-pixel size, capped below the engine's
8 MP / 4096 pixel limit. Current and next images are cached, with the next slide
pre-rendered. Navigation uses `slides.showSlide`; cache URLs are revoked on exit,
source disposal and edits. No presentation action changes deck content.

## Verification

Run `npx tsx --test src/lib/slides/*.test.ts src/components/slides/*.test.tsx`
and the command/layer checks from `phase1`. For the local browser harness, run
`node scripts/slides-present-preview.mjs` (set `CHROME_PATH` if needed).

The committed harness uses a clearly labelled renderer double. It checks the
real session, shared header hero slot, commands, screen-size render requests,
keyboard/mouse controls, fullscreen entry/exit/denial, reduced motion, control
visibility and focus restoration. It is not evidence of native Tauri fullscreen
or production WASM rendering. Generated Slides WASM, projector output and
Windows native behavior must be verified on a built app.
