import React from 'react';import {createRoot} from 'react-dom/client';
import {DeploySetupWizard} from './src/components/DeploySetupWizard';
import {createPublishStore} from './src/lib/deploy/publishStore';
import en from './src/locales/en.json';import './src/styles/publish.css';
const t=(k:string,p:Record<string,string|number>={})=>Object.entries(p).reduce((s,[k,v])=>s.replaceAll(`{${k}}`,String(v)),(en as Record<string,string>)[k]??k);
const target={target:{id:'portfolio',name:'Portfolio',host:'203.0.113.10',port:22,user:'somnia',kind:'static',domain:'example.com',keySlot:'deploy-key:portfolio'},state:'ready'} as const;
// In-process fake only. This preview never contacts a server or runs this illustrative script.
const be={targetSave:async()=>{},targetsList:async()=>[target],releasesList:async()=>[],openSite:async()=>{},bootstrapScript:async()=>`#!/bin/sh\n# Somnia one-time server setup. Review before running.\nset -eu\n# Refuse occupied ports, install Caddy, create somnia user\napt-get install -y caddy\nuseradd --system --create-home somnia\ninstall -d -m 755 -o somnia /srv/somnia/portfolio/{releases,shared}\n# Public key only. Private key stays in your OS keychain.\nsystemctl enable --now somnia-caddy.service\n`,keyPublic:async()=> 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample somnia',dnsCheck:async()=>({ready:false,expected:['203.0.113.10'],records:[{name:'example.com',type:'A',source:'system',values:['198.51.100.7'],ready:false}],staleIpv6:false,wwwMissing:true,resolverFailed:false})};
const store=createPublishStore({run:async()=>{},backend:be,onProgress:()=>()=>{}});
createRoot(document.getElementById('root')!).render(<div className="publish-popup" style={{width:620,margin:'28px auto',padding:24,borderRadius:25,background:'var(--surface)',color:'var(--text)'}}><h2>{t('deploy.setup.title')}</h2><p style={{color:'var(--text-muted)',fontSize:13}}>{t('deploy.setup.desc')}</p><DeploySetupWizard target={target} be={be} store={store} t={t}/></div>);
