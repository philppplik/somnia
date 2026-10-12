/** Legacy palette/menu registry. Kept separate so spec registration never imports Core registrations. */
import type { Command } from './commands';

export const commandRegistry = new Map<string, Command>();
export const registerCommand = (command: Command) => {
  commandRegistry.set(command.id, command);
  return () => {
    if (commandRegistry.get(command.id) === command) commandRegistry.delete(command.id);
  };
};
