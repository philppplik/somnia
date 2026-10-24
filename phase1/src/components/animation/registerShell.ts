import {animationStudio} from '../../lib/studios/animation';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {CompositionsPanel,PropertiesSection,CompositionSection,RenderSection} from './AnimationPanels';
export const disposeAnimationShell=registerStudioPanels(animationStudio,{
 panels:{'animation.compositions':CompositionsPanel},
 sections:{'animation.inspector.properties':PropertiesSection,'animation.inspector.composition':CompositionSection,'animation.inspector.render':RenderSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeAnimationShell());
import {registerBlankProjectFactory} from '../../lib/studios/blank';
import {animationSession} from '../../lib/animation/session';
registerBlankProjectFactory('animation',()=>{animationSession().createBlank();});
