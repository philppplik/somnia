/**
 * Starter kit: curated, accessible, responsive components with variants, as plain library data.
 * Pure data and logic (no DOM, no storage). Safe to unit test in Node.
 *
 * Rules every block follows:
 * - No id attributes (inserting twice never trips the repeated-ID check).
 * - One root element; its own <style> sits inside it, scoped by a unique class prefix (sk-*), so the block
 *   works on any page without touching other CSS. Responsive via flex-wrap, grid auto-fit and one media query.
 * - Real landmarks and labels: <nav aria-label>, <footer>, sections use aria-label (aria-labelledby needs ids).
 *   Every form control sits inside a visible <label>, so no ids are needed. Text and buttons meet WCAG AA contrast.
 * - Visible focus ring on links, buttons and fields.
 */
import type {Component,Variant} from './componentSystem';
import {LIMITS} from './componentSystem';

const FOCUS='.sk-x a:focus-visible,.sk-x button:focus-visible,.sk-x input:focus-visible,.sk-x textarea:focus-visible,.sk-x select:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}';
const BASE='.sk-x{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a2e;line-height:1.5}.sk-x *,.sk-x *::before,.sk-x *::after{box-sizing:inherit}.sk-x a{color:#3730a3}.sk-btn{display:inline-block;padding:.65rem 1.1rem;border:2px solid #4338ca;border-radius:.5rem;background:#4338ca;color:#fff!important;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.sk-btn--ghost{background:#fff;color:#3730a3!important}';
export const css=(prefix:string,rules:string)=>`<style>${BASE.replace(/\.sk-x/g,'.'+prefix).replace(/\.sk-btn/g,'.'+prefix+' .sk-btn')}${FOCUS.replace(/\.sk-x/g,'.'+prefix)}${rules}</style>`;
export const variant=(id:string,name:string,html:string):Variant=>({id,name,html});
export const component=(id:string,name:string,variants:Variant[]):Component=>({id,name,variants,defaultVariantId:variants[0].id});

/** Local grey placeholder as an inline SVG data URI. No external request. */
export const ph=(w:number,h:number)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#e0e0ee"/><text x="50%" y="50%" fill="#55556b" font-family="sans-serif" font-size="${Math.round(h/10)}" text-anchor="middle" dominant-baseline="middle">${w} x ${h}</text></svg>`)}`;

// Navigation
export const navCss=(p:string)=>css(p,`.${p}{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1.5rem;padding:1rem 1.5rem;background:#fff;border-bottom:1px solid #d4d4e0}.${p} ul{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;margin:0;padding:0;list-style:none}.${p} a{text-decoration:none;font-weight:500;padding:.25rem 0}.${p} a:hover{text-decoration:underline}.${p} .sk-brand{font-weight:700;font-size:1.25rem;color:#1a1a2e}`);
export const NAV_SIMPLE=`<nav class="sk-nav sk-nav-simple" aria-label="Main">${navCss('sk-nav-simple')}<a class="sk-brand" href="#">Brand</a><ul><li><a href="#features">Features</a></li><li><a href="#pricing">Pricing</a></li><li><a href="#about">About</a></li><li><a href="#contact">Contact</a></li></ul></nav>`;
export const NAV_CTA=`<nav class="sk-nav sk-nav-cta" aria-label="Main">${navCss('sk-nav-cta')}<a class="sk-brand" href="#">Brand</a><ul><li><a href="#features">Features</a></li><li><a href="#pricing">Pricing</a></li><li><a href="#about">About</a></li><li><a class="sk-btn" href="#signup">Get started</a></li></ul></nav>`;

// Hero
export const heroCss=(p:string,extra:string)=>css(p,`.${p}{padding:4rem 1.5rem;background:#f5f5fb}.${p} h1{margin:0 0 1rem;font-size:clamp(2rem,5vw,3.25rem);line-height:1.15}.${p} p{margin:0 0 1.5rem;font-size:1.125rem;max-width:40rem}.${p} .sk-actions{display:flex;flex-wrap:wrap;gap:.75rem}${extra}`);
export const HERO_CENTER=`<section class="sk-hero sk-hero-center" aria-label="Introduction">${heroCss('sk-hero-center','.sk-hero-center{text-align:center}.sk-hero-center p{margin-left:auto;margin-right:auto}.sk-hero-center .sk-actions{justify-content:center}')}<h1>A clear headline that says what you do</h1><p>One or two sentences that explain the value in plain words.</p><div class="sk-actions"><a class="sk-btn" href="#signup">Get started</a><a class="sk-btn sk-btn--ghost" href="#features">Learn more</a></div></section>`;
export const HERO_SPLIT=`<section class="sk-hero sk-hero-split" aria-label="Introduction">${heroCss('sk-hero-split','.sk-hero-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr));gap:2rem;align-items:center}.sk-hero-split img{width:100%;height:auto;border-radius:.75rem;background:#e0e0ee}')}<div><h1>A clear headline that says what you do</h1><p>One or two sentences that explain the value in plain words.</p><div class="sk-actions"><a class="sk-btn" href="#signup">Get started</a><a class="sk-btn sk-btn--ghost" href="#features">Learn more</a></div></div><img src="${ph(640,400)}" width="640" height="400" alt="Describe the image here"></section>`;

// Card
export const cardCss=(p:string,extra='')=>css(p,`.${p}{max-width:24rem;border:1px solid #d4d4e0;border-radius:.75rem;background:#fff;overflow:hidden}.${p} .sk-body{padding:1.25rem}.${p} h2{margin:0 0 .5rem;font-size:1.25rem}.${p} p{margin:0 0 1rem}${extra}`);
export const CARD_BASIC=`<article class="sk-card sk-card-basic">${cardCss('sk-card-basic')}<div class="sk-body"><h2>Card title</h2><p>Short supporting text that describes this card.</p><a class="sk-btn" href="#">Read more</a></div></article>`;
export const CARD_IMAGE=`<article class="sk-card sk-card-image">${cardCss('sk-card-image','.sk-card-image img{display:block;width:100%;height:auto;background:#e0e0ee}')}<img src="${ph(480,270)}" width="480" height="270" alt="Describe the image here"><div class="sk-body"><h2>Card title</h2><p>Short supporting text that describes this card.</p><a class="sk-btn" href="#">Read more</a></div></article>`;

// Pricing
export const priceCss=(p:string,extra='')=>css(p,`.${p}{padding:3rem 1.5rem;background:#fff}.${p} h2{margin:0 0 2rem;text-align:center;font-size:2rem}.${p} .sk-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1.25rem;max-width:62rem;margin:0 auto}.${p} .sk-plan{display:flex;flex-direction:column;gap:.75rem;padding:1.5rem;border:1px solid #d4d4e0;border-radius:.75rem}.${p} .sk-plan h3{margin:0;font-size:1.25rem}.${p} .sk-price{margin:0;font-size:2rem;font-weight:700}.${p} ul{margin:0;padding-left:1.25rem;flex:1}${extra}`);
export const plan=(n:string,price:string,cta:string)=>`<div class="sk-plan"><h3>${n}</h3><p class="sk-price">${price}<span> / month</span></p><ul><li>Feature one</li><li>Feature two</li><li>Feature three</li></ul><a class="sk-btn" href="#signup">${cta}</a></div>`;
export const PRICE_3=`<section class="sk-pricing sk-pricing-three" aria-label="Pricing">${priceCss('sk-pricing-three')}<h2>Simple pricing</h2><div class="sk-plans">${plan('Starter','$9','Choose Starter')}${plan('Pro','$29','Choose Pro')}${plan('Team','$79','Choose Team')}</div></section>`;
export const PRICE_1=`<section class="sk-pricing sk-pricing-single" aria-label="Pricing">${priceCss('sk-pricing-single','.sk-pricing-single .sk-plans{max-width:24rem;grid-template-columns:1fr}')}<h2>One plan, everything included</h2><div class="sk-plans">${plan('All access','$19','Get started')}</div></section>`;

// Footer
export const footCss=(p:string,extra:string)=>css(p,`.${p}{padding:2rem 1.5rem;background:#1a1a2e;color:#f5f5fb}.${p} a{color:#c7d2fe}.${p} p{margin:0}${extra}`);
export const FOOT_SIMPLE=`<footer class="sk-footer sk-footer-simple">${footCss('sk-footer-simple','.sk-footer-simple{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.75rem 1.5rem}.sk-footer-simple ul{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;margin:0;padding:0;list-style:none}')}<p>&copy; 2026 Brand. All rights reserved.</p><nav aria-label="Footer"><ul><li><a href="#privacy">Privacy</a></li><li><a href="#terms">Terms</a></li><li><a href="#contact">Contact</a></li></ul></nav></footer>`;
export const col=(h:string,l:string[])=>`<nav aria-label="${h}"><h2>${h}</h2><ul>${l.map(x=>`<li><a href="#">${x}</a></li>`).join('')}</ul></nav>`;
export const FOOT_COLS=`<footer class="sk-footer sk-footer-columns">${footCss('sk-footer-columns','.sk-footer-columns .sk-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1.5rem;max-width:62rem;margin:0 auto 1.5rem}.sk-footer-columns h2{margin:0 0 .5rem;font-size:1rem}.sk-footer-columns ul{margin:0;padding:0;list-style:none;display:grid;gap:.25rem}.sk-footer-columns p{text-align:center}')}<div class="sk-cols">${col('Product',['Features','Pricing','Changelog'])}${col('Company',['About','Careers','Contact'])}${col('Legal',['Privacy','Terms'])}</div><p>&copy; 2026 Brand. All rights reserved.</p></footer>`;

// Forms
export const formCss=(p:string,extra='')=>css(p,`.${p}{max-width:30rem;padding:1.5rem;border:1px solid #d4d4e0;border-radius:.75rem;background:#fff}.${p} h2{margin:0 0 1rem;font-size:1.5rem}.${p} .sk-field{display:grid;gap:.25rem;margin-bottom:1rem}.${p} .sk-field span{font-weight:600}.${p} input,.${p} textarea{width:100%;padding:.6rem .75rem;border:1px solid #6b6b80;border-radius:.4rem;font:inherit;color:inherit;background:#fff}${extra}`);
export const FORM_CONTACT=`<form class="sk-form sk-form-contact" action="#" method="post">${formCss('sk-form-contact')}<h2>Contact us</h2><label class="sk-field"><span>Name</span><input type="text" name="name" autocomplete="name" required></label><label class="sk-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="sk-field"><span>Message</span><textarea name="message" rows="5" required></textarea></label><button class="sk-btn" type="submit">Send message</button></form>`;
export const FORM_NEWS=`<form class="sk-form sk-form-newsletter" action="#" method="post">${formCss('sk-form-newsletter','.sk-form-newsletter .sk-row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end}.sk-form-newsletter .sk-field{flex:1 1 14rem;margin:0}')}<h2>Stay in the loop</h2><div class="sk-row"><label class="sk-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><button class="sk-btn" type="submit">Subscribe</button></div></form>`;

const kit:Component[]=[
 component('starter-navigation','Starter Navigation',[variant('starter-navigation-simple','Simple',NAV_SIMPLE),variant('starter-navigation-cta','With button',NAV_CTA)]),
 component('starter-hero','Starter Hero',[variant('starter-hero-center','Centered',HERO_CENTER),variant('starter-hero-split','Split with image',HERO_SPLIT)]),
 component('starter-card','Starter Card',[variant('starter-card-basic','Basic',CARD_BASIC),variant('starter-card-image','Image on top',CARD_IMAGE)]),
 component('starter-pricing','Starter Pricing',[variant('starter-pricing-three','Three plans',PRICE_3),variant('starter-pricing-single','Single plan',PRICE_1)]),
 component('starter-footer','Starter Footer',[variant('starter-footer-simple','Simple',FOOT_SIMPLE),variant('starter-footer-columns','Columns',FOOT_COLS)]),
 component('starter-form','Starter Form',[variant('starter-form-contact','Contact',FORM_CONTACT),variant('starter-form-newsletter','Newsletter',FORM_NEWS)]),
];
/** Fresh copy of the kit (callers may mutate the result). */
export function starterKit():Component[]{return kit.map(c=>({...c,variants:c.variants.map(v=>({...v}))}));}
export const STARTER_IDS:readonly string[]=kit.map(c=>c.id);
/**
 * Adds starter components that are not in the library yet (matched by id or by name, case-insensitive).
 * Never changes or removes existing entries, so a user's edited copy is kept. Stops at the library limit.
 * Returns the new list and the names that were added.
 */
export function addStarterKit(list:Component[]):{list:Component[];added:string[]}{
 const out=[...list],added:string[]=[];
 for(const c of starterKit()){
  if(out.some(x=>x.id===c.id||x.name.trim().toLowerCase()===c.name.toLowerCase()))continue;
  if(out.length>=LIMITS.components)break;
  out.push(c);added.push(c.name);
 }
 return {list:out,added};
}
