/** Preset text colours. Hex lives here (not in TSX) because these are document content, not app chrome. */
export const TEXT_COLORS=[
  {key:'black',hex:'000000'},{key:'white',hex:'FFFFFF'},{key:'gray',hex:'595959'},{key:'navy',hex:'1F2A5A'},
  {key:'blue',hex:'1F5FBF'},{key:'green',hex:'2E7D32'},{key:'orange',hex:'D9730D'},{key:'red',hex:'C62828'},
] as const;
export const colorKey=(hex:string|null)=>hex?TEXT_COLORS.find(c=>c.hex===hex.toUpperCase())?.key??null:null;

/** Preset gradient fills (from, to, angle) as palette keys, resolved to hex through TEXT_COLORS. */
export const GRADIENT_PRESETS=[
  {key:'ocean',from:'1F2A5A',to:'1F5FBF',angle:90},{key:'sunset',from:'D9730D',to:'C62828',angle:45},
  {key:'forest',from:'2E7D32',to:'1F5FBF',angle:0},{key:'slate',from:'595959',to:'FFFFFF',angle:90},
] as const;
export const OPACITY_STEPS=[100,75,50,25] as const;
export const LINE_WIDTHS=[0.75,1,2,4,8] as const;
