import {ShellChromeProof} from './shell-chrome-proof';
import {ExtensionsProof} from './extensions-proof';
import {VibespaceProof} from './vibespace-proof';
import {PdfProof} from './pdf-proof';
import {AgentProof} from './agent-proof';
import {VectorstudioProof} from './vectorstudio-proof';
import {SvgeditProof} from './svgedit-proof';
import {VersionsProof} from './versions-proof';
import {ImageeditProof} from './imageedit-proof';
import {LayersProof,LayersTreeProof} from './layers-proof';
import {DocumentsProof} from './documents-proof';
import {VideoProof} from './video-proof';
import {PhotosProof} from './photos-proof';
import {PhotosCropProof} from './photos-crop-proof';
import {PhotosClippingProof} from './photos-clipping-proof';
import {PhotosSplitProof} from './photos-split-proof';
import {PhotosSyncProof} from './photos-sync-proof';
import {PhotosNavProof} from './photos-nav-proof';
import {PhotosZoomProof} from './photos-zoom-proof';
import {PhotosFilmstripProof} from './photos-filmstrip-proof';
import {ImgeditProof} from './imgedit-proof';
import {ExportProof,ConvertProof} from './export-proof';
import {StateAdoptionProof} from './state-adoption-proof';
import {MotionDensityProof} from './motion-density-proof';
import {FocusProof} from './focus-proof';
import {GalleryIndex} from './gallery-index';
import {ShellStateProof} from './shell-state-proof';
import {StudioAdoptionProof} from './studio-adoption-proof';
import {THEME_CHOICES,resolveTheme} from '../../src/lib/theme';
import {applyLook,DEFAULT_LOOK} from '../../src/lib/look';
import {applyUiPrefs,DEFAULT_UI_PREFS} from '../../src/lib/uiPrefs';
import {ThemeImportPanel} from '../../src/components/ThemeImportPanel';
import {installImportedTheme} from '../../src/lib/importedTheme';
import {initLocale} from '../../src/lib/i18n';
import {ExchangeProof} from './exchange-proof';
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Menu as RawMenu} from '@base-ui/react/menu';
import {Tooltip as RawTooltip} from '@base-ui/react/tooltip';
import {Popover as RawPopover} from '@base-ui/react/popover';
import {Checkbox} from '../../src/components/ui/checkbox';
import {Switch} from '../../src/components/ui/switch';
import {RadioGroup} from '../../src/components/ui/radio-group';
import {Field} from '../../src/components/ui/field';
import {NativeInput,NativeSelect,Textarea} from '../../src/components/ui/native-controls';
import {NumberField} from '../../src/components/ui/number-field';
import {RangeField} from '../../src/components/ui/range-field';
import {PanelBody,PanelHeader,PanelSection,PropertyList} from '../../src/components/ui/panel';
import {Notice} from '../../src/components/ui/notice';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../../src/components/ui/menu';
import {StudioTooltip,TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from '../../src/components/ui/tooltip';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle,PopoverClose} from '../../src/components/ui/popover';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import '../../src/components/studios/studio-pill.css';
import './gallery.css';
Object.assign(window,{dsAppearance:{THEME_CHOICES,resolveTheme,applyLook,DEFAULT_LOOK,applyUiPrefs,DEFAULT_UI_PREFS}});
initLocale();installImportedTheme();
function Gallery(){
 const [checked,setChecked]=useState(false),[radio,setRadio]=useState('a');
 const [number,setNumber]=useState<number|null>(10),[mixed,setMixed]=useState(false),[readonly,setReadonly]=useState(false),[disabled,setDisabled]=useState(false),[range,setRange]=useState(30),[open,setOpen]=useState(true),[events,setEvents]=useState<string[]>([]);
 const log=(event:string)=>setEvents(old=>[...old,event]);
 return <main lang="en" data-fixture-ready="true"><h1>P1 primitive contracts</h1><p>Developer fixture. Real primitives and production styles; no app engines or user data.</p>
 <div className="controls"><button onClick={()=>setMixed(!mixed)} aria-pressed={mixed}>Mixed</button><button onClick={()=>setReadonly(!readonly)} aria-pressed={readonly}>Read only</button><button onClick={()=>setDisabled(!disabled)} aria-pressed={disabled}>Disabled</button><button onClick={()=>{setEvents([]);setNumber(10);setRange(30);}}>Reset fixture</button></div>
 <div className="gallery-grid">
 <section><h2>Native parity</h2><div className="pair"><input data-testid="raw-checkbox" type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={disabled}/><Checkbox data-testid="ui-checkbox" label="Checkbox choice" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={disabled} indeterminate={mixed}/></div><div className="pair"><input data-testid="raw-switch" type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={disabled}/><Switch data-testid="ui-switch" label="Switch choice" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={disabled}/></div><RadioGroup label="Format" name="format" value={radio} disabled={disabled} readOnly={readonly} options={[{value:"a",label:"Alpha"},{value:"b",label:"Beta",disabled:true},{value:"c",label:"Gamma"}]} onValueChange={setRadio}/><div className="pair"><input data-testid="raw-input" defaultValue="Text" disabled={disabled} readOnly={readonly}/><NativeInput data-testid="ui-input" defaultValue="Text" disabled={disabled} readOnly={readonly}/></div>
 <div className="pair"><select data-testid="raw-select" disabled={disabled}><option>A</option></select><NativeSelect data-testid="ui-select" disabled={disabled}><option>A</option></NativeSelect></div>
 <div className="pair"><textarea data-testid="raw-textarea" defaultValue="Text" disabled={disabled} readOnly={readonly}/><Textarea data-testid="ui-textarea" defaultValue="Text" disabled={disabled} readOnly={readonly}/></div>
 <Field label="Translated field label: Breite des ausgewählten Objekts" hint="A caller-supplied hint" error="A caller-supplied error">{props=><NativeInput {...props}/>}</Field></section>
 <section><h2>Numeric draft and gesture</h2><NumberField label="Width" value={number} mixed={mixed} mixedLabel="Mixed" unit="px" min={0} max={100} step={2} constraintError="Value must be between 0 and 100" parse={draft=>draft.trim()!==''&&Number.isFinite(Number(draft))?{ok:true,value:Number(draft)}:{ok:false,error:'Enter a number'}} disabled={disabled} readOnly={readonly} onCommit={value=>{setNumber(value);setMixed(false);log(`number:${value}`);}} onCancel={()=>log('number:cancel')} data-testid="number"/>
 <RangeField label="Preview level" min={0} max={100} step={1} value={range} disabled={disabled} readOnly={readonly} onBegin={()=>log('range:begin')} onPreview={v=>{setRange(v);log(`range:preview:${v}`);}} onCommit={v=>log(`range:commit:${v}`)} onCancel={original=>{setRange(original);log(`range:cancel:${original}`);}} data-testid="range"/>
 <div className="pair"><input data-testid="raw-range" type="range" min={0} max={100} value={30} readOnly/><RangeField label="Parity range" data-testid="ui-range" min={0} max={100} value={30} onPreview={()=>{}} onCommit={()=>{}} onCancel={()=>{}}/></div>
 <div className="pair"><input data-testid="raw-number" type="text" inputMode="decimal" value="10" readOnly/><NumberField label="Parity number" value={10} parse={v=>({ok:true,value:Number(v)})} constraintError="Invalid" onCommit={()=>{}} data-testid="parity-number"/></div>
 </section>
 <section><h2>Panel and metadata</h2><PanelHeader><h3>Properties</h3></PanelHeader><PanelSection id="panel-body" title="Caller-owned collapse" open={open} onOpenChange={setOpen}><PropertyList rows={[{id:'size',label:'Dimensions',value:'1920 × 1080 px'},{id:'source',label:'Long source label',value:'selection-bound caller-owned value'}]}/></PanelSection>
 <div className="pair"><div data-testid="raw-panel" className="p-3">Body</div><PanelBody data-testid="ui-panel">Body</PanelBody></div>
 <Notice tone="success">Saved (caller-supplied text)</Notice><Notice tone="warning">Review before applying</Notice><Notice tone="danger" live="polite">Caller-supplied error; retry belongs to caller</Notice></section>
 <section><h2>Keyboard and portals</h2>
 <Menu><MenuTrigger>Open menu</MenuTrigger><MenuContent><MenuItem onClick={()=>log('menu:first')}>First action</MenuItem><MenuItem disabled>Disabled action</MenuItem><MenuItem onClick={()=>log('menu:last')}>Last action</MenuItem></MenuContent></Menu>
 <RawMenu.Root><RawMenu.Trigger>Raw menu</RawMenu.Trigger><RawMenu.Portal><RawMenu.Positioner sideOffset={4}><RawMenu.Popup data-testid="raw-menu" className="menu-popup"><RawMenu.Item className="menu-item">Raw action</RawMenu.Item></RawMenu.Popup></RawMenu.Positioner></RawMenu.Portal></RawMenu.Root>
 <Popover><PopoverTrigger>Open popover</PopoverTrigger><PopoverContent><PopoverTitle>Popover content</PopoverTitle><NativeInput aria-label="Popover value"/><PopoverClose>Close popover</PopoverClose></PopoverContent></Popover>
 <RawPopover.Root><RawPopover.Trigger>Raw popover</RawPopover.Trigger><RawPopover.Portal><RawPopover.Positioner sideOffset={4}><RawPopover.Popup data-testid="raw-popover" className="menu-popup"><RawPopover.Title>Raw content</RawPopover.Title></RawPopover.Popup></RawPopover.Positioner></RawPopover.Portal></RawPopover.Root>
 <TooltipProvider delay={0}><Tooltip><TooltipTrigger>Tooltip trigger</TooltipTrigger><TooltipContent>Shared tooltip</TooltipContent></Tooltip></TooltipProvider>
 <StudioTooltip.Provider delay={0}><StudioTooltip.Root><StudioTooltip.Trigger>Studio facade tooltip</StudioTooltip.Trigger><StudioTooltip.Portal><StudioTooltip.Positioner className="z-50" side="bottom" sideOffset={8}><StudioTooltip.Popup data-testid="studio-tooltip" className="studio-pill-tooltip">Studio facade</StudioTooltip.Popup></StudioTooltip.Positioner></StudioTooltip.Portal></StudioTooltip.Root></StudioTooltip.Provider>
 <RawTooltip.Provider delay={0}><RawTooltip.Root><RawTooltip.Trigger>Raw tooltip</RawTooltip.Trigger><RawTooltip.Portal><RawTooltip.Positioner side="bottom" sideOffset={8}><RawTooltip.Popup data-testid="raw-tooltip" className="studio-pill-tooltip">Raw tooltip</RawTooltip.Popup></RawTooltip.Positioner></RawTooltip.Portal></RawTooltip.Root></RawTooltip.Provider>
 </section><ExchangeProof/><ThemeImportPanel/></div><pre data-testid="events" aria-label="Fixture events">{events.join('\n')}</pre><StudioAdoptionProof/><ShellStateProof/></main>;
}
const view=new URLSearchParams(location.search).get('view');
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('state-adoption')?<StateAdoptionProof/>:new URLSearchParams(location.search).has('focus-audit')?<FocusProof/>:view==='index'?<GalleryIndex/>:view==='shell'?<main><ShellStateProof showRecovery/></main>:view==='studios'?<main><StudioAdoptionProof/></main>:view==='importer'?<main><ThemeImportPanel/></main>:view==='extensions'?<ExtensionsProof/>:view==='vibespace'?<VibespaceProof/>:view==='pdf'?<PdfProof/>:view==='agent'?<AgentProof/>:view==='vectorstudio'?<VectorstudioProof/>:view==='documents'?<DocumentsProof/>:view==='svgedit'?<SvgeditProof/>:view==='video'?<VideoProof/>:view==='versions'?<VersionsProof/>:view==='photos'?<PhotosProof/>:view==='imageedit'?<ImageeditProof/>:view==='imgedit'?<ImgeditProof/>:view==='layers'?<LayersProof/>:view==='layers-tree'?<LayersTreeProof/>:view==='export'?<ExportProof/>:view==='convert'?<ConvertProof/>:view==='photos-crop'?<PhotosCropProof/>:view==='photos-clipping'?<PhotosClippingProof/>:view==='photos-split'?<PhotosSplitProof/>:view==='photos-sync'?<PhotosSyncProof/>:view==='photos-nav'?<PhotosNavProof/>:view==='photos-zoom'?<PhotosZoomProof/>:view==='photos-filmstrip'?<PhotosFilmstripProof/>:<Gallery/>);
