import {EditorState,type Extension} from '@codemirror/state';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {EditorView} from '@codemirror/view';
import {htmlLanguage} from '@codemirror/lang-html';
import {CompletionContext,type Completion,type CompletionResult} from '@codemirror/autocomplete';
import {languageFor} from './languages';
export interface ProjectCssSymbol {name:string;kind:'class'|'id';files:readonly string[]}
export interface ProjectCssIndex {status:'ready'|'budget';symbols:readonly ProjectCssSymbol[]}
/** CSS selectors only. Attribute selectors, comments, strings and escaped names are not invented as classes. */
export function indexProjectCss(files:Readonly<Record<string,string>>):ProjectCssIndex {
 const allPaths=Object.keys(files);if(allPaths.length>5000)return {status:'budget',symbols:[]};
 const paths=allPaths.filter(path=>/\.css$/i.test(path)).sort();
 if(paths.length>32||paths.reduce((n,p)=>n+files[p].length,0)>256000)return {status:'budget',symbols:[]};
 const symbols=new Map<string,{name:string;kind:'class'|'id';files:string[]}>();let nodes=0;const started=performance.now();
 for(const file of paths){const raw=files[file];if(raw.length>100000||performance.now()-started>50)return {status:'budget',symbols:[]};
  const state=EditorState.create({doc:raw,extensions:[languageFor(file)]}),tree=ensureSyntaxTree(state,raw.length,10);
  if(!tree||tree.length!==raw.length)return {status:'budget',symbols:[]};let failed=false;
  tree.iterate({enter(node){if(failed)return false;if(++nodes>20000||performance.now()-started>50){failed=true;return false;}
   if(!['ClassName','IdName'].includes(node.name))return;
   const kind=node.name==='ClassName'?'class':'id',name=raw.slice(node.from,node.to).replace(/^#/,'');
   if(!/^-?[_a-zA-Z][_a-zA-Z0-9-]{0,119}$/.test(name))return;
   // Ignore any selector whose own subtree has a parser error. Other valid rules can still contribute.
   const selector=node.node.parent;if(!selector||!['ClassSelector','IdSelector'].includes(selector.name))return;
   let error=false;selector.toTree().iterate({enter(n){if(n.type.isError)error=true;}});if(error)return;
   const key=kind+':'+name,previous=symbols.get(key);if(previous){if(!previous.files.includes(file))previous.files.push(file);}else symbols.set(key,{name,kind,files:[file]});if(symbols.size>1000)failed=true;
  }});if(failed)return {status:'budget',symbols:[]};
 }
 return {status:'ready',symbols:[...symbols.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)};
}
/** Only quoted HTML class/id values, never JS/JSX, comments, tags or other attributes. */
export function htmlCssValueContext(context:CompletionContext):{from:number;to:number;kind:'class'|'id';used:Set<string>}|null {
 const {state,pos}=context;let node=syntaxTree(state).resolveInner(pos,-1);for(let n=0;n<5&&node.name!=='AttributeValue';n++){if(!node.parent)return null;node=node.parent;}
 if(node.name!=='AttributeValue'||node.parent?.name!=='Attribute'||!['OpenTag','SelfClosingTag'].includes(node.parent.parent?.name??''))return null;
 const attr=node.parent.getChild('AttributeName');if(!attr)return null;const name=state.sliceDoc(attr.from,attr.to).toLowerCase();if(name!=='class'&&name!=='id')return null;
 const raw=state.sliceDoc(node.from,node.to),quote=raw[0];if(quote!=='"'&&quote!=="'")return null;
 const start=node.from+1,end=node.to-(raw.length>1&&raw.at(-1)===quote?1:0);if(pos<start||pos>end)return null;
 const value=state.sliceDoc(start,end);if(/[&<>{}]/.test(value))return null; // Entity/template interpolation needs different replacement rules.
 if(name==='id'&&/\s/.test(value))return null;
 let from=pos,to=pos;while(from>start&&!/\s/.test(state.sliceDoc(from-1,from)))from--;while(to<end&&!/\s/.test(state.sliceDoc(to,to+1)))to++;
 if(!/^[-_a-zA-Z0-9]*$/.test(state.sliceDoc(from,to)))return null;
 const used=new Set((state.sliceDoc(start,from)+' '+state.sliceDoc(to,end)).split(/\s+/).filter(Boolean));return {from,to,kind:name,used};
}
export function projectCssCompletionSource(getFiles:()=>Readonly<Record<string,string>>,detail:(files:readonly string[])=>string,owner:{generation:()=>number;current:(raw:string)=>boolean;rejected:()=>void}={generation:()=>0,current:()=>true,rejected:()=>{}}){
 let cachedInputs:Record<string,string>|null=null,cached:ProjectCssIndex={status:'ready',symbols:[]};
 function currentIndex(){const files=getFiles(),paths=Object.keys(files);if(paths.length>5000)return {status:'budget',symbols:[]} as ProjectCssIndex;
  const cssPaths=paths.filter(path=>/\.css$/i.test(path));if(!cachedInputs||Object.keys(cachedInputs).length!==cssPaths.length||cssPaths.some(p=>cachedInputs![p]!==files[p])){cachedInputs=Object.fromEntries(cssPaths.map(p=>[p,files[p]]));cached=indexProjectCss(cachedInputs);}return cached;
 }
 return (context:CompletionContext):CompletionResult|null=>{
  if(context.state.readOnly||context.state.selection.ranges.length!==1||!context.state.selection.main.empty)return null;const value=htmlCssValueContext(context);if(!value||(!context.explicit&&value.from===context.pos))return null;
  const index=currentIndex();if(index.status!=='ready')return null;const generation=owner.generation();
  const options:Completion[]=index.symbols.filter(s=>s.kind===value.kind&&!value.used.has(s.name)).map(s=>({label:s.name,type:value.kind==='class'?'class':'constant',detail:detail(s.files),boost:5,
   apply(view,_completion,from,to){const now=htmlCssValueContext(new CompletionContext(view.state,view.state.selection.main.head,true)),latest=currentIndex();
    if(view.state.readOnly||!view.state.facet(EditorView.editable)||view.state.selection.ranges.length!==1||!view.state.selection.main.empty||!owner.current(view.state.doc.toString())||owner.generation()!==generation||!now||now.kind!==value.kind||now.from!==from||now.to!==to||latest.status!=='ready'||!latest.symbols.some(symbol=>symbol.name===s.name&&symbol.kind===s.kind)){owner.rejected();return;}
    view.dispatch({changes:{from,to,insert:s.name},selection:{anchor:from+s.name.length},userEvent:'input.cssComplete'});
   }}));
  return options.length?{from:value.from,to:value.to,options,validFor:/^[-_a-zA-Z0-9]*$/}:null;
 };
}
/** Add a source, do not override HTML's built-in tag/attribute completion. */
export function projectCssCompletionExtension(source:ReturnType<typeof projectCssCompletionSource>):Extension {return htmlLanguage.data.of({autocomplete:source});}
