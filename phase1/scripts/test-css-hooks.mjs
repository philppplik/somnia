// tsx test hook: components may import their own .css (Vite handles it in the app);
// under plain tsx the ESM loader cannot parse CSS, so tests stub it as an empty module.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default {};', shortCircuit: true };
  }
  return nextLoad(url, context);
}
