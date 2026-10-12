/** Wires the control hook (lives outside src/lib because it reads the store) to the real app. Only imported behind VITE_SOMNIA_CONTROL=1 (see main.tsx). */
import { commandDispatcher } from '../lib/commandDispatcher';
import { listCommands, executeCommand } from '../lib/commands';
import { problemsStore } from '../lib/problemsRuntime';
import { getState } from '../store/appStore';
import { createControl } from '../lib/control/webControl';

export function installWebControl(target: object = window): void {
  const control = createControl({
    dispatcher: commandDispatcher,
    readState: () => {
      const s = getState();
      return {
        activeStudio: s.activeStudio,
        activeFile: s.activeFile,
        openFiles: [...s.openFiles],
        selectedElementIds: [...s.selectedElementIds],
        isDirty: s.isDirty,
        projectName: s.projectName,
        panels: { sidebarOpen: s.sidebarOpen, inspectorOpen: s.inspectorOpen, agentOpen: s.agentOpen, problemsOpen: s.problemsOpen, settingsOpen: s.settingsOpen, paletteOpen: s.paletteOpen },
        problems: problemsStore.getSnapshot().map(p => ({ severity: p.severity, studio: p.studio, message: p.message, ...(p.file ? { file: p.file } : {}) })),
      };
    },
    legacy: { has: id => listCommands().some(c => c.id === id), run: async id => { await executeCommand(id); } },
  });
  Object.defineProperty(target, '__somniaControl', { value: control, configurable: false, enumerable: false, writable: false });
}
