import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProviderAccountConnection} from './agent/ProviderAccountConnection';
import {AgentAccountStatus} from './agent/AgentAccountStatus';
import {CATALOGUES,setLocale} from '../lib/i18n';
test('all five locales include every account string and browser requires desktop',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('accountAuth.'));
 for(const locale of ['en','de','es','fr','pt-BR']){
  assert.ok(keys.every(k=>!!CATALOGUES[locale][k]),locale);setLocale(locale);
  const html=renderToStaticMarkup(<ProviderAccountConnection provider="openai"/>);
  assert.ok(html.includes(CATALOGUES[locale]['accountAuth.desktop']));assert.ok(html.includes('disabled=""'));assert.ok(!html.includes('<select'));
 }
 setLocale('en');
});
test('unsupported account providers remain honest; Agent status only for OpenAI',()=>{
 for(const provider of ['claude','openrouter','ollama'] as const){
  const html=renderToStaticMarkup(<ProviderAccountConnection provider={provider}/>);
  assert.ok(html.includes('API key / local only'));assert.ok(html.includes('disabled=""'));
  assert.equal(renderToStaticMarkup(<AgentAccountStatus provider={provider}/>),'');
 }
 assert.ok(renderToStaticMarkup(<AgentAccountStatus provider="openai"/>).includes('Desktop sign-in required'));
});
