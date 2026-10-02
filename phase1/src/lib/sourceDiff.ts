export interface DiffLine{kind:'same'|'removed'|'added';text:string;diskLine?:number;editorLine?:number}
export function sourceDiff(disk:string,editor:string):{lines:DiffLine[];limited:boolean}{
 const a=disk.split('\n'),b=editor.split('\n');
 // Bounded comparison avoids freezing the desktop on large source files.
 if(a.length*b.length>250000||disk.length+editor.length>500000)return {lines:[],limited:true};
 const dp=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const lines:DiffLine[]=[];let i=0,j=0;
 while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){lines.push({kind:'same',text:a[i],diskLine:i+1,editorLine:j+1});i++;j++;}else if(i<a.length&&(j===b.length||dp[i+1][j]>=dp[i][j+1])){lines.push({kind:'removed',text:a[i],diskLine:++i});}else{lines.push({kind:'added',text:b[j],editorLine:++j});}}
 return {lines,limited:false};
}
