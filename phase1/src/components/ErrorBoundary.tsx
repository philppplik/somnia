import {Component,type ErrorInfo,type ReactNode} from 'react';
import {copyErrorReport,reportError} from '../lib/log';
/** Keeps a failing part of the UI (a panel, a lazily loaded tool) from taking the whole app down. The error is logged; the user gets a quiet in-place message. */
export class ErrorBoundary extends Component<{label:string;children:ReactNode;compact?:boolean},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(error:unknown,info:ErrorInfo){reportError(`ui.${this.props.label}`,error,{message:`${this.props.label} failed to render`,context:{componentStack:info.componentStack?.split('\n').slice(0,6).join('\n')}});}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div role="alert" className="flex flex-col items-start gap-2 p-4 text-[12px] text-ink-2" data-testid="error-boundary">
   <strong>{this.props.label} could not be loaded.</strong>
   <span>Your project is safe. The details were written to the log.</span>
   <span className="flex gap-2">
    <button type="button" className="underline" onClick={()=>this.setState({failed:false})}>Try again</button>
    <button type="button" className="underline" onClick={()=>void copyErrorReport()}>Copy error report</button>
    {!this.props.compact&&<button type="button" className="underline" onClick={()=>location.reload()}>Reload app</button>}
   </span>
  </div>;
 }
}
