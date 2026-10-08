/**
 * Built-in block catalog for the Components panel: 21 blocks / 44 variants in 7 categories.
 * Pure data (no DOM, no storage). Replaces the opt-in starter kit; the starter markup is reused for the blocks it mapped to.
 * Conventions (same as starterKit.ts): no id attributes, one root element with a scoped <style> (sk-* prefix),
 * responsive without JS, real landmarks and labels, every control inside a visible <label>, WCAG AA contrast, visible focus ring.
 * Built-ins are read-only: "Duplicate" copies one into My library. They do not count against the 40-block library limit.
 */
import type {Component,Variant} from './componentSystem';
import {css,ph,variant,navCss,footCss,col,formCss,cardCss,
 NAV_SIMPLE,NAV_CTA,HERO_CENTER,HERO_SPLIT,CARD_BASIC,CARD_IMAGE,PRICE_3,PRICE_1,FOOT_SIMPLE,FOOT_COLS,FORM_CONTACT,FORM_NEWS} from './starterKit';

export const CATEGORIES=['layout','navigation','hero','content','forms','marketing','media'] as const;
export type Category=typeof CATEGORIES[number];

const block=(id:string,name:string,category:Category,variants:Variant[]):Component=>({id,name,variants,defaultVariantId:variants[0].id,category,builtin:true});
const v=(blockId:string,key:string,name:string,html:string)=>variant(`${blockId}-${key}`,name,html);
/** Root element with its scoped style inside. `prefix` doubles as the root class. */
const root=(tag:string,prefix:string,rules:string,inner:string,attrs='')=>`<${tag} class="${prefix}"${attrs?' '+attrs:''}>${css(prefix,rules)}${inner}</${tag}>`;
const MUTED='#4b4b63';
const LOREM='A short line of supporting text that you can replace.';

// Layout
const container=(key:string,max:string)=>v('bl-container',key,key==='fluid'?'Fluid':'Narrow',root('div',`sk-container-${key}`,`.sk-container-${key}{width:100%;max-width:${max};margin:0 auto;padding:2rem 1.5rem}`,`<h2>Container</h2><p>${LOREM}</p>`));
const grid=(n:number)=>v('bl-grid',`${n}col`,`${n}-col`,root('div',`sk-grid-${n}`,`.sk-grid-${n}{display:grid;grid-template-columns:repeat(auto-fit,minmax(${n===2?'16':n===3?'12':'9'}rem,1fr));gap:1.25rem;padding:1.5rem}.sk-grid-${n} .sk-cell{padding:1.25rem;border:1px solid #d4d4e0;border-radius:.75rem;background:#fff}.sk-grid-${n} h3{margin:0 0 .5rem;font-size:1.125rem}.sk-grid-${n} p{margin:0;color:${MUTED}}`,Array.from({length:n},(_,i)=>`<div class="sk-cell"><h3>Item ${i+1}</h3><p>${LOREM}</p></div>`).join('')));
const split=(key:string,name:string,reverse:boolean)=>{const p=`sk-split-${key}`;return v('bl-split',key,name,root('section',p,`.${p}{display:grid;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr));gap:2rem;align-items:center;padding:2.5rem 1.5rem}.${p} img{width:100%;height:auto;border-radius:.75rem;background:#e0e0ee;order:${reverse?-1:0}}.${p} h2{margin:0 0 .75rem}.${p} p{margin:0;color:${MUTED}}`,`<div><h2>Section heading</h2><p>${LOREM}</p></div><img src="${ph(640,400)}" width="640" height="400" alt="Describe the image here">`,'aria-label="Content with image"'));};
const divider=(key:string,name:string,label:boolean)=>{const p=`sk-divider-${key}`;return v('bl-divider',key,name,label?root('div',p,`.${p}{display:flex;align-items:center;gap:1rem;padding:1.5rem;color:${MUTED}}.${p} hr{flex:1;border:0;border-top:1px solid #8a8aa0;margin:0}`,'<hr><span>Label</span><hr>','role="separator" aria-label="Section divider"'):root('div',p,`.${p}{padding:1.5rem}.${p} hr{border:0;border-top:2px solid #8a8aa0;margin:0}`,'<hr>'));};

// Navigation
const navDropdown=()=>{const p='sk-navbar-dropdown';return v('bl-navbar','dropdown','With dropdown',`<nav class="sk-nav ${p}" aria-label="Main">${navCss(p)}${css(p,`.${p} details{position:relative}.${p} summary{cursor:pointer;font-weight:500;padding:.25rem 0;list-style:none}.${p} summary::-webkit-details-marker{display:none}.${p} details ul{position:absolute;top:100%;left:0;z-index:5;min-width:11rem;margin:.25rem 0 0;padding:.5rem 1rem;flex-direction:column;background:#fff;border:1px solid #d4d4e0;border-radius:.5rem}`)}<a class="sk-brand" href="#">Brand</a><ul><li><a href="#features">Features</a></li><li><details><summary>Products</summary><ul><li><a href="#one">Product one</a></li><li><a href="#two">Product two</a></li></ul></details></li><li><a href="#contact">Contact</a></li></ul></nav>`);};
const breadcrumbs=()=>{const p='sk-breadcrumbs-simple';return v('bl-breadcrumbs','simple','Simple',root('nav',p,`.${p}{padding:.75rem 1.5rem}.${p} ol{display:flex;flex-wrap:wrap;gap:.25rem .5rem;margin:0;padding:0;list-style:none}.${p} li+li::before{content:"/";margin-right:.5rem;color:${MUTED}}.${p} [aria-current]{color:${MUTED}}`,'<ol><li><a href="#">Home</a></li><li><a href="#">Section</a></li><li><span aria-current="page">Current page</span></li></ol>','aria-label="Breadcrumb"'));};
const footNews=()=>{const p='sk-footer-newsletter';return v('bl-footer','newsletter','Columns + newsletter',`<footer class="sk-footer ${p}">${footCss(p,`.${p} .sk-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1.5rem;max-width:62rem;margin:0 auto 1.5rem}.${p} h2{margin:0 0 .5rem;font-size:1rem}.${p} ul{margin:0;padding:0;list-style:none;display:grid;gap:.25rem}.${p} form{display:grid;gap:.5rem}.${p} label{display:grid;gap:.25rem;font-weight:600}.${p} input{padding:.5rem .65rem;border:1px solid #c7d2fe;border-radius:.4rem;font:inherit;color:#1a1a2e;background:#fff}.${p} .sk-btn{border-color:#c7d2fe;justify-self:start}.${p} .sk-copy{text-align:center}`)}<div class="sk-cols">${col('Product',['Features','Pricing'])}${col('Company',['About','Contact'])}<form action="#" method="post"><h2>Newsletter</h2><label>Email<input type="email" name="email" autocomplete="email" required></label><button class="sk-btn" type="submit">Subscribe</button></form></div><p class="sk-copy">&copy; 2026 Brand. All rights reserved.</p></footer>`);};

// Hero
const heroMedia=()=>{const p='sk-hero-media';return v('bl-hero-media','single','Single',root('section',p,`.${p}{display:grid;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr));gap:2rem;align-items:center;padding:4rem 1.5rem;background:#f5f5fb}.${p} img{width:100%;height:auto;border-radius:.75rem;background:#e0e0ee}.${p} h1{margin:0 0 1rem;font-size:clamp(2rem,5vw,3rem);line-height:1.15}.${p} p{margin:0 0 1.5rem;font-size:1.125rem}`,`<img src="${ph(640,420)}" width="640" height="420" alt="Describe the image here"><div><h1>Show your product first</h1><p>One or two sentences that explain the value in plain words.</p><a class="sk-btn" href="#signup">Get started</a></div>`,'aria-label="Introduction"'));};
const heroMinimal=()=>{const p='sk-hero-minimal';return v('bl-hero-minimal','single','Single',root('section',p,`.${p}{padding:5rem 1.5rem;background:#fff}.${p} .sk-eyebrow{margin:0 0 .75rem;font-size:.875rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3730a3}.${p} h1{margin:0;max-width:44rem;font-size:clamp(2.25rem,6vw,4rem);line-height:1.1}`,'<p class="sk-eyebrow">Eyebrow</p><h1>One bold statement that fits on a few lines.</h1>','aria-label="Introduction"'));};

// Content
const icon=(d:string)=>`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3730a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS=[icon('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'),icon('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'),icon('<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>')];
const features=(key:string,name:string,cols:number,icons:boolean)=>{const p=`sk-features-${key}`;return v('bl-features',key,name,root('section',p,`.${p}{padding:3rem 1.5rem;background:#fff}.${p} h2{margin:0 0 2rem;text-align:center;font-size:2rem}.${p} .sk-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(${cols===2?'18':'13'}rem,1fr));gap:1.5rem;max-width:62rem;margin:0 auto}.${p} h3{margin:.5rem 0;font-size:1.125rem}.${p} p{margin:0;color:${MUTED}}`,`<h2>Features</h2><div class="sk-items">${Array.from({length:cols===2?2:3},(_,i)=>`<div>${icons?ICONS[i]:''}<h3>Feature ${i+1}</h3><p>${LOREM}</p></div>`).join('')}</div>`,'aria-label="Features"'));};
const cardHoriz=()=>{const p='sk-card-horizontal';return v('bl-card','horizontal','Horizontal',`<article class="sk-card ${p}">${cardCss(p,`.${p}{display:flex;flex-wrap:wrap;max-width:36rem}.${p} img{flex:1 1 10rem;min-width:0;width:10rem;height:auto;object-fit:cover;background:#e0e0ee}.${p} .sk-body{flex:2 1 14rem}`)}<img src="${ph(320,240)}" width="320" height="240" alt="Describe the image here"><div class="sk-body"><h2>Card title</h2><p>Short supporting text that describes this card.</p><a class="sk-btn" href="#">Read more</a></div></article>`);};
const quote=(t:string)=>`<figure class="sk-q"><blockquote><p>&ldquo;${t}&rdquo;</p></blockquote><figcaption>Name, Role at Company</figcaption></figure>`;
const testimonial=(key:string,name:string,n:number)=>{const p=`sk-testimonial-${key}`;return v('bl-testimonial',key,name,root('section',p,`.${p}{padding:3rem 1.5rem;background:#f5f5fb}.${p} .sk-qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(${n===1?'20':'16'}rem,1fr));gap:1.25rem;max-width:${n===1?'40rem':'62rem'};margin:0 auto}.${p} .sk-q{margin:0;padding:1.5rem;border-radius:.75rem;background:#fff;border:1px solid #d4d4e0}.${p} blockquote{margin:0 0 1rem;font-size:1.125rem}.${p} blockquote p{margin:0}.${p} figcaption{color:${MUTED};font-size:.9375rem}`,`<div class="sk-qs">${Array.from({length:n},()=>quote('A short quote from a happy customer goes here.')).join('')}</div>`,'aria-label="Testimonials"'));};
const stats=(n:number)=>{const p=`sk-stats-${n}up`;const vals=['10k+','99%','24/7','50+'];const labs=['Users','Uptime','Support','Countries'];return v('bl-stats',`${n}up`,`${n}-up`,root('section',p,`.${p}{padding:3rem 1.5rem;background:#fff}.${p} dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1.5rem;max-width:62rem;margin:0 auto;text-align:center}.${p} dd{margin:0;font-size:2.5rem;font-weight:700;color:#3730a3;order:-1}.${p} dt{color:${MUTED}}.${p} .sk-stat{display:flex;flex-direction:column}`,`<dl>${Array.from({length:n},(_,i)=>`<div class="sk-stat"><dt>${labs[i]}</dt><dd>${vals[i]}</dd></div>`).join('')}</dl>`,'aria-label="Key numbers"'));};
const faqItem=(i:number)=>`<details><summary>Question ${i}?</summary><p>A clear, short answer to this question.</p></details>`;
const faq=(key:string,name:string,two:boolean)=>{const p=`sk-faq-${key}`;return v('bl-faq',key,name,root('section',p,`.${p}{padding:3rem 1.5rem;background:#fff}.${p} h2{margin:0 0 1.5rem;text-align:center;font-size:2rem}.${p} .sk-list{display:grid;grid-template-columns:${two?'repeat(auto-fit,minmax(18rem,1fr))':'1fr'};gap:.75rem 1.5rem;max-width:${two?'62rem':'40rem'};margin:0 auto;align-items:start}.${p} details{border:1px solid #d4d4e0;border-radius:.5rem;padding:.75rem 1rem}.${p} summary{cursor:pointer;font-weight:600}.${p} p{margin:.5rem 0 0;color:${MUTED}}`,`<h2>Frequently asked questions</h2><div class="sk-list">${[1,2,3,4].map(faqItem).join('')}</div>`,'aria-label="Frequently asked questions"'));};

// Forms
const contactPhone=()=>{const p='sk-form-contact-phone';return v('bl-form-contact','phone','With phone field',`<form class="sk-form ${p}" action="#" method="post">${formCss(p)}<h2>Contact us</h2><label class="sk-field"><span>Name</span><input type="text" name="name" autocomplete="name" required></label><label class="sk-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="sk-field"><span>Phone</span><input type="tel" name="phone" autocomplete="tel"></label><label class="sk-field"><span>Message</span><textarea name="message" rows="5" required></textarea></label><button class="sk-btn" type="submit">Send message</button></form>`);};
const newsCard=()=>{const p='sk-form-newsletter-card';return v('bl-form-newsletter','card','Card',`<form class="sk-form ${p}" action="#" method="post">${formCss(p,`.${p}{text-align:center}.${p} p{margin:0 0 1rem;color:${MUTED}}.${p} .sk-field{text-align:left}`)}<h2>Join the newsletter</h2><p>One short email a month. No spam.</p><label class="sk-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><button class="sk-btn" type="submit">Subscribe</button></form>`);};

// Marketing
const cta=(key:string,name:string,splitLayout:boolean)=>{const p=`sk-cta-${key}`;return v('bl-cta',key,name,root('section',p,`.${p}{padding:3rem 1.5rem;background:#312e81;color:#fff;${splitLayout?'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem':'text-align:center'}}.${p} h2{margin:0 0 .5rem;font-size:2rem}.${p} p{margin:0 0 ${splitLayout?'0':'1.5rem'};color:#e0e7ff}.${p} .sk-btn{background:#fff;border-color:#fff;color:#312e81!important}.${p} .sk-btn:focus-visible{outline-color:#fff}`,splitLayout?`<div><h2>Ready to get started?</h2><p>A short line that makes the next step feel easy.</p></div><a class="sk-btn" href="#signup">Get started</a>`:`<h2>Ready to get started?</h2><p>A short line that makes the next step feel easy.</p><a class="sk-btn" href="#signup">Get started</a>`,'aria-label="Call to action"'));};

// Media
const gallery=(key:string,name:string,n:number,w:number,h:number)=>{const p=`sk-gallery-${key}`;return v('bl-gallery',key,name,root('section',p,`.${p}{padding:2rem 1.5rem}.${p} ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(${n===6?'11':'20'}rem,1fr));gap:1rem;margin:0;padding:0;list-style:none}.${p} img{display:block;width:100%;height:auto;border-radius:.5rem;background:#e0e0ee}`,`<ul>${Array.from({length:n},(_,i)=>`<li><img src="${ph(w,h)}" width="${w}" height="${h}" alt="Gallery image ${i+1}"></li>`).join('')}</ul>`,'aria-label="Gallery"'));};
const logoSvg=(i:number)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="48" viewBox="0 0 140 48"><rect width="140" height="48" rx="8" fill="#e0e0ee"/><text x="70" y="29" fill="#55556b" font-family="sans-serif" font-size="14" text-anchor="middle">Logo ${i}</text></svg>`)}`;
const logos=(key:string,name:string,grid:boolean)=>{const p=`sk-logos-${key}`;return v('bl-logos',key,name,root('section',p,`.${p}{padding:2rem 1.5rem;background:#fff}.${p} ul{display:${grid?'grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))':'flex;flex-wrap:wrap;justify-content:center'};gap:1.25rem 2rem;margin:0;padding:0;list-style:none;align-items:center}.${p} img{display:block;width:140px;height:auto;filter:grayscale(1)}.${p} li{text-align:center}`,`<ul>${Array.from({length:grid?8:5},(_,i)=>`<li><img src="${logoSvg(i+1)}" width="140" height="48" alt="Logo ${i+1}"></li>`).join('')}</ul>`,'aria-label="Trusted by"'));};

const nv=(id:string,name:string,html:string)=>variant(id,name,html);
const BLOCKS:Component[]=[
 block('bl-container','Container','layout',[container('fluid','none'),container('narrow','44rem')]),
 block('bl-grid','Grid','layout',[grid(2),grid(3),grid(4)]),
 block('bl-split','Split','layout',[split('right','Media right',false),split('left','Media left',true)]),
 block('bl-divider','Divider','layout',[divider('line','Line',false),divider('label','With label',true)]),
 block('bl-navbar','Navbar','navigation',[nv('bl-navbar-simple','Simple',NAV_SIMPLE),nv('bl-navbar-cta','With button',NAV_CTA),navDropdown()]),
 block('bl-breadcrumbs','Breadcrumbs','navigation',[breadcrumbs()]),
 block('bl-footer','Footer','navigation',[nv('bl-footer-simple','Simple',FOOT_SIMPLE),nv('bl-footer-columns','Columns',FOOT_COLS),footNews()]),
 block('bl-hero','Hero','hero',[nv('bl-hero-center','Centered',HERO_CENTER),nv('bl-hero-split','Split with image',HERO_SPLIT)]),
 block('bl-hero-media','Hero media left','hero',[heroMedia()]),
 block('bl-hero-minimal','Hero minimal','hero',[heroMinimal()]),
 block('bl-features','Feature grid','content',[features('3col','3-col',3,false),features('2col','2-col',2,false),features('icons','With icons',3,true)]),
 block('bl-card','Card','content',[nv('bl-card-basic','Basic',CARD_BASIC),nv('bl-card-image','Image on top',CARD_IMAGE),cardHoriz()]),
 block('bl-testimonial','Testimonial','content',[testimonial('single','Single',1),testimonial('grid','Grid (2-up)',2)]),
 block('bl-stats','Stats row','content',[stats(3),stats(4)]),
 block('bl-faq','FAQ','content',[faq('single','Single column',false),faq('double','Two column',true)]),
 block('bl-form-contact','Contact form','forms',[nv('bl-form-contact-standard','Standard',FORM_CONTACT),contactPhone()]),
 block('bl-form-newsletter','Newsletter','forms',[nv('bl-form-newsletter-inline','Inline',FORM_NEWS),newsCard()]),
 block('bl-pricing','Pricing','marketing',[nv('bl-pricing-three','Three plans',PRICE_3),nv('bl-pricing-single','Single plan',PRICE_1)]),
 block('bl-cta','CTA banner','marketing',[cta('centered','Centered',false),cta('split','Split with button',true)]),
 block('bl-gallery','Gallery','media',[gallery('grid3','3-col grid',6,480,320),gallery('large2','2-col large',2,800,500)]),
 block('bl-logos','Logo cloud','media',[logos('row','Row',false),logos('grid','Grid',true)]),
];
/** Fresh copy of the catalog (callers may mutate the result). */
export function builtinBlocks():Component[]{return BLOCKS.map(c=>({...c,variants:c.variants.map(x=>({...x}))}));}
export const BUILTIN_IDS:ReadonlySet<string>=new Set(BLOCKS.map(c=>c.id));
export const BUILTIN_VARIANT_COUNT=BLOCKS.reduce((n,c)=>n+c.variants.length,0);
/** Old starter-kit ids to the block/variant that replaced them (1:1 markup reuse). Starter copies in user libraries are not touched. */
export const STARTER_ID_MAP:Readonly<Record<string,{component:string;variant:string}>>={
 'starter-navigation-simple':{component:'bl-navbar',variant:'bl-navbar-simple'},'starter-navigation-cta':{component:'bl-navbar',variant:'bl-navbar-cta'},
 'starter-hero-center':{component:'bl-hero',variant:'bl-hero-center'},'starter-hero-split':{component:'bl-hero',variant:'bl-hero-split'},
 'starter-card-basic':{component:'bl-card',variant:'bl-card-basic'},'starter-card-image':{component:'bl-card',variant:'bl-card-image'},
 'starter-pricing-three':{component:'bl-pricing',variant:'bl-pricing-three'},'starter-pricing-single':{component:'bl-pricing',variant:'bl-pricing-single'},
 'starter-footer-simple':{component:'bl-footer',variant:'bl-footer-simple'},'starter-footer-columns':{component:'bl-footer',variant:'bl-footer-columns'},
 'starter-form-contact':{component:'bl-form-contact',variant:'bl-form-contact-standard'},'starter-form-newsletter':{component:'bl-form-newsletter',variant:'bl-form-newsletter-inline'},
};
export const STARTER_COMPONENT_MAP:Readonly<Record<string,string>>={'starter-navigation':'bl-navbar','starter-hero':'bl-hero','starter-card':'bl-card','starter-pricing':'bl-pricing','starter-footer':'bl-footer','starter-form':'bl-form-contact'};
