/**
 * Layer rules (ENGINE-HARDENING-PLAN step 4). Layers, low to high:
 *   packages/editor-core
 *   < src/lib (non-UI logic)
 *   < src/lib/agent, src/lib/studios, per-studio libs
 *   < src/store
 *   < src/components
 *   < src/App.tsx, src/main.tsx
 * No upward imports, no cycles, editor-core has no React/DOM packages.
 * Existing violations live in .dependency-cruiser-known-violations.json
 * (see docs/LAYERS.md); `npm run check:layers` fails only on new ones.
 * Test files are not checked.
 */
const TESTS = '\\.(test|spec)\\.[cm]?[jt]sx?$';
const STUDIO_LIBS =
  '^src/lib/(agent|studios|collab|design|vectorstudio|vectorcore|vectorio|pdfedit|pdfforms|pdfannotate|pdftext|pdfview|craft|imageedit|imgedit|image-editor|photos|sheets|slides|sound|video|documents|vibespace|extensions|git|svgedit|visualDiff)/';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No import cycles.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'editor-core-is-lowest',
      severity: 'error',
      comment: 'packages/editor-core must not import from src/ or the app.',
      from: { path: '^packages/editor-core/' },
      to: { path: '^src/' },
    },
    {
      name: 'editor-core-no-react-dom',
      severity: 'error',
      comment: 'packages/editor-core has no React or DOM-framework dependencies.',
      from: { path: '^packages/editor-core/' },
      to: { path: '(^|/)node_modules/(react|react-dom|@radix-ui|jsdom|happy-dom)(/|$)' },
    },
    {
      name: 'lib-not-up',
      severity: 'error',
      comment: 'src/lib is non-UI logic: it must not import src/store, src/components, App or main.',
      from: { path: '^src/lib/' },
      to: { path: '^src/(store/|components/|App\\.tsx$|main\\.tsx$)' },
    },
    {
      name: 'store-not-up',
      severity: 'error',
      comment: 'src/store must not import src/components, App or main.',
      from: { path: '^src/store/' },
      to: { path: '^src/(components/|App\\.tsx$|main\\.tsx$)' },
    },
    {
      name: 'components-not-up',
      severity: 'error',
      comment: 'src/components must not import App or main.',
      from: { path: '^src/components/' },
      to: { path: '^src/(App\\.tsx$|main\\.tsx$)' },
    },
    {
      name: 'app-entry-is-top',
      severity: 'error',
      comment: 'Nothing but main.tsx imports App.tsx; nothing imports main.tsx.',
      from: { path: '^src/', pathNot: '^src/main\\.tsx$' },
      to: { path: '^src/(App|main)\\.tsx$' },
    },
    {
      name: 'lib-core-not-up-to-studios',
      severity: 'error',
      comment:
        'Root-level src/lib modules are the low lib layer; they must not import agent/studio libs.',
      from: { path: '^src/lib/[^/]+\\.[cm]?[jt]sx?$' },
      to: { path: STUDIO_LIBS },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: TESTS },
    tsPreCompilationDeps: true,
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
