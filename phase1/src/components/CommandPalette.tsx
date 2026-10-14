import {NativeInput} from './ui/native-controls';
import { cn } from "../lib/cn";
import { useEffect, useRef, useState } from "react";
import { Search, Terminal } from "../lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import {
  commandEnabled,
  executeCommand,
  formatShortcut,
  listCommands,
} from "../lib/commands";
import { patchState, useAppStore } from "../store/appStore";
import { useT } from "../lib/useT";
import { commandDispatcher } from "../lib/commandDispatcher";
import {
  buildPaletteEntries,
  rankEntries,
  type PaletteEntry,
} from "../lib/paletteModel";
import { SchemaForm } from "./SchemaForm";
import { hasFormParameters } from "../lib/schemaFormModel";
export function CommandPalette() {
  const { t } = useT();
  const state = useAppStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PaletteEntry | null>(null);
  useEffect(() => {
    if (state.paletteOpen) {
      setQuery("");
      setIndex(0);
      setPending(null);
    }
  }, [state.paletteOpen]);
  useEffect(() => {
    if (pending)
      document
        .querySelector<HTMLElement>(
          '[data-testid="schema-form"] input:not([disabled]), [data-testid="schema-form"] select:not([disabled]), [data-testid="schema-form"] textarea:not([disabled])',
        )
        ?.focus();
    else input.current?.focus();
  }, [pending]);
  const legacy = listCommands();
  const byId = new Map(legacy.map((c) => [c.id, c]));
  const results = rankEntries(
    buildPaletteEntries(commandDispatcher.list(), legacy),
    query,
    state.recentCommands,
  );
  const enabled = (entry: PaletteEntry) => {
    const c = byId.get(entry.id);
    return c ? commandEnabled(c) : true;
  };
  const selected = Math.min(index, Math.max(0, results.length - 1));
  useEffect(() => {
    document
      .getElementById(`command-option-${selected}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const run = (entry: PaletteEntry) => {
    if (hasFormParameters(entry.schema)) {
      setPending(entry);
      return;
    }
    patchState({ paletteOpen: false });
    void executeCommand(entry.id);
  };
  return (
    <Dialog
      open={state.paletteOpen}
      onOpenChange={(open) => patchState({ paletteOpen: open })}
    >
      <DialogContent initialFocus={input}>
        <DialogTitle className="sr-only">
          {t("rest.commandPalette.commandPalette")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("finish.palette.description")}
        </DialogDescription>
        {!pending && (
          <div className="flex h-14 items-center gap-3 border-b border-subtle px-4 text-ink-2 [&_input]:h-12 [&_input]:flex-1 [&_input]:border-0! [&_input]:bg-transparent! [&_input]:text-[16px]!">
            <Search size={18} />
            <NativeInput
              ref={input}
              role="combobox"
              aria-label={t("rest.commandPalette.searchCommands")}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={
                results.length ? `command-option-${selected}` : undefined
              }
              value={query}
              placeholder={t("rest.commandPalette.typeACommand")}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setIndex(
                    results.length
                      ? (selected +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          results.length) %
                          results.length
                      : 0,
                  );
                }
                if (event.key === "Enter" && results[selected]) {
                  event.preventDefault();
                  if (enabled(results[selected])) run(results[selected]);
                }
              }}
            />
            <kbd>{t("rest.commandPalette.esc")}</kbd>
          </div>
        )}
        {pending && (
          <div className="max-h-[65vh] overflow-auto p-4">
            <h2 className="mb-3 text-sm font-medium">{pending.title}</h2>
            <SchemaForm
              key={pending.id}
              schema={pending.schema!}
              onCancel={() => {
                setPending(null);
                input.current?.focus();
              }}
              submitLabel={t("finish.palette.run")}
              onSubmit={(values) => {
                patchState({ paletteOpen: false });
                void executeCommand(pending.id, values);
              }}
            />
          </div>
        )}
        {!pending && (
          <div className="px-4 pb-1 pt-3 text-[10px] uppercase tracking-[.1em] text-ink-3">
            {query
              ? t("finish.palette.results")
              : state.recentCommands.length
                ? t("finish.palette.recent")
                : t("finish.palette.all")}
          </div>
        )}
        {!pending && (
          <div
            id="command-list"
            className="max-h-[360px] overflow-auto px-2 pb-2 pt-1"
            role="listbox"
            aria-label={t("rest.commandPalette.commands")}
          >
            {results.map((command, i) => (
              <div
                key={command.id}
                id={`command-option-${i}`}
                role="option"
                aria-selected={i === selected}
                aria-disabled={!enabled(command)}
                className={cn(
                  "flex h-12 cursor-pointer items-center gap-3 rounded-[6px] px-3 text-xs leading-[1.45] aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_small]:block [&_small]:text-[10px] [&_small]:text-ink-3",
                  i === selected && "bg-accent-soft",
                )}
                onMouseMove={() => setIndex(i)}
                onClick={() => enabled(command) && run(command)}
              >
                <Terminal size={15} />
                <span className="min-w-0 flex-1">
                  {command.title}
                  <small>
                    {t("menu." + command.category)}
                    {!enabled(command)
                      ? " · " + t("finish.palette.unavailable")
                      : ""}
                  </small>
                </span>
                {command.shortcut && (
                  <kbd>{formatShortcut(command.shortcut)}</kbd>
                )}
              </div>
            ))}
            {!results.length && (
              <p className="p-6 text-ink-2">{t("finish.palette.empty")}</p>
            )}
          </div>
        )}
        <div className="flex justify-between border-t border-subtle px-4 py-2.5 text-[11px] text-ink-2">
          {t("finish.palette.navigate")} <span>{t("finish.palette.run")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
