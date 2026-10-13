import {useMemo} from 'react';
import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {computeHistogram,histogramPath,toneZones,type HistogramChannel} from '../../../lib/photos/histogram';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead} from './shared';
import type {PhotoFrame} from '../../../lib/photos/studioSession';
const CHANNELS:HistogramChannel[]=['luma','rgb','r','g','b'];
const COLORS:Record<'r'|'g'|'b'|'luma',string>={r:'#e5484d',g:'#30a46c',b:'#3e63dd',luma:'currentColor'};
const pct=(v:number)=>`${(v*100).toFixed(v>0&&v<0.001?2:1)}%`;
/** Histogram of the rendered preview, with clipping figures and tone zones. Reads the frame the canvas shows. */
export function HistogramView({frame,channel}:{frame:PhotoFrame;channel:HistogramChannel}){
 const {t}=useT();
 const h=useMemo(()=>computeHistogram(frame.bytes),[frame]);
 const zones=toneZones(h);
 const layers=channel==='rgb'?(['r','g','b'] as const):channel==='luma'?(['luma'] as const):([channel] as const);
 const warn=h.clipShadows>0.005||h.clipHighlights>0.005;
 return <>
  <svg viewBox="0 0 256 64" className="h-16 w-full rounded-sm border border-subtle bg-elevated text-ink-3" role="img" data-testid="photos-histogram-svg"
   aria-label={t('photos.p.hist.aria',{mean:Math.round(h.meanLuma),shadows:pct(h.clipShadows),highlights:pct(h.clipHighlights)})} preserveAspectRatio="none">
   {layers.map(l=><path key={l} d={histogramPath(h[l],256,64)} fill={COLORS[l]} fillOpacity={layers.length>1?0.35:0.55} style={layers.length>1?{mixBlendMode:'screen'}:undefined}/>)}
  </svg>
  <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums" data-testid="photos-histogram-stats">
   <dt>{t('photos.p.hist.clipShadows')}</dt><dd className="m-0 text-right" style={h.clipShadows>0.005?{color:'var(--danger)'}:undefined} data-testid="photos-hist-shadows">{pct(h.clipShadows)}</dd>
   <dt>{t('photos.p.hist.clipHighlights')}</dt><dd className="m-0 text-right" style={h.clipHighlights>0.005?{color:'var(--danger)'}:undefined} data-testid="photos-hist-highlights">{pct(h.clipHighlights)}</dd>
   <dt>{t('photos.p.hist.mean')}</dt><dd className="m-0 text-right" data-testid="photos-hist-mean">{Math.round(h.meanLuma)} / 255</dd>
   <dt>{t('photos.p.hist.median')}</dt><dd className="m-0 text-right">{h.medianLuma} / 255</dd>
  </dl>
  <div className="flex h-2 overflow-hidden rounded-sm" role="img" aria-label={t('photos.p.hist.zones')} data-testid="photos-hist-zones">
   {(['blacks','shadows','mids','highlights','whites'] as const).map((z,i)=><span key={z} title={`${t(`photos.p.zone.${z}`)} ${pct(zones[z])}`} style={{flex:Math.max(zones[z],0.002),background:`color-mix(in srgb, currentColor ${10+i*20}%, transparent)`}} className="text-ink"/>)}
  </div>
  {warn&&<p className="m-0 text-[11px]" style={{color:'var(--danger)'}} role="status" data-testid="photos-hist-warning">{t('photos.p.hist.warn')}</p>}
 </>;
}
export function HistogramPanel(){
 const {t}=useT();
 const [channel,setChannel]=usePanelState<HistogramChannel>('photos.histogram',"luma");
 return <PanelBody testId="photos-histogram-panel">{({session})=><>
  <SectionHead>
   {CHANNELS.map(c=><Button key={c} size="tiny" variant="outline" aria-pressed={channel===c} onClick={()=>setChannel(c)} data-testid={`photos-hist-ch-${c}`}>{t(`photos.p.hist.ch.${c}`)}</Button>)}
  </SectionHead>
  {session.frame?<HistogramView frame={session.frame} channel={CHANNELS.includes(channel)?channel:'luma'}/>:<p className="m-0 text-ink-3">{t('photos.loading')}</p>}
  <p className="m-0 text-[11px] text-ink-3">{t('photos.p.hist.note')}</p>
 </>}</PanelBody>;
}
