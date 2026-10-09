import {zipSync,strToU8} from 'fflate';

const xml=(body:string)=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body;
const rels=(body:string)=>xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+body+'</Relationships>');
const relationship=(id:string,type:string,target:string)=>`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const types=(parts:Record<string,string>)=>xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+Object.entries(parts).map(([path,type])=>`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')+'</Types>');
const pack=(parts:Record<string,string>)=>zipSync(Object.fromEntries(Object.entries(parts).map(([path,text])=>[path,strToU8(text)])),{level:6});

/** One empty paragraph, not sample copy. The existing document engine can place a caret here. */
export function blankDocx():Uint8Array{return pack({
 '[Content_Types].xml':types({'word/document.xml':'wordprocessingml.document.main'}),
 '_rels/.rels':rels(relationship('rId1','officeDocument','word/document.xml')),
 'word/document.xml':xml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'),
});}
/** A real empty worksheet. No dummy A1 value or fake used range. */
export function blankXlsx():Uint8Array{return pack({
 '[Content_Types].xml':types({'xl/workbook.xml':'spreadsheetml.sheet.main','xl/worksheets/sheet1.xml':'spreadsheetml.worksheet'}),
 '_rels/.rels':rels(relationship('rId1','officeDocument','xl/workbook.xml')),
 'xl/workbook.xml':xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet 1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
 'xl/_rels/workbook.xml.rels':rels(relationship('rId1','worksheet','worksheets/sheet1.xml')),
 'xl/worksheets/sheet1.xml':xml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
});}
/** One white 16:9 slide with an empty editable text box. No template/sample text. */
export function blankPptx():Uint8Array{
 const ns='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
 const group='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
 const colorMap='<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
 const theme=xml('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Somnia"><a:themeElements><a:clrScheme name="Somnia">'+Object.entries({dk1:'000000',lt1:'FFFFFF',dk2:'1F2937',lt2:'F8F9FB',accent1:'6366F1',accent2:'14B8A6',accent3:'F59E0B',accent4:'EC4899',accent5:'3B82F6',accent6:'84CC16',hlink:'2563EB',folHlink:'7C3AED'}).map(([k,v])=>`<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')+'</a:clrScheme><a:fontScheme name="Somnia"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Somnia"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>');
 return pack({
 '[Content_Types].xml':types({'ppt/presentation.xml':'presentationml.presentation.main','ppt/slides/slide1.xml':'presentationml.slide','ppt/slideLayouts/slideLayout1.xml':'presentationml.slideLayout','ppt/slideMasters/slideMaster1.xml':'presentationml.slideMaster','ppt/theme/theme1.xml':'theme'}),
 '_rels/.rels':rels(relationship('rId1','officeDocument','ppt/presentation.xml')),
 'ppt/presentation.xml':xml(`<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`),
 'ppt/_rels/presentation.xml.rels':rels(relationship('rId1','slide','slides/slide1.xml')+relationship('rId2','slideMaster','slideMasters/slideMaster1.xml')),
 'ppt/slides/slide1.xml':xml(`<p:sld ${ns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10363200" cy="5029200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t></a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`),
 'ppt/slides/_rels/slide1.xml.rels':rels(relationship('rId1','slideLayout','../slideLayouts/slideLayout1.xml')),
 'ppt/slideLayouts/slideLayout1.xml':xml(`<p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`),
 'ppt/slideLayouts/_rels/slideLayout1.xml.rels':rels(relationship('rId1','slideMaster','../slideMasters/slideMaster1.xml')),
 'ppt/slideMasters/slideMaster1.xml':xml(`<p:sldMaster ${ns}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colorMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`),
 'ppt/slideMasters/_rels/slideMaster1.xml.rels':rels(relationship('rId1','slideLayout','../slideLayouts/slideLayout1.xml')+relationship('rId2','theme','../theme/theme1.xml')),
 'ppt/theme/theme1.xml':theme,
 });
}
/** One second of editable silence, stereo PCM16 at 48 kHz. Sound currently edits sample buffers. */
export function blankWav():Uint8Array{
 const frames=48000,channels=2,bytes=frames*channels*2;const out=new Uint8Array(44+bytes);const v=new DataView(out.buffer);const tag=(offset:number,text:string)=>out.set(strToU8(text),offset);
 tag(0,'RIFF');v.setUint32(4,36+bytes,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,48000,true);v.setUint32(28,48000*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,bytes,true);return out;
}

/** Case-insensitive tab identity, shared by all generated documents. Never replace an open file. */
export function blankName(base:string,existing:readonly string[]):string{
 const taken=new Set(existing.map(n=>n.toLowerCase()));if(!taken.has(base.toLowerCase()))return base;
 const dot=base.lastIndexOf('.'),stem=dot<0?base:base.slice(0,dot),ext=dot<0?'':base.slice(dot);
 for(let i=2;;i++){const name=`${stem}-${i}${ext}`;if(!taken.has(name.toLowerCase()))return name;}
}
