import {useT} from '../lib/useT';
import {isSvg,useMedia} from '../lib/media';
import {SvgInspector} from './svgedit/SvgInspector';
import {useUiContext,getContextNode} from '../lib/uiContextStore';
import {Tabs,TabsContent} from './ui/tabs';
import {Button} from './ui/button';
import {patchState,useAppStore} from '../store/appStore';
import {ContextSections,CursorSection} from './ContextSections';
export function Inspector(){const {t}=useT(),state=useAppStore(),context=useUiContext(),node=getContextNode(context.nodeId),svgMedia=useMedia();
 if(isSvg(state.activeFile)&&state.coreConnected&&!svgMedia.active&&state.viewMode!=='code')return <SvgInspector/>;
 return <aside className="panel inspector" aria-label={t('panels.inspector.inspector')}><Tabs value={state.rightTab} onValueChange={value=>patchState({rightTab:value as typeof state.rightTab})}><TabsContent value="design"><div className="h-12 shrink-0 border-b border-subtle px-4 py-4 text-xs" data-testid="inspector-context-heading">{context.selection.kind==='multi'?t('ctx.selected',{count:context.selection.count}):node?`<${node.tag}>`:t('ctx.domain.'+context.domain)}</div>{context.domain==='empty'?<div className="p-5 text-xs" data-testid="inspector-empty-state"><h3>{t('panels.inspector.noProject')}</h3><p>{t('panels.inspector.openToInspect')}</p></div>:<ContextSections/>}</TabsContent><TabsContent value="prototype"><div className="p-5 text-xs"><h3>{t('panels.inspector.interactions')}</h3><p>{t('panels.inspector.linksTriggersAndTransitionsAre')}</p></div></TabsContent><TabsContent value="code"><div className="p-4"><CursorSection/><Button variant="outline" onClick={()=>patchState({viewMode:'split'})}>{t('panels.inspector.openSplitView')}</Button></div></TabsContent></Tabs></aside>;
}
