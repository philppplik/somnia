// Local document conversion. Everything runs in the webview/Node, nothing leaves the machine.
// Licenses: mammoth BSD-2, docx MIT, pdf-lib MIT, unpdf MIT (bundles pdf.js, Apache-2.0), turndown MIT, markdown-it MIT.
import MarkdownIt from 'markdown-it';
import type {Token} from 'markdown-it';
import type {TextRun} from 'docx';
type DocxLibrary=typeof import('docx');
import type {ParagraphChild, FileChild} from 'docx';

const md = new MarkdownIt({html:false,linkify:true}).enable('table');
const headingLevels=(HeadingLevel:DocxLibrary['HeadingLevel'])=>[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6];

type Fmt={bold?:boolean;italics?:boolean;code?:boolean};
function inline(children:Token[]|null,lib:DocxLibrary):ParagraphChild[]{
 const {TextRun,ExternalHyperlink}=lib;
 const out:ParagraphChild[]=[];const f:Fmt={};let link:string|null=null;let buf:TextRun[]=[];
 const push=(r:TextRun)=>{buf.push(r);};
 const flush=()=>{if(link&&buf.length){out.push(new ExternalHyperlink({link,children:buf}));}else out.push(...buf);buf=[];};
 for(const t of children??[]){
  if(t.type==='text'||t.type==='code_inline')push(new TextRun({text:t.content,bold:f.bold,italics:f.italics,font:(t.type==='code_inline'||f.code)?'Consolas':undefined,style:link?'Hyperlink':undefined}));
  else if(t.type==='softbreak')push(new TextRun({text:' '}));
  else if(t.type==='hardbreak')push(new TextRun({break:1}));
  else if(t.type==='strong_open')f.bold=true;else if(t.type==='strong_close')f.bold=false;
  else if(t.type==='em_open')f.italics=true;else if(t.type==='em_close')f.italics=false;
  else if(t.type==='link_open'){flush();link=String(t.attrGet('href')??'');}
  else if(t.type==='link_close'){flush();link=null;}
  else if(t.type==='image')push(new TextRun({text:'['+(t.content||'image')+']',italics:true}));
 }
 flush();return out;}

function blocks(tokens:Token[],i0:number,end:(t:Token)=>boolean,ctx:{list:{ordered:boolean;level:number}[];quote:number},lib:DocxLibrary):{nodes:FileChild[];next:number}{
 const {Paragraph,TextRun,Table,TableRow,TableCell,WidthType,HeadingLevel}=lib;
 const HEAD=headingLevels(HeadingLevel);
 const nodes:FileChild[]=[];let i=i0;
 while(i<tokens.length&&!end(tokens[i])){
  const t=tokens[i];
  if(t.type==='heading_open'){nodes.push(new Paragraph({heading:HEAD[Math.min(5,Number(t.tag.slice(1))-1)],children:inline(tokens[i+1].children,lib)}));i+=3;continue;}
  if(t.type==='paragraph_open'){
   const l=ctx.list[ctx.list.length-1];
   nodes.push(new Paragraph({children:inline(tokens[i+1].children,lib),...(l?{numbering:{reference:l.ordered?'num':'bul',level:Math.min(l.level,7)}}:{}),...(ctx.quote?{indent:{left:540*ctx.quote},border:{left:{style:'single',size:12,color:'999999',space:8}}}:{})}));
   i+=3;continue;}
  if(t.type==='bullet_list_open'||t.type==='ordered_list_open'){ctx.list.push({ordered:t.type==='ordered_list_open',level:ctx.list.length});i++;continue;}
  if(t.type==='bullet_list_close'||t.type==='ordered_list_close'){ctx.list.pop();i++;continue;}
  if(t.type==='list_item_open'||t.type==='list_item_close'){i++;continue;}
  if(t.type==='blockquote_open'){ctx.quote++;i++;continue;}
  if(t.type==='blockquote_close'){ctx.quote--;i++;continue;}
  if(t.type==='fence'||t.type==='code_block'){
   for(const line of t.content.replace(/\n$/,'').split('\n'))nodes.push(new Paragraph({shading:{type:'clear',fill:'F3F4F6'},children:[new TextRun({text:line||' ',font:'Consolas',size:20})]}));
   i++;continue;}
  if(t.type==='hr'){nodes.push(new Paragraph({border:{bottom:{style:'single',size:6,color:'AAAAAA',space:1}},children:[]}));i++;continue;}
  if(t.type==='table_open'){
   const rows:InstanceType<DocxLibrary['TableRow']>[]=[];let cells:InstanceType<DocxLibrary['TableCell']>[]=[];let head=false;i++;
   while(tokens[i]&&tokens[i].type!=='table_close'){
    const c=tokens[i];
    if(c.type==='thead_open')head=true;else if(c.type==='thead_close')head=false;
    else if(c.type==='tr_open')cells=[];
    else if(c.type==='tr_close')rows.push(new TableRow({tableHeader:head,children:cells}));
    else if(c.type==='th_open'||c.type==='td_open'){
     const isH=c.type==='th_open';cells.push(new TableCell({children:[new Paragraph({children:inline(tokens[i+1].children,lib).map(x=>x),run:isH?{bold:true}:undefined})]}));i+=2;}
    i++;}
   nodes.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows}));i++;continue;}
  i++;}
 return{nodes,next:i};}

/** Markdown -> .docx bytes (headings, paragraphs, bold/italic/code/links, nested lists, quotes, code blocks, tables). */
export async function markdownToDocx(source:string):Promise<Uint8Array>{
 const lib=await import('docx');
 const {Document,Packer,Paragraph,LevelFormat,AlignmentType}=lib;
 const tokens=md.parse(source,{});
 const {nodes}=blocks(tokens,0,()=>false,{list:[],quote:0},lib);
 const lv=(f:'bullet'|'decimal')=>Array.from({length:8},(_,level)=>({level,format:f==='bullet'?LevelFormat.BULLET:LevelFormat.DECIMAL,text:f==='bullet'?'•':`%${level+1}.`,alignment:AlignmentType.START,style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}));
 const doc=new Document({numbering:{config:[{reference:'bul',levels:lv('bullet')},{reference:'num',levels:lv('decimal')}]},sections:[{children:nodes.length?nodes:[new Paragraph({children:[]})]}]});
 return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());}

/** mammoth emits header-less tables with <p> in cells; GFM tables need <th> in row 1 and flat cells. */
function tableHeaders(html:string):string{
 return html.replace(/<table>([\s\S]*?)<\/table>/g,(_m,body:string)=>{
  const flat=body.replace(/<(td|th)([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/\1>/g,'<$1$2>$3</$1>').replace(/<\/?(tbody|thead)>/g,'');
  return '<table>'+flat.replace(/<tr>([\s\S]*?)<\/tr>/,(_r,row:string)=>'<thead><tr>'+row.replace(/<td/g,'<th').replace(/<\/td>/g,'</th>')+'</tr></thead>')+'</table>';});}

/** .docx -> Markdown. mammoth (semantic HTML, drops layout) + turndown. */
export async function docxToMarkdown(bytes:Uint8Array):Promise<{markdown:string;warnings:string[]}>{
 const mammoth=(await import('mammoth/mammoth.browser.js')).default;
 const res=await mammoth.convertToHtml({arrayBuffer:Uint8Array.from(bytes).buffer},{externalFileAccess:false,includeEmbeddedStyleMap:false,convertImage:mammoth.images.imgElement(async()=>({src:''}))});
 const html=tableHeaders(res.value);
 const {default:TurndownService}=await import('turndown');
 // @ts-expect-error no bundled types (turndown-plugin-gfm, MIT)
 const {gfm}=await import('turndown-plugin-gfm');
 const td=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});
 td.use(gfm);
 td.addRule('safeLinks',{filter:'a',replacement:(content,node)=>{
  const href=('getAttribute' in node?node.getAttribute('href'):'')??'';
  return /^(https?:|mailto:|#)/i.test(href)&&!/[\u0000-\u0020<>]/.test(href)?`[${content}](<${href}>)`:content;
 }});
 td.addRule('dropEmptyImg',{filter:n=>n.nodeName==='IMG'&&!(n as Element).getAttribute('src'),replacement:()=>''});
 return{markdown:td.turndown(html).trim()+'\n',warnings:res.messages.map(m=>m.message)};}

/** .docx -> plain text. */
export async function docxToText(bytes:Uint8Array):Promise<string>{
 const mammoth=(await import('mammoth/mammoth.browser.js')).default;
 return (await mammoth.extractRawText({arrayBuffer:Uint8Array.from(bytes).buffer})).value;}

/** PDF -> text per page (merged by default). Text-layer only: scans need OCR, which is not included. */
export async function pdfToText(bytes:Uint8Array,options:{password?:string;signal?:AbortSignal}={}):Promise<{pages:string[];text:string}>{
 options.signal?.throwIfAborted();
 if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('Invalid PDF header.');
 const {getDocumentProxy}=await import('unpdf');
 const init={password:options.password,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,stopAtErrors:true,maxImageSize:16777216};
 const pdf=await getDocumentProxy(Uint8Array.from(bytes),init);
 const abort=()=>{void pdf.loadingTask.destroy();};
 options.signal?.addEventListener('abort',abort,{once:true});
 try {
  options.signal?.throwIfAborted();
  if(pdf.numPages>1000)throw Error('PDF exceeds the 1000-page safety limit.');
  const pages:string[]=[];let total=0;
  for(let i=1;i<=pdf.numPages;i++){
   options.signal?.throwIfAborted();
   const page=await pdf.getPage(i);const content=await page.getTextContent();
   let text='';let previous:{x:number;y:number;width:number}|null=null;
   for(const item of content.items){
    if(!('str' in item))continue;
    const x=item.transform[4],y=item.transform[5];
    if(previous&&text&&!text.endsWith('\n')){
     if(Math.abs(y-previous.y)>Math.max(2,Math.abs(item.transform[3])*0.5))text+='\n';
     else if(x-previous.x-previous.width>1&&!text.endsWith(' ')&&!item.str.startsWith(' '))text+=' ';
    }
    text+=item.str;if(item.hasEOL&&!text.endsWith('\n'))text+='\n';
    previous={x,y,width:item.width};
    if(total+text.length>8*1024*1024)throw Error('Extracted PDF text exceeds safety limit.');
   }
   text=text.trimEnd();pages.push(text);total+=text.length;page.cleanup();
  }
  return{pages,text:pages.join('\n\n')};
 }finally{options.signal?.removeEventListener('abort',abort);await pdf.loadingTask.destroy();}
}

export type ImageInput={bytes:Uint8Array;type:'png'|'jpg'};
export function sniffImage(b:Uint8Array):'png'|'jpg'|null{
 if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return'png';
 if(b[0]===0xff&&b[1]===0xd8)return'jpg';return null;}

/** PNG/JPEG images -> PDF, one image per page, page = image size scaled to fit A4 width at most (pt). */
export async function imagesToPdf(images:ImageInput[],opts:{fit?:'image'|'a4'}={}):Promise<Uint8Array>{
 if(!images.length)throw new Error('No images given');
 const {PDFDocument}=await import('pdf-lib');
 const pdf=await PDFDocument.create();const A4=[595.28,841.89];
 for(const im of images){
  const img=im.type==='png'?await pdf.embedPng(im.bytes):await pdf.embedJpg(im.bytes);
  if(opts.fit==='a4'){
   const page=pdf.addPage(A4 as [number,number]);const s=Math.min((A4[0]-40)/img.width,(A4[1]-40)/img.height,1);
   const w=img.width*s,h=img.height*s;page.drawImage(img,{x:(A4[0]-w)/2,y:(A4[1]-h)/2,width:w,height:h});}
  else{const page=pdf.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}}
 return pdf.save();}
