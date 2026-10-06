# Glass (transparency and blur)

Glass makes the app window translucent: the desktop shines through the window
frame and panels, softened by blur. You find it under **Settings > Appearance >
Glass**. It is part of the Appearance settings, so every change applies live,
is one undo step, and is saved automatically.

Glass is active when **App background** is set to **Glass** and your system
supports it (Windows and macOS). On Linux without compositing, in the web app,
and while a high contrast theme is on, surfaces stay solid and your Glass
values stay saved for later.

## Opacity

One slider, 0-100 % in steps of 1, with a typeable number field next to it.
"0 % = fully transparent", 100 % is solid.

The slider drives every enabled scope at once, scaled so one value gives a
sensible result everywhere:

- **Window frame** gets exactly the opacity you set.
- **Panels** get your opacity plus 20 percentage points (capped at 100 %), so
  content areas stay a little more solid than the frame.
- **Code editor** gets your opacity, but never below the readability floor
  described under warnings.

With the default 68 % this reproduces the classic Somnia look: 68 % frame,
88 % panels.

## Blur

A second slider sets the blur strength from 0 to 40 px in steps of 1. Blur
softens what is visible through translucent surfaces. Above 24 px a small note
warns that high blur can reduce performance on older GPUs; the value is never
capped automatically, not even in a maximized window.

Blur here softens what is inside the app. Blurring your desktop behind the
window is controlled by Windows and cannot be adjusted in Somnia. If your
system does not support `backdrop-filter` (for example Linux without
compositing), the blur slider is disabled with a "Not supported on this
system." note, and opacity still works.

## Apply glass to (scopes)

Three toggles choose where Glass applies:

- **Window frame** (default on): the outer app window.
- **Panels** (default on): sidebars, panels and other app surfaces.
- **Code editor** (default off): the editor background, gutter and current
  line.

A scope that is off stays fully opaque. The preview strip below the toggles
(gradient plus sample code) always shows the effect of your opacity and blur
values, even with the code editor toggle off, so you can judge the setting
before enabling it.

## Code editor readability

When the code editor scope is on, only the background becomes translucent.
Text, the caret and the selection always stay fully opaque, and the selection
remains clearly visible at every setting.

- Below 60 % opacity a non-modal warning appears: "Low contrast: code text
  may be hard to read at this opacity. Minimum recommended: 60 %." You can
  choose **Set to 60 %** to jump to the recommended minimum, or **Keep
  anyway** to keep your value. Keep anyway silences the warning until you
  change the opacity again.
- Below 55 %, Somnia measures the contrast of your theme's text colour
  against the panel colour (WCAG, over a neutral grey reference background).
  If it falls under 4.5:1, the code editor opacity is clamped to 55 % and you
  see "Code editor opacity is limited to 55 % to keep text readable." The
  floor applies only to the code editor; the window frame and panels may go
  all the way to 0 %. Theme colours that cannot be measured are never
  clamped and only get the warning.

All warnings are non-modal, announced to screen readers, and shown as icon
plus text, never as colour alone.

## System settings that override Glass

- **Transparency effects off / reduced transparency** in your operating
  system: a banner says "Your system has transparency effects turned off.
  Glass is disabled." Surfaces render solid, the sliders stay usable, and
  your values stay saved.
- **High contrast theme** in Somnia: the Glass section is disabled with a
  note; your values stay saved.
- **App background set to Solid**: the Glass section shows a note pointing
  you to the background setting.

## Corner radius

Next to Glass in Appearance, the **Outer corner radius** slider (0-25 px,
default 25) rounds the app frame and workspace panels. Controls and dialogs
keep their own corners. It works the same whether Glass is on or off.

## Reset and updates

**Reset to default** restores 68 % opacity, 24 px blur, window frame and
panels on, code editor off, and re-arms the low-contrast warning. Reset
affects only the Glass section and is undoable like every other settings
change.

After updating from an older version your look is unchanged: your previous
blur value is carried over and opacity starts at the default 68 %, which
matches the old fixed 68/88 appearance exactly.

To find Glass quickly, type any of these into the Settings search: glass,
transparency, opacity, blur, acrylic.

Technical details (CSS variables, storage keys, code): [../GLASS.md](../GLASS.md).
