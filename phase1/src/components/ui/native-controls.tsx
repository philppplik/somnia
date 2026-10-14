import type {ComponentProps} from 'react';
/** Deliberately bare: parity with global/bento native rules, no compact geometry surprise. */
export function NativeInput(props:ComponentProps<'input'>){return <input data-slot="native-input" {...props}/>;}
export function NativeSelect(props:ComponentProps<'select'>){return <select data-slot="native-select" {...props}/>;}
export function Textarea(props:ComponentProps<'textarea'>){return <textarea data-slot="textarea" {...props}/>;}
/** Bare action for parity-sensitive chrome; caller owns type/name/classes. */
export function NativeButton(props:ComponentProps<'button'>){return <button data-slot="native-button" {...props}/>;}
