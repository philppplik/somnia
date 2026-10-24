import {Component,type ErrorInfo,type ReactNode} from 'react';
import {copyErrorReport} from '../lib/diagnostics/hostStore';
import {describeError,reportError} from '../lib/log';
/** Keeps a failing part of the UI (a panel, a lazily loaded tool) from taking the whole app down. The error is logged; the user gets a quiet in-place message. */
export class ErrorBoundary extends Component<{label:string;children:ReactNode;compact?:boolean;onFatal?:()=>void},{failed:boolean;detail?:string;component?:string}>{
 state:{failed:boolean;detail?:string;component?:string}={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(error:unknown,info:ErrorInfo){
  // The message and the throwing component also land on the alert as data attributes: e2e error-context snapshots carry the DOM, so a CI-only crash names itself in the artifact. Redacted and bounded, nothing user-visible changes.
  const component=info.componentStack?.split('\n').slice(0,6).join('\n').slice(0,600);
  reportError(`ui.${this.props.label}`,error,{message:`${this.props.label} failed to render`,context:{componentStack:component}});this.setState({detail:error==null?undefined:describeError(error,400),component});this.props.onFatal?.();
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <div role="alert" className="flex flex-col items-start gap-2 p-4 text-[12px] text-ink-2" data-testid="error-boundary" data-error={this.state.detail} data-component={this.state.component}>
   <strong data-copyable>{this.props.label} could not be loaded.</strong>
   {this.state.detail&&<span className="sr-only">{this.state.detail}{this.state.component?` at ${this.state.component}`:''}</span>}
   <span data-copyable>Your project is safe. The details were written to the log.</span>
   <span className="flex gap-2">
    <button type="button" className="underline" onClick={()=>this.setState({failed:false})}>Try again</button>
    <button type="button" className="underline" onClick={()=>void copyErrorReport()}>Copy error report</button>
    {!this.props.compact&&<button type="button" className="underline" onClick={()=>location.reload()}>Reload app</button>}
   </span>
  </div>;
 }
}
