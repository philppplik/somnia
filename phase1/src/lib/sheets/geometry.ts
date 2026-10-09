import type {SheetLayout} from './protocol';
/** Column/row positions with per-line sizes from the file. Lines without an entry use the default. Hidden lines have size 0. */
export class Geometry{
 private colStarts:number[]=[];private rowStarts:number[]=[];
 private colSize=new Map<number,number>();private rowSize=new Map<number,number>();
 constructor(readonly layout:SheetLayout|null,readonly totalRows:number,readonly totalCols:number){
  const dw=layout?.defaultColWidth??104,dh=layout?.defaultRowHeight??24;
  for(const c of layout?.cols??[])this.colSize.set(c.i,c.hidden?0:Math.max(0,c.w));
  for(const r of layout?.rows??[])this.rowSize.set(r.i,r.hidden?0:Math.max(0,r.h));
  let x=0;for(let c=0;c<totalCols;c++){this.colStarts.push(x);x+=this.colSize.get(c)??dw;}this.colStarts.push(x);
  let y=0;for(let r=0;r<totalRows;r++){this.rowStarts.push(y);y+=this.rowSize.get(r)??dh;}this.rowStarts.push(y);
 }
 colLeft(c:number){return this.colStarts[Math.min(c,this.totalCols)];}
 colWidth(c:number){return this.colStarts[c+1]-this.colStarts[c];}
 rowTop(r:number){return this.rowStarts[Math.min(r,this.totalRows)];}
 rowHeight(r:number){return this.rowStarts[r+1]-this.rowStarts[r];}
 get width(){return this.colStarts[this.totalCols];}
 get height(){return this.rowStarts[this.totalRows];}
 private find(starts:number[],n:number,pos:number){let lo=0,hi=n-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=pos)lo=mid;else hi=mid-1;}return lo;}
 colAt(x:number){return this.find(this.colStarts,this.totalCols,Math.max(0,x));}
 rowAt(y:number){return this.find(this.rowStarts,this.totalRows,Math.max(0,y));}
 /** Visible window with overscan, clamped to the engine read cap (10,000 cells). */
 window(scrollTop:number,scrollLeft:number,width:number,height:number,overscan=2){
  const r0=Math.max(0,this.rowAt(scrollTop)-overscan),c0=Math.max(0,this.colAt(scrollLeft)-overscan);
  const r1=Math.min(this.totalRows-1,this.rowAt(scrollTop+height)+overscan),c1=Math.min(this.totalCols-1,this.colAt(scrollLeft+width)+overscan);
  const rows=Math.min(r1-r0+1,100),cols=Math.min(c1-c0+1,60);
  return{row:r0,col:c0,rows:Math.max(1,rows),cols:Math.max(1,cols)};}
}
