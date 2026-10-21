# Studio bar

The studio bar (top of the window) lists registered studios. A hard cap keeps the layout intact on small windows.

- At most **5** studios are shown at once. The default is 5.
- Change it in **Settings > Appearance > Studios shown in the bar** (1 to 5). Values outside 1 to 5 are clamped; the stored value is an integer (`uiPrefs.maxStudios`).
- Studios beyond the limit move to the **More** menu at the end of the bar. Picking one switches to it.
- The active studio always stays in the bar. If it is not among the first N, it replaces the last visible one. Order follows the registry order.
- Logic: `src/lib/studios/visible.ts` (`splitStudios`), tests in `visible.test.ts`.
