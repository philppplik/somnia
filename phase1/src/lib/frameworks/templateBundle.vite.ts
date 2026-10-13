/** Vite-only asset collection. Load lazily when creating a project, never during adapter registration. */
const bundled=import.meta.glob('./templates/react-*/**/*',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
// Vite glob omits dotfiles unless requested explicitly.
const hidden=import.meta.glob(['./templates/react-*/.gitignore'],{query:'?raw',import:'default',eager:true}) as Record<string,string>;
export const templateFiles:Readonly<Record<string,string>>={...bundled,...hidden};
