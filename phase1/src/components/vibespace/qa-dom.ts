/** Installs jsdom globals BEFORE react-dom loads (React reads canUseDOM at import). QA only. */
import {JSDOM} from 'jsdom';
export const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true});
