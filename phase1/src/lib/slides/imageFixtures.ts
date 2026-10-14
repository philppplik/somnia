/** Minimal PNG/JPEG headers for tests: valid for sniffImage, not decodable images. */
export function png(w:number,h:number,pad=16){
  const b=new Uint8Array(33+pad);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52]);
  const dv=new DataView(b.buffer);dv.setUint32(16,w);dv.setUint32(20,h);b[24]=8;b[25]=6;return b;
}
export function jpeg(w:number,h:number){
  const b=new Uint8Array(2+18+19+4);b.set([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0],0);
  const o=20;b.set([0xff,0xc0,0,17,8,h>>8,h&255,w>>8,w&255,3,1,0x22,0,2,0x11,1,3,0x11,1],o);b.set([0xff,0xd9,0,0],o+19);return b;
}
