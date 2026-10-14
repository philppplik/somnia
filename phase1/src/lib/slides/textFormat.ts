/** Preset text colours. Hex lives here (not in TSX) because these are document content, not app chrome. */
export const TEXT_COLORS=[
  {key:'black',hex:'000000'},{key:'white',hex:'FFFFFF'},{key:'gray',hex:'595959'},{key:'navy',hex:'1F2A5A'},
  {key:'blue',hex:'1F5FBF'},{key:'green',hex:'2E7D32'},{key:'orange',hex:'D9730D'},{key:'red',hex:'C62828'},
] as const;
export const colorKey=(hex:string|null)=>hex?TEXT_COLORS.find(c=>c.hex===hex.toUpperCase())?.key??null:null;
