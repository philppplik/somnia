# Sound loop from output range (D4)

Status: implementation slice, headless-tested. No new dependency.

## What changed

The loop toggle now has free bounds: with an output range selected (C3, e.g. a marker pair), toggling Loop makes the loop exactly that range; without a selection it loops the whole session as before, and an active loop toggles off. The transport button shows the active bounds in seconds, and a hint states the range-follows behavior. Playback wrapping, keyboard playhead and loop.set validation are unchanged; the loop remains session data (undoable, persisted in the JSON document).

## Honest limits

- Loop bounds change only through the toggle/range selection; there is no drag-created loop on the ruler.
- Playback looping still depends on the HTML audio element's time update granularity, not sample-accurate scheduling.

Roadmap-Delta D4: loop regions with free bounds via the output-range selection. No new playback engine behavior.
