import {test,expect} from './fixtures';
import {showCode} from './helpers';
/** Regression: pages that hide content until JS/keyframes reveal it rendered blank in previews. */
const PAGE=`<!doctype html><html><head><title>t</title><style>
body{margin:0;font:20px sans-serif}
.reveal{opacity:0;transform:translateY(40px)}
.hero{opacity:0;animation:fin 1s 2s forwards}
.aos{opacity:0}
@keyframes fin{from{opacity:0}to{opacity:1}}
.late{opacity:0;animation:fin 1s 5s both}
.tall{height:1400px}
</style></head><body>
<h1 class="hero" id="hero">Hero</h1>
<p class="reveal" id="reveal">Reveal</p>
<p class="late" id="late">Late</p>
<div class="tall"></div>
<p data-aos="fade-up" class="aos" id="aos">AOS</p>
<script src="https://cdn.example.com/aos.js"></script>
<script>AOS.init()</script>
</body></html>`;
const op=(l:any,sel:string)=>l.locator(sel).evaluate((e:Element)=>getComputedStyle(e).opacity);
test('design canvas shows delayed keyframe and reveal-on-scroll content',async({page})=>{await page.goto('/');await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toBeVisible();
 await page.evaluate((h)=>(window as any).__somnia.setSource('index.html',h),PAGE);
 const fr=page.frameLocator('iframe[title="Sandboxed design preview"]');
 await expect(fr.locator('#reveal')).toBeAttached();
 for(const id of ['hero','reveal','late','aos'])await expect.poll(()=>op(fr,'#'+id)).toBe('1');
 await expect(fr.locator('#reveal')).toHaveCSS('transform','none');
 await page.screenshot({path:'test-results/preview-animations-canvas.png'});});
const openLive=async(page:any)=>{await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('live preview');await page.getByRole('option',{name:/live preview/i}).click();};
test('live preview with scripts off shows content',async({page})=>{await page.goto('/');await showCode(page);
 await page.evaluate((h)=>(window as any).__somnia.setSource('index.html',h),PAGE);
 await openLive(page);const pane=page.getByLabel('Live preview',{exact:true});
 await pane.getByRole('button',{name:'Preview without scripts'}).click();
 const fr=page.frameLocator('iframe[title="Live preview frame"]');
 for(const id of ['hero','reveal','late','aos'])await expect.poll(()=>op(fr,'#'+id)).toBe('1');});
test('live preview with scripts on reveals content when a CDN library is blocked and says so',async({page})=>{await page.goto('/');await showCode(page);
 await page.evaluate((h)=>(window as any).__somnia.setSource('index.html',h),PAGE);
 await openLive(page);const pane=page.getByLabel('Live preview',{exact:true});
 await pane.getByRole('button',{name:'Run scripts'}).click();
 const fr=page.frameLocator('iframe[title="Live preview frame"]');
 await expect.poll(()=>op(fr,'#aos')).toBe('1');await expect.poll(()=>op(fr,'#reveal')).toBe('1');
 await expect(pane.getByRole('status',{name:'Blocked external resources'})).toContainText('cdn.example.com/aos.js');
 await page.screenshot({path:'test-results/preview-animations-live.png'});});
test('live preview with scripts on keeps animations running when nothing was blocked',async({page})=>{await page.goto('/');await showCode(page);
 await page.evaluate(()=>(window as any).__somnia.setSource('index.html','<!doctype html><html><head><style>.a{opacity:0;transition:opacity 5s}.a.on{opacity:1}</style></head><body><p class="a" id="a">x</p><script>requestAnimationFrame(()=>document.getElementById("a").classList.add("on"))</script></body></html>'));
 await openLive(page);const pane=page.getByLabel('Live preview',{exact:true});await pane.getByRole('button',{name:'Run scripts'}).click();
 const fr=page.frameLocator('iframe[title="Live preview frame"]');
 await expect(fr.locator('#a')).toHaveClass(/on/);
 expect(Number(await op(fr,'#a'))).toBeLessThan(1);
 await expect(pane.getByRole('status',{name:'Blocked external resources'})).toHaveCount(0);});
