
## RGB readout (P86)

Hovering the stage shows a small chip (bottom right) with the rendered
pixel's RGB values in percent under the cursor — the Lightroom
histogram readout, computed with the existing `pixelAt` helper on the
displayed frame (original included, while compare is held). Leaving the
stage hides the chip; crop mode suppresses it so the overlay stays
clean.

Coverage: `photos-zoom.spec.ts` gains a light/dark leg that hovers the
stage center on the gradient proof frame, asserts the `R n G n B n%`
format and the plausible range (center ~51%), screenshots, and verifies
the chip disappears when the pointer leaves the stage.
