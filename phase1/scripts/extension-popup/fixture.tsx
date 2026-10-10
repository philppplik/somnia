import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import '../../src/styles/extensions-popup.css';
import {ExtensionsPopup} from '../../src/components/extensions/ExtensionsPopup';
import {fixtureHost} from '../../src/lib/extensions/popupFixtures';
import type {PopupView} from '../../src/lib/extensions/popupModel';
import {setLocale} from '../../src/lib/i18n';
/** Screenshot harness only. Fixture data never ships. */
const q=new URLSearchParams(location.search);
if(q.get('locale'))setLocale(q.get('locale') as never);
if(q.get('theme'))document.documentElement.dataset.theme=q.get('theme')!;
createRoot(document.getElementById('root')!).render(<ExtensionsPopup open host={fixtureHost()} onClose={()=>{}} initial={(q.get('view')??'installed') as PopupView}/>);
