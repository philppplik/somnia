import React from 'react';
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {SchemaForm} from '../src/components/SchemaForm';
import '../src/styles/global.css';
const schema={type:'object',required:['name','size','enabled','options'],additionalProperties:false,properties:{name:{type:'string',title:'File name',minLength:2,'x-i18n':'rest.commandPalette.searchCommands'},size:{type:'integer',title:'Width (pixels)',minimum:1,maximum:2000,default:640},enabled:{type:'boolean',title:'Keep aspect ratio',default:false},mode:{type:'string',title:'Quality',enum:['draft','final']},options:{type:'object',title:'Output options',required:['format'],properties:{format:{type:'string',title:'Format',enum:['png','webp'],default:'png'},scale:{type:'number',title:'Scale',minimum:0.1,maximum:4}}},tags:{type:'array',title:'Tags',items:{type:'string'},minItems:1}}};
function Preview(){const [out,setOut]=useState('');return <main style={{maxWidth:640,margin:'24px auto',padding:24,background:'var(--bg-elevated)',borderRadius:25,maxHeight:'92vh',overflow:'auto'}}><h1 style={{fontSize:18,marginBottom:18}}>Command parameters</h1>{location.search.includes('review')?<SchemaForm schema={schema} initialValues={{name:'banner.png',size:640,enabled:false,mode:'final',options:{format:'png',scale:1},tags:['web']}} readOnly/>:<SchemaForm schema={schema} onSubmit={value=>setOut(JSON.stringify(value))}/>}<output data-testid="result">{out}</output></main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
