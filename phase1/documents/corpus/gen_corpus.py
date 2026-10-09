#!/usr/bin/env python3
"""Generates the small DOCX corpus used by the adapter fuzz/roundtrip tests. Hand-written OOXML, no Word needed.
Each file stresses one feature family the editor must either preserve or refuse. Run: python3 gen_corpus.py"""
import zipfile, os
W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
CT='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>{extra}</Types>'
RELS='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
STYLES=f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>'
def r(t,rpr=''): return f'<w:r>{"<w:rPr>"+rpr+"</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{t}</w:t></w:r>'
def p(*runs,ppr=''): return f'<w:p>{"<w:pPr>"+ppr+"</w:pPr>" if ppr else ""}{"".join(runs)}</w:p>'
def doc(body,sect='<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'):
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>{body}{sect}</w:body></w:document>'
def write(name,body,extra_parts=None,extra_ct='',extra_rels=''):
    rels=RELS
    docrels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+extra_rels+'</Relationships>'
    with zipfile.ZipFile(name,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',CT.format(extra=extra_ct));z.writestr('_rels/.rels',rels)
        z.writestr('word/_rels/document.xml.rels',docrels);z.writestr('word/styles.xml',STYLES);z.writestr('word/document.xml',body)
        for k,v in (extra_parts or {}).items(): z.writestr(k,v)
B,I,U='<w:b/>','<w:i/>','<w:u w:val="single"/>'
files={}
files['multirun.docx']=doc(p(r('Plain '),r('bold',B),r(' then '),r('italic',I),r(' and '),r('both',B+I),r(' with '),r('red','<w:color w:val="FF0000"/>'),r(' tail.'))+p(r('Heading',B),ppr='<w:pStyle w:val="Heading1"/>')+p(r('Centered ',I),r('text',U),ppr='<w:jc w:val="center"/>')+p(r('Äöü ß € 😀 日本語 مرحبا'),r(' mixed ',B),r('Ελληνικά')))
files['table.docx']=doc(p(r('Before table'))+'<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'+p(r('After table')))
files['hyperlink-field.docx']=doc(p(r('Visit '),'<w:hyperlink w:anchor="top"><w:r><w:t>the link</w:t></w:r></w:hyperlink>',r(' now.'))+p(r('Page '),'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')+p(r('Plain paragraph after.')))
files['numbered-list.docx']=doc(''.join(p(r(f'Item {i}'),ppr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') for i in range(1,5))+p(r('After list')))
files['tracked-changes.docx']=doc(p(r('Kept '),'<w:ins w:id="1" w:author="A" w:date="2025-01-01T00:00:00Z"><w:r><w:t>inserted</w:t></w:r></w:ins>',r(' and '),'<w:del w:id="2" w:author="A" w:date="2025-01-01T00:00:00Z"><w:r><w:delText>deleted</w:delText></w:r></w:del>',r(' end.')))
files['section-break.docx']=doc(p(r('Section one'),ppr='<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>')+p(r('Section two')))
files['empty-and-spaces.docx']=doc(p()+p(r('   leading and trailing   '))+p()+p(r('x'))+p(r('tab\there'.replace('\t','</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>'))))
files['line-breaks.docx']=doc(p(r('Line one'),'<w:r><w:br/></w:r>',r('line two'))+p(r('Plain')))
long_text=' '.join(f'word{i}' for i in range(900))
files['long-paragraph.docx']=doc(p(r(long_text))+p(r('short')))
files['many-paragraphs.docx']=doc(''.join(p(r(f'Paragraph {i}. '),r('bold part',B),r(' tail')) for i in range(300)))
files['headers.docx']=doc(p(r('Body with header'))+'',sect='<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>')
for n,b in files.items():
    if n=='headers.docx':
        write(n,b,{'word/header1.xml':f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {W}><w:p><w:r><w:t>Header text</w:t></w:r></w:p></w:hdr>'},'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>','<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>')
    else: write(n,b)
print(len(files),'files')
