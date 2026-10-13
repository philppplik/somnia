import {useState} from 'react';
export default function App(){
 const [count,setCount]=useState(0);
 return <main><p className="eyebrow">Made with Somnia</p><h1>Your next idea starts here.</h1><p>Edit this page in src/App.tsx and save. Your preview updates.</p><button onClick={()=>setCount(n=>n+1)}>Clicked {count} times</button><p role="status" aria-live="polite">{count>0?'You have a working React app.':''}</p></main>;
}
