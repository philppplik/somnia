/**
 * Motion safety for previews that do not run page scripts (design canvas, live preview with scripts off,
 * or live preview when a CDN animation library was blocked).
 *
 * Root cause of "animated pages show nothing": pages hide content in CSS (opacity:0, visibility:hidden,
 * translateY, clip-path) and rely on JS (AOS, GSAP, IntersectionObserver reveal classes) or on delayed
 * keyframes (animation-delay + fill-mode) to show it. Previews strip scripts and have no network, so the
 * "show" step never happens and the page stays blank.
 *
 * Fix: (1) finish every CSS animation/transition immediately in its end state, and drop scroll-driven timelines;
 * (2) force known reveal-on-scroll hooks visible. Only injected into render copies, never into the user's source.
 */
export const SETTLE_MOTION_CSS = '*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:forwards!important;animation-timeline:auto!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';
export const REVEAL_SELECTORS = ['[data-aos]','[data-animate]','[data-reveal]','[data-scroll]','[data-sal]','[data-wow-delay]','[data-w-id]','[data-scrollreveal]','[data-os-animation]','.aos-init','.reveal','.reveal-on-scroll','.scroll-reveal','.scroll-animate','.animate-on-scroll','.animate-in','.fade-in','.fade-up','.fade-in-up','.fade-left','.fade-right','.fadeIn','.fadeInUp','.fadeInDown','.fadeInLeft','.fadeInRight','.slide-in','.slide-up','.zoom-in','.wow','.js-reveal','.js-animate','.sr','.is-hidden-until-visible','.will-reveal','.lazy-reveal','.gsap-hidden'];
export const REVEAL_CSS = REVEAL_SELECTORS.join(',') + '{opacity:1!important;visibility:visible!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;filter:none!important;clip-path:none!important}';
/** Appends a style element (last in <head>, so it wins) with the motion-safe rules. */
export function injectMotionSafe(doc: Document, opts: { settle: boolean; reveal: boolean }): void {
  const css = (opts.settle ? SETTLE_MOTION_CSS : '') + (opts.reveal ? REVEAL_CSS : '');
  if (!css) return;
  const style = doc.createElement('style');
  style.setAttribute('data-somnia-motion-safe', '');
  style.textContent = css;
  (doc.head ?? doc.documentElement).append(style);
}
