import {Stage} from './src/lib/studio3d/stage';
const tris=(st:Stage)=>{const r=(st as unknown as {root:{children:{geometry?:{index?:{count:number}} }[]}}).root.children[0];return (r.geometry?.index?.count??0)/3;};
for(const op of ['union','subtract','intersect'] as const){
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 b.position.x=0.6;b.updateMatrixWorld(true);
 const n=st.booleanOp(op,[a.id,b.id]);
 console.log(op,'->',n,'tris=',tris(st));
}
const st=new Stage();
const a=st.addPrimitive('cube');const b=st.addPrimitive('cube');
b.position.x=0.6;b.updateMatrixWorld(true);
st.booleanOp('union',[a.id,b.id]);
st.undo();
const root=(st as unknown as {root:{children:unknown[]}}).root;
console.log('after undo children=',root.children.length);
try{const s2=new Stage();const c=s2.addPrimitive('cube');const d=s2.addPrimitive('cube');d.position.x=10;d.updateMatrixWorld(true);s2.booleanOp('intersect',[c.id,d.id]);console.log('empty: NO THROW');}catch(e){console.log('empty throws:',(e as Error).message);}
try{const s3=new Stage();const c=s3.addPrimitive('cube');s3.booleanOp('union',[c.id]);console.log('one: NO THROW');}catch(e){console.log('one throws:',(e as Error).message);}
