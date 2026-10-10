// Isolated visual test harness. This mock never enters the production app.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {PublicationReview} from '../../src/components/versions/PublicationReview';
import {setLocale} from '../../src/lib/i18n';
import type {PublicationBackend, PublicationPlan} from '../../src/lib/git/publication/types';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
const params=new URLSearchParams(location.search);
setLocale(params.get('locale')??'en');
document.documentElement.dataset.theme=params.get('theme')??'light';
const calls:unknown[]=[];
(window as any).publicationCalls=calls;
const plan:PublicationPlan={planId:'plan-1',contentHash:'1a'.repeat(32),head:'a'.repeat(40),remoteTip:'b'.repeat(40),account:{id:'owner',login:'philppplik'},authRoute:'github-https',repository:{name:'philppplik/somnia-demo',visibility:'private'},effectiveRemoteUrl:'https://github.com/philppplik/somnia-demo.git',destinationValidated:true,sourceBranch:'feature/hero',targetBranch:'main',commits:[{sha:'a'.repeat(40),subject:'Improve the hero layout'},{sha:'c'.repeat(40),subject:'Add accessible image descriptions'}],untracked:['notes/draft.txt'],excluded:['.env','private/session.json'],unsavedBuffers:0,initiatedBy:params.has('agent')?'agent':'human',grant:{id:'g1',label:'Task 42: publish reviewed result'}};
let n=0;
const backend:PublicationBackend={plan:async()=>{calls.push('plan');return {...plan,planId:`plan-${++n}`};},apply:async r=>{calls.push(r);return params.has('stale')?{kind:'stale-plan'}:params.has('uncertain')?{kind:'uncertain-reconcile'}:{kind:'published',sha:plan.head,remote:'origin',targetBranch:'main'};},fetch:async()=>{calls.push('fetch');}};
function Preview(){const [dirty,setDirty]=useState(params.has('dirty')?2:0);return <main style={{width:360,margin:'32px auto',border:'1px solid var(--border-subtle)',borderRadius:25,background:'var(--bg-panel)'}}><button onClick={()=>setDirty(d=>d?0:2)} data-testid="test-dirty">Toggle unsaved buffers</button><PublicationReview backend={backend} unsavedFiles={dirty} advanced={params.has('advanced')} target={{remote:'origin',sourceBranch:'feature/hero',targetBranch:'main',accountId:'owner',authRoute:'github-https'}}/></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
