/** Local document conversion. Pure byte-in/byte-out API: never writes or fetches user files. */
import type {Content, ContentText, TDocumentDefinitions} from 'pdfmake/interfaces';
import type {Token} from 'markdown-it';

export type DocumentFormat = 'md' | 'pdf' | 'txt' | 'docx';
export interface DocumentConversionRequest {
  from: DocumentFormat;
  to: DocumentFormat;
  data: Uint8Array;
  /** Used as PDF metadata only. */
  title?: string;
  /** Password is used only in memory for PDF opening, never retained. */
  password?: string;
  signal?: AbortSignal;
  /** Page size for Markdown -> PDF. Default A4; callers pass paperFor(units pref, locale). */
  paper?: 'A4' | 'Letter';
}
export interface DocumentConversionResult {
  data: Uint8Array;
  mimeType: string;
  extension: DocumentFormat;
  warnings: string[];
}
export const DOCUMENT_CONVERSIONS = [
  {from:'md', to:'pdf'}, {from:'pdf', to:'txt'},
  {from:'pdf', to:'docx'}, {from:'docx', to:'md'},
] as const;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 8 * 1024 * 1024;
const utf8 = new TextEncoder();
const mimes: Record<DocumentFormat,string> = {
  md:'text/markdown;charset=utf-8', txt:'text/plain;charset=utf-8', pdf:'application/pdf',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted(); }
function warn(list: string[], message: string) { if (!list.includes(message)) list.push(message); }
function validateZip(data: Uint8Array) {
  // Check central-directory sizes before any DOCX library inflates ZIP entries.
  let end = -1;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i=data.length-22; i>=Math.max(0,data.length-65557); i--) {
    if (view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===data.length) {end=i;break;}
  }
  if (end<0) throw Error('Invalid DOCX: ZIP directory is missing.');
  const count=view.getUint16(end+10,true), size=view.getUint32(end+12,true), offset=view.getUint32(end+16,true);
  if (view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0 || count===65535 || offset===0xffffffff || size===0xffffffff) throw Error('Multi-volume and ZIP64 DOCX files are not supported.');
  if (offset+size>end || count>10000) throw Error('Invalid or oversized DOCX ZIP directory.');
  let cursor=offset, total=0, hasDocument=false;
  for(let i=0;i<count;i++) {
    if(cursor+46>offset+size || view.getUint32(cursor,true)!==0x02014b50) throw Error('Invalid DOCX ZIP entry.');
    const nameLen=view.getUint16(cursor+28,true), extraLen=view.getUint16(cursor+30,true), commentLen=view.getUint16(cursor+32,true);
    const next=cursor+46+nameLen+extraLen+commentLen;
    if(next>offset+size) throw Error('Invalid DOCX ZIP entry size.');
    if(view.getUint16(cursor+8,true)&1) throw Error('Encrypted DOCX ZIP entries are not supported.');
    total+=view.getUint32(cursor+24,true);
    if(total>64*1024*1024) throw Error('DOCX expands beyond the 64 MiB safety limit.');
    const name=new TextDecoder().decode(data.subarray(cursor+46,cursor+46+nameLen));
    if(name==='word/document.xml') hasDocument=true;
    cursor=next;
  }
  if(!hasDocument) throw Error('Invalid DOCX: word/document.xml is missing.');
}

/** Convert only one of the explicitly advertised pairs. No layout-preserving PDF claim. */
export async function convertDocument(request: DocumentConversionRequest): Promise<DocumentConversionResult> {
  const {from,to,data,signal}=request;
  checkAbort(signal);
  if(!DOCUMENT_CONVERSIONS.some(pair=>pair.from===from && pair.to===to)) throw Error(`Unsupported document conversion: ${from} -> ${to}.`);
  if(!data.length) throw Error('The input document is empty.');
  if(data.length>MAX_INPUT_BYTES) throw Error('Document exceeds the 32 MiB input limit.');
  const warnings: string[]=[];
  let output: Uint8Array;
  if(from==='md') {
    let source: string;
    try {source=new TextDecoder('utf-8',{fatal:true}).decode(data);} catch {throw Error('Markdown must be UTF-8 encoded.');}
    const definition=await markdownDefinition(source,request.title,warnings,request.paper);
    checkAbort(signal);
    const [pdfModule,fontsModule]=await Promise.all([import('pdfmake/build/pdfmake.js'),import('pdfmake/build/vfs_fonts.js')]);
    const pdfMake=pdfModule.default ?? pdfModule;
    const fonts=(fontsModule.default ?? fontsModule) as unknown as Record<string,string>;
    // Supplying a VFS and no URL resolver keeps fonts embedded and offline.
    output=await new Promise<Uint8Array>((resolve,reject)=>{
      try {
        const pdf=pdfMake.createPdf(definition,undefined,undefined,fonts);
        pdf.getBuffer(buffer=>resolve(Uint8Array.from(buffer)));
      }catch(error){reject(error);}
    });
  } else if(from==='pdf') {
    const {pdfToText}=await import('../convert/docConvert');
    const result=await pdfToText(data,{password:request.password,signal});
    const pages=result.pages;
    for(let i=0;i<pages.length;i++)if(!pages[i].trim())warn(warnings,`Page ${i+1} has no extractable text. Scanned/image-only PDFs need OCR, which is not included.`);
    warn(warnings,'PDF text is extracted in content-stream order; columns and complex reading order may need correction.');
    if(to==='txt') output=utf8.encode(pages.join('\n\f\n'));
    else {
      const {Document,Packer,Paragraph,TextRun}=await import('docx');
      const paragraphs=pages.flatMap((page,index)=>page.split('\n').map((line,lineIndex)=>new Paragraph({
        children:[new TextRun(line)], pageBreakBefore:index>0 && lineIndex===0,
      })));
      const doc=new Document({sections:[{children:paragraphs}]});
      output=new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
      warn(warnings,'PDF to DOCX reconstructs text and page breaks only. Original layout, tables, images, fonts and reading order are not preserved.');
    }
  } else {
    validateZip(data);
    const {docxToMarkdown}=await import('../convert/docConvert');
    const result=await docxToMarkdown(data);
    result.warnings.forEach(message=>warn(warnings,message));
    if(result.markdown.length>MAX_TEXT_CHARS)throw Error('Converted DOCX text exceeds the safety limit.');
    output=utf8.encode(result.markdown);
    warn(warnings,'DOCX to Markdown preserves semantic text, not Word page layout. Embedded images, comments, tracked changes and advanced formatting may be lost.');
  }
  checkAbort(signal);
  return {data:output,mimeType:mimes[to],extension:to,warnings};
}

async function markdownDefinition(source: string,title: string|undefined,warnings: string[],paper: 'A4'|'Letter'='A4'):Promise<TDocumentDefinitions> {
  const {default:MarkdownIt}=await import('markdown-it');
  const md=new MarkdownIt({html:false});
  const tokens=md.parse(source,{});
  function inline(token:Token|undefined):ContentText['text'] {
    const runs:ContentText[]=[];let bold=false,italics=false,strike=false;
    for(const t of token?.children??[]) {
      if(t.type==='strong_open')bold=true;else if(t.type==='strong_close')bold=false;
      else if(t.type==='em_open')italics=true;else if(t.type==='em_close')italics=false;
      else if(t.type==='s_open')strike=true;else if(t.type==='s_close')strike=false;
      else if(t.type==='image'){warn(warnings,'Markdown images are omitted. No remote or local image files are fetched.');runs.push({text:`[image: ${t.content}]`});}
      else if(t.type==='softbreak'||t.type==='hardbreak')runs.push({text:'\n'});
      else if(t.type==='text'||t.type==='code_inline')runs.push({text:t.content,bold,italics,decoration:strike?'lineThrough':undefined,background:t.type==='code_inline'?'#f0f0f0':undefined});
    }
    return runs.length?runs:'';
  }
  let index=0;
  function blocks(stop?:string):Content[] {
    const out:Content[]=[];
    while(index<tokens.length) {
      const t=tokens[index++];
      if(t.type===stop)break;
      if(t.type==='heading_open') {out.push({text:inline(tokens[index++]),fontSize:Math.max(12,26-Number(t.tag.slice(1))*2),bold:true,margin:[0,12,0,6]});index++;}
      else if(t.type==='paragraph_open'){out.push({text:inline(tokens[index++]),margin:[0,0,0,8]});index++;}
      else if(t.type==='fence'||t.type==='code_block')out.push({text:t.content,fontSize:9,background:'#f0f0f0',margin:[0,4,0,8],preserveLeadingSpaces:true});
      else if(t.type==='hr')out.push({canvas:[{type:'line',x1:0,y1:0,x2:499,y2:0,lineWidth:0.5,lineColor:'#aaaaaa'}],margin:[0,8,0,8]});
      else if(t.type==='blockquote_open')out.push({stack:blocks('blockquote_close'),margin:[16,4,0,8],color:'#555555'});
      else if(t.type==='bullet_list_open'||t.type==='ordered_list_open') {
        const close=t.type==='bullet_list_open'?'bullet_list_close':'ordered_list_close';const items:Content[]=[];
        while(index<tokens.length && tokens[index].type!==close) {
          if(tokens[index++].type==='list_item_open')items.push({stack:blocks('list_item_close')});
        }
        index++;
        out.push(t.type==='bullet_list_open'?{ul:items,margin:[0,2,0,8]}:{ol:items,start:Number(t.attrGet('start')??1),margin:[0,2,0,8]});
      } else if(t.type==='table_open') {
        const rows:Content[][]=[];let row:Content[]=[];
        while(index<tokens.length && tokens[index].type!=='table_close') {
          const cell=tokens[index++];
          if(cell.type==='tr_open')row=[];
          if(cell.type==='th_open'||cell.type==='td_open')row.push({text:inline(tokens[index++]),bold:cell.type==='th_open',margin:[2,2,2,2]});
          if(cell.type==='tr_close')rows.push(row);
        }
        index++;
        if(rows.length)out.push({table:{headerRows:1,widths:rows[0].map(()=>'*'),body:rows},margin:[0,4,0,8]});
      }
    }
    return out;
  }
  const content=blocks();
  warn(warnings,'Markdown PDF uses bundled Roboto fonts. Unsupported writing systems or emoji may not render; math is exported as source text.');
  return {info:{title:title??'Somnia document'},pageSize:paper==='Letter'?'LETTER':'A4',pageMargins:[48,48,48,48],defaultStyle:{font:'Roboto',fontSize:11,lineHeight:1.25},content:content.length?content:[{text:''}]};
}
