import {CollabPreferences} from './CollabPreferences';
import {AgentPrivacySettings} from './agent/AgentPrivacy';
import {
  DEFAULT_BACKUP_PREFS,
  listProjectBackups,
  saveProjectBackup,
} from "../lib/projectBackups";
import { downloadProject } from "../lib/exportProject";
import { Folder } from '../lib/icons';
import { DEFAULT_DOCUMENT_PREFS } from "../lib/documentPrefs";
import { Type, Upload } from '../lib/icons';
import {
  DEFAULT_WINDOW_PREFS,
  applyWindowPrefs,
  type WindowPrefs,
} from "../lib/windowPrefs";
import { isTauri } from "@tauri-apps/api/core";
import { Monitor } from '../lib/icons';
import { DEFAULT_UPDATE_PREFS } from "../lib/updatePrefs";
import { EditorProject } from "@somnia/editor-core";
import { Zap } from '../lib/icons';
import { DEFAULT_CANVAS_PREFS, type CanvasPrefs } from "../lib/canvasPrefs";
import { DEFAULT_WORKFLOW_PREFS } from "../lib/workflowPrefs";
import { Pencil } from '../lib/icons';
import { DEFAULT_UI_PREFS } from "../lib/uiPrefs";
import { parseShortcutFile } from "../lib/shortcutTransfer";
import { downloadText } from "../lib/exportProject";
import { ExtensionCatalog } from "./ExtensionCatalog";
import { readFormatPrefs, saveFormatPrefs } from "../lib/format";
import { openExternal, REPO_URL } from "../lib/openExternal";
import { useState, useRef, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Square,
  Code2,
  Eye,
  Keyboard,
  Puzzle,
  RefreshCw,
  Info,
  Search,
  X,
} from '../lib/icons';
import { DEFAULT_EDITOR_PREFS } from "../lib/editorPrefs";
import { settingsMatch } from "../lib/settingsSearch";
import { GlassSettings } from "./GlassSettings";
import { getState, type AppState } from "../store/appStore";
import {
  CATALOGUES,
  LOCALE_NAMES,
  SYSTEM,
  readLocalePref,
  setLocalePref,
} from "../lib/i18n";
import { useT } from "../lib/useT";
import { tOr } from "../lib/i18n";
import { copyErrorReport } from "../lib/log";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  revokedPermissions,
  setPermissionRevoked,
  enabledIds,
  installExtension,
  loadExtensions,
  removeExtension,
  setExtensionEnabled,
} from "../lib/extensions/registry";
import {
  installFromZip,
  installFromFolder,
} from "../lib/extensions/packageInstall";
import { contrastRatio, DEFAULT_LOOK, type Density } from "../lib/look";
import thirdParty from "../lib/thirdParty.json";
import {
  checkForUpdate,
  lastCheck,
  autoCheckEnabled,
  setAutoCheck,
  type ReleaseInfo,
} from "../lib/updates";
import {
  defaultShortcut,
  formatShortcut,
  listCommands,
  setShortcutOverride,
  shortcutFromEvent,
  shortcutOverrides,
} from "../lib/commands";
import { THEME_CHOICES, type ThemeChoice } from "../lib/theme";
import { patchState, useAppStore } from "../store/appStore";
import type { CodeTheme, Contrast } from "../lib/appearance";
export function Settings() {
  const { t, locale } = useT();
  const state = useAppStore();
  const section = state.settingsSection;
  const setSection = (v: string) => patchState({ settingsSection: v });
  const [exts, setExts] = useState(loadExtensions);
  const [draft, setDraft] = useState("");
  const [capture, setCapture] = useState<string | null>(null);
  const [scTick, setScTick] = useState(0);
  const [errs, setErrs] = useState<string[]>([]);
  const [upd, setUpd] = useState<{
    state: "idle" | "checking" | "current" | "available" | "error";
    release?: ReleaseInfo;
    message?: string;
  }>({ state: "idle" });
  const [query, setQuery] = useState("");
  const [nativeBusy, setNativeBusy] = useState(false);
  const [backups, setBackups] = useState(listProjectBackups);
  const [tick, setTick] = useState(0);
  const [matches, setMatches] = useState<string[]>([]);
  const undo = useRef<(() => void)[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const change = (p: Partial<AppState>) => {
    const before = getState();
    const old = Object.fromEntries(
      Object.keys(p).map((k) => [k, before[k as keyof AppState]]),
    ) as Partial<AppState>;
    undo.current.push(() => patchState(old));
    patchState(p);
  };
  const preference = (run: () => void, restore: () => void) => {
    undo.current.push(restore);
    run();
    setTick((n) => n + 1);
  };
  const shortcut = (id: string, value: string | null) => {
    const old = shortcutOverrides()[id] ?? null;
    preference(
      () => setShortcutOverride(id, value),
      () => setShortcutOverride(id, old),
    );
    setScTick((n) => n + 1);
  };
  const reset = (name: string) => {
    if (name === "Window") void nativeWindowChange({ ...DEFAULT_WINDOW_PREFS });
    if (name === "Typography")
      change({
        documentPrefs: {
          ...state.documentPrefs,
          font: "system",
          fontSize: 16,
          lineHeight: 1.5,
          letterSpacing: 0,
          paragraphSpacing: 1,
        },
      });
    if (name === "Export & Publish")
      change({
        documentPrefs: {
          ...state.documentPrefs,
          stripEditorIds: true,
          keepComments: true,
        },
      });
    if (name === "Projects")
      change({ backupPrefs: { ...DEFAULT_BACKUP_PREFS } });
    if (name === "Appearance")
      change({
        themeChoice: "system",
        contrast: "standard",
        look: { ...DEFAULT_LOOK },
        uiPrefs: { ...DEFAULT_UI_PREFS },
      });
    if (name === "Code editor") {
      change({
        codeTheme: "classic",
        wrapLines: false,
        editorPrefs: { ...DEFAULT_EDITOR_PREFS },
        look: {
          ...state.look,
          editorFont: DEFAULT_LOOK.editorFont,
          lineHeight: DEFAULT_LOOK.lineHeight,
        },
      });
      const old = readFormatPrefs();
      preference(
        () => saveFormatPrefs({ indent: 2 }),
        () => saveFormatPrefs(old),
      );
    }
    if (name === "Editing")
      change({
        workflowPrefs: {
          ...state.workflowPrefs,
          draftAutosave: true,
          draftSeconds: 3,
        },
      });
    if (name === "General") {
      change({
        workflowPrefs: {
          ...state.workflowPrefs,
          startup: "last",
          documentTitle: "Untitled",
          confirmDelete: false,
        },
      });
      const old = readLocalePref();
      preference(
        () => setLocalePref(SYSTEM),
        () => setLocalePref(old),
      );
    }
    if (name === "Canvas")
      change({
        canvasPrefs: { ...DEFAULT_CANVAS_PREFS },
        zoom: 100,
        viewport: 1280,
        viewportHeight: 900,
      });
    if (name === "Preview") change({ livePreview: false });
    if (name === "Updates") {
      change({ updatePrefs: { ...DEFAULT_UPDATE_PREFS } });
      const old = autoCheckEnabled();
      preference(
        () => setAutoCheck(true),
        () => setAutoCheck(old),
      );
    }
    if (name === "Shortcuts") {
      const old = shortcutOverrides();
      preference(
        () => Object.keys(old).forEach((id) => setShortcutOverride(id, null)),
        () =>
          Object.entries(old).forEach(([id, v]) => setShortcutOverride(id, v)),
      );
      setScTick((n) => n + 1);
    }
  };
  useEffect(() => {
    if (!state.settingsOpen) {
      undo.current = [];
      setQuery("");
    }
  }, [state.settingsOpen]);
  // Deep links use the same section state as the Settings sidebar. Clear any
  // prior search, reset the independent content scroll and reveal the selected
  // sidebar item (which can be below the fold in smaller windows).
  useEffect(() => {
    if (!state.settingsOpen) return;
    setQuery("");
    const frame = requestAnimationFrame(() => {
      if (content.current) content.current.scrollTop = 0;
      content.current?.closest(".settings-popup")
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.settingsOpen, section, state.settingsNavigationId]);
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("label,li,p,details").forEach((el) => {
      el.hidden =
        !!query &&
        !settingsMatch(
          (el.textContent ?? "") +
            " " +
            (el.getAttribute("title") ?? "") +
            " " +
            Array.from(el.querySelectorAll("[aria-label]"))
              .map((x) => x.getAttribute("aria-label"))
              .join(" "),
          query,
        );
    });
    const found: string[] = [];
    root
      .querySelectorAll<HTMLElement>("[data-settings-section]")
      .forEach((el) => {
        el.hidden =
          !!query &&
          !Array.from(el.querySelectorAll("label,li,p,details")).some(
            (row) => !(row as HTMLElement).hidden,
          );
        if (!el.hidden) found.push(el.dataset.settingsSection!);
      });
    setMatches((prev) => (prev.join("|") === found.join("|") ? prev : found));
  }, [query, tick, state, exts, locale]);
  const nativeWindowChange = async (next: WindowPrefs) => {
    if (nativeBusy) return;
    setNativeBusy(true);
    const old = state.windowPrefs;
    try {
      await applyWindowPrefs(next, old);
      undo.current.push(() => {
        void applyWindowPrefs(old, next)
          .then(() => patchState({ windowPrefs: old }))
          .catch((error) => setErrs([String(error)]));
      });
      patchState({ windowPrefs: next });
      setErrs([]);
    } catch (error) {
      setErrs([error instanceof Error ? error.message : String(error)]);
    } finally {
      setNativeBusy(false);
    }
  };
  const sections = [
    { name: "General", key: "general", group: "App", icon: SettingsIcon },
    { name: "Appearance", key: "appearance", group: "App", icon: Palette },
    ...(isTauri()
      ? [{ name: "Window", key: "window", group: "App", icon: Monitor }]
      : []),
    { name: "Canvas", key: "canvas", group: "Editor", icon: Square },
    { name: "Editing", key: "editing", group: "Editor", icon: Pencil },
    { name: "Typography", key: "typography", group: "Editor", icon: Type },
    { name: "Code editor", key: "code", group: "Editor", icon: Code2 },
    { name: "Projects", key: "projects", group: "Workflow", icon: Folder },
    {
      name: "Export & Publish",
      key: "export",
      group: "Workflow",
      icon: Upload,
    },
    { name: "Collaboration", key: "collaboration", group: "Workflow", icon: Info },
    { name: "Preview", key: "preview", group: "Workflow", icon: Eye },
    { name: "Shortcuts", key: "shortcuts", group: "Workflow", icon: Keyboard },
    { name: "AI Privacy", key: "aiPrivacy", group: "Power-Ups", icon: Info },
    { name: "Extensions", key: "extensions", group: "Power-Ups", icon: Puzzle },
    { name: "Updates", key: "updates", group: "System", icon: RefreshCw },
    { name: "Advanced", key: "advanced", group: "System", icon: Zap },
    { name: "About", key: "about", group: "", icon: Info },
  ];
  const sectionTitle = (name: string) =>
    t("set.section." + (sections.find((x) => x.name === name)?.key ?? name));
  const renderSection = (section: string) => (
    <section data-settings-section={section} aria-label={sectionTitle(section)} key={section}>
      <h2>{sectionTitle(section)}</h2>
      {section === "Collaboration" && <CollabPreferences/>}
      {section === "AI Privacy" && <AgentPrivacySettings t={t}/>}
      {section === "Advanced" && (
        <>
          <label title={t("redesign.fastHint")}>
            {t("redesign.fastParse")}
            <input
              type="checkbox"
              aria-label={t("redesign.fastParse")}
              checked={EditorProject.incremental.enabled}
              onChange={(e) => {
                const old = EditorProject.incremental.enabled;
                const apply = (on: boolean) => {
                  EditorProject.incremental.enabled = on;
                  try {
                    localStorage.setItem(
                      "somnia.fastParse.v1",
                      on ? "on" : "off",
                    );
                  } catch {}
                };
                preference(
                  () => apply(e.target.checked),
                  () => apply(old),
                );
              }}
            />
          </label>
          <p>{t("redesign.fastHint")}</p>
        </>
      )}
      {section === "Window" && (
        <fieldset disabled={nativeBusy} className="settings-ui-preferences">
          <label>
            {t("windowPref.remember")}
            <input
              type="checkbox"
              aria-label={t("windowPref.remember")}
              checked={state.windowPrefs.remember}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  remember: e.target.checked,
                })
              }
            />
          </label>
          <label>
            {t("windowPref.width")}
            <input
              type="number"
              aria-label={t("windowPref.width")}
              min={960}
              max={3840}
              value={state.windowPrefs.width}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  width: Math.max(
                    960,
                    Math.min(3840, Number(e.target.value) || 1440),
                  ),
                })
              }
            />
          </label>
          <label>
            {t("windowPref.height")}
            <input
              type="number"
              aria-label={t("windowPref.height")}
              min={600}
              max={2160}
              value={state.windowPrefs.height}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  height: Math.max(
                    600,
                    Math.min(2160, Number(e.target.value) || 900),
                  ),
                })
              }
            />
          </label>
          <label>
            {t("windowPref.pin")}
            <input
              type="checkbox"
              aria-label={t("windowPref.pin")}
              checked={state.windowPrefs.alwaysOnTop}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  alwaysOnTop: e.target.checked,
                })
              }
            />
          </label>
          <label>
            {t("windowPref.frame")}
            <select
              aria-label={t("windowPref.frame")}
              value={state.windowPrefs.frame}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  frame: e.target.value as "custom" | "system",
                })
              }
            >
              <option value="custom">{t("windowPref.custom")}</option>
              <option value="system">{t("windowPref.system")}</option>
            </select>
          </label>
          <label>
            {t("windowPref.doubleClick")}
            <select
              aria-label={t("windowPref.doubleClick")}
              value={state.windowPrefs.doubleClick}
              onChange={(e) =>
                void nativeWindowChange({
                  ...state.windowPrefs,
                  doubleClick: e.target.value as "none" | "maximize",
                })
              }
            >
              <option value="maximize">{t("windowPref.maximize")}</option>
              <option value="none">{t("set.sc.none")}</option>
            </select>
          </label>
          {errs.length > 0 && <p role="alert">{errs.join(" ")}</p>}
        </fieldset>
      )}
      {section === "Typography" && (
        <>
          <p>{t("docPref.newOnly")}</p>
          <label>
            {t("docPref.font")}
            <select
              aria-label={t("docPref.font")}
              value={state.documentPrefs.font}
              onChange={(e) =>
                change({
                  documentPrefs: {
                    ...state.documentPrefs,
                    font: e.target.value as "system" | "serif" | "monospace",
                  },
                })
              }
            >
              <option value="system">{t("finish.settings.sans")}</option>
              <option value="serif">{t("finish.settings.serif")}</option>
              <option value="monospace">{t("finish.settings.mono")}</option>
            </select>
          </label>
          {(
            [
              ["fontSize", 8, 72, 1],
              ["lineHeight", 1, 3, 0.1],
              ["letterSpacing", -2, 20, 0.1],
              ["paragraphSpacing", 0, 5, 0.1],
            ] as const
          ).map(([key, min, max, step]) => (
            <label key={key}>
              {t("docPref." + key)}
              <input
                type="number"
                aria-label={t("docPref." + key)}
                min={min}
                max={max}
                step={step}
                value={state.documentPrefs[key]}
                onChange={(e) =>
                  change({
                    documentPrefs: {
                      ...state.documentPrefs,
                      [key]: Math.max(
                        min,
                        Math.min(max, Number(e.target.value)),
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          <div
            className="settings-type-sample"
            style={{
              fontFamily:
                state.documentPrefs.font === "serif"
                  ? "Georgia,serif"
                  : state.documentPrefs.font === "monospace"
                    ? "monospace"
                    : "system-ui",
              fontSize: state.documentPrefs.fontSize,
              lineHeight: state.documentPrefs.lineHeight,
              letterSpacing: state.documentPrefs.letterSpacing,
            }}
          >
            Aa Bb Cc · 0123456789
          </div>
        </>
      )}
      {section === "Export & Publish" && (
        <>
          <p>{t("docPref.exportHint")}</p>
          <label>
            {t("docPref.stripIds")}
            <input
              type="checkbox"
              aria-label={t("docPref.stripIds")}
              checked={state.documentPrefs.stripEditorIds}
              onChange={(e) =>
                change({
                  documentPrefs: {
                    ...state.documentPrefs,
                    stripEditorIds: e.target.checked,
                  },
                })
              }
            />
          </label>
          <label>
            {t("docPref.comments")}
            <input
              type="checkbox"
              aria-label={t("docPref.comments")}
              checked={state.documentPrefs.keepComments}
              onChange={(e) =>
                change({
                  documentPrefs: {
                    ...state.documentPrefs,
                    keepComments: e.target.checked,
                  },
                })
              }
            />
          </label>
        </>
      )}
      {section === "Projects" && (
        <>
          <p>{t("backup.hint")}</p>
          <label>
            {t("backup.enabled")}
            <input
              type="checkbox"
              aria-label={t("backup.enabled")}
              checked={state.backupPrefs.enabled}
              onChange={(e) =>
                change({
                  backupPrefs: {
                    ...state.backupPrefs,
                    enabled: e.target.checked,
                  },
                })
              }
            />
          </label>
          <label>
            {t("backup.count")}
            <input
              type="number"
              aria-label={t("backup.count")}
              min={1}
              max={50}
              value={state.backupPrefs.count}
              onChange={(e) =>
                change({
                  backupPrefs: {
                    ...state.backupPrefs,
                    count: Math.max(
                      1,
                      Math.min(50, Number(e.target.value) || 20),
                    ),
                  },
                })
              }
            />
          </label>
          <button
            disabled={!state.coreConnected}
            onClick={() => {
              const r = saveProjectBackup(state.files, state.projectName, true);
              setErrs(r.ok ? [] : [r.error!]);
              setBackups(listProjectBackups());
            }}
          >
            {t("backup.now")}
          </button>
          {errs.length > 0 && <p role="alert">{errs.join(" ")}</p>}
          <ul aria-label={t("finish.settings.snapshots")}>
            {backups.map((b) => (
              <li key={b.id} className="settings-backup-row">
                <span>
                  {b.name}
                  <small>{new Date(b.at).toLocaleString(locale)}</small>
                </span>
                <button
                  onClick={() =>
                    downloadProject(b.files, b.name + "-snapshot", true)
                  }
                >
                  {t("backup.download")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {section === "General" && (
        <>
          <label title={t("redesign.startupHint")}>
            {t("redesign.startup")}
            <select
              aria-label={t("redesign.startup")}
              value={state.workflowPrefs.startup}
              onChange={(e) =>
                change({
                  workflowPrefs: {
                    ...state.workflowPrefs,
                    startup: e.target.value as "last" | "welcome" | "blank",
                  },
                })
              }
            >
              <option value="last">{t("redesign.startupLast")}</option>
              <option value="welcome">{t("redesign.startupWelcome")}</option>
              <option value="blank">{t("redesign.startupBlank")}</option>
            </select>
          </label>
          <p>{t("redesign.startupHint")}</p>
          <label>
            {t("redesign.defaultTitle")}
            <input
              type="text"
              aria-label={t("redesign.defaultTitle")}
              maxLength={160}
              value={state.workflowPrefs.documentTitle}
              onChange={(e) =>
                change({
                  workflowPrefs: {
                    ...state.workflowPrefs,
                    documentTitle: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            {t("redesign.confirmDelete")}
            <input
              type="checkbox"
              aria-label={t("redesign.confirmDelete")}
              checked={state.workflowPrefs.confirmDelete}
              onChange={(e) =>
                change({
                  workflowPrefs: {
                    ...state.workflowPrefs,
                    confirmDelete: e.target.checked,
                  },
                })
              }
            />
          </label>
          <label>
            {t("settings.language")}
            <select
              aria-label={t("settings.language")}
              value={readLocalePref()}
              onChange={(e) => {
                const old = readLocalePref();
                preference(
                  () => setLocalePref(e.target.value),
                  () => setLocalePref(old),
                );
              }}
            >
              <option value={SYSTEM}>{t("settings.language.system")}</option>
              {Object.keys(CATALOGUES).map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          <p>{t("settings.language.note")}</p>
        </>
      )}
      {section === "Editing" && (
        <>
          <label title={t("redesign.draftHint")}>
            {t("redesign.draftAutosave")}
            <input
              type="checkbox"
              aria-label={t("redesign.draftAutosave")}
              checked={state.workflowPrefs.draftAutosave}
              onChange={(e) =>
                change({
                  workflowPrefs: {
                    ...state.workflowPrefs,
                    draftAutosave: e.target.checked,
                  },
                })
              }
            />
          </label>
          <label>
            {t("redesign.draftInterval")}
            <input
              type="number"
              aria-label={t("redesign.draftInterval")}
              min={1}
              max={300}
              value={state.workflowPrefs.draftSeconds}
              onChange={(e) =>
                change({
                  workflowPrefs: {
                    ...state.workflowPrefs,
                    draftSeconds: Math.max(
                      1,
                      Math.min(300, Number(e.target.value) || 3),
                    ),
                  },
                })
              }
            />
          </label>
          <p>{t("redesign.draftHint")}</p>
        </>
      )}
      {section === "Canvas" && (
        <>
          <label>
            {t("redesign.viewport")}
            <select
              aria-label={t("redesign.viewport")}
              value={state.viewport}
              onChange={(e) => change({ viewport: Number(e.target.value) })}
            >
              {[375, 768, 1280, 1440].map((v) => (
                <option key={v} value={v}>
                  {v}px
                </option>
              ))}
              {![375, 768, 1280, 1440].includes(state.viewport) && (
                <option value={state.viewport}>{state.viewport}px</option>
              )}
            </select>
          </label>
          <label>
            {t("redesign.zoom")}
            <input
              type="number"
              aria-label={t("redesign.zoom")}
              min="25"
              max="200"
              value={state.zoom}
              onChange={(e) =>
                change({
                  zoom: Math.max(
                    25,
                    Math.min(200, Number(e.target.value) || 100),
                  ),
                })
              }
            />
          </label>
          <label>
            {t("redesign.defaultViewport")}
            <select
              aria-label={t("redesign.defaultViewport")}
              value={state.canvasPrefs.defaultViewport}
              onChange={(e) =>
                change({
                  canvasPrefs: {
                    ...state.canvasPrefs,
                    defaultViewport: Number(e.target.value),
                  },
                })
              }
            >
              {[375, 768, 1280, 1440, 1920].map((v) => (
                <option key={v} value={v}>
                  {v}px
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("redesign.defaultZoom")}
            <input
              type="number"
              aria-label={t("redesign.defaultZoom")}
              min={25}
              max={200}
              value={state.canvasPrefs.defaultZoom}
              onChange={(e) =>
                change({
                  canvasPrefs: {
                    ...state.canvasPrefs,
                    defaultZoom: Math.max(
                      25,
                      Math.min(200, Number(e.target.value) || 100),
                    ),
                  },
                })
              }
            />
          </label>
          {(
            [
              "grid",
              "resizeHandles",
              "spacingHandles",
              "doubleClickEdit",
              "shiftSelect",
              "spacePan",
            ] as const
          ).map((key) => (
            <label key={key}>
              {t("canvasPref." + key)}
              <input
                type="checkbox"
                aria-label={t("canvasPref." + key)}
                checked={state.canvasPrefs[key]}
                onChange={(e) =>
                  change({
                    canvasPrefs: {
                      ...state.canvasPrefs,
                      [key]: e.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
          <label>
            {t("canvasPref.gridSize")}
            <input
              type="number"
              aria-label={t("canvasPref.gridSize")}
              min={2}
              max={100}
              value={state.canvasPrefs.gridSize}
              onChange={(e) =>
                change({
                  canvasPrefs: {
                    ...state.canvasPrefs,
                    gridSize: Math.max(
                      2,
                      Math.min(100, Number(e.target.value) || 8),
                    ),
                  },
                })
              }
            />
          </label>
          <label>
            {t("canvasPref.selectionColor")}
            <span className="settings-color-value">
              <code>{state.canvasPrefs.selectionColor ?? t("canvasPref.selectionColorTheme")}</code>
              <input
                type="color"
                aria-label={t("canvasPref.selectionColor")}
                value={state.canvasPrefs.selectionColor ?? "#7c5cff"}
                onChange={(e) =>
                  change({
                    canvasPrefs: { ...state.canvasPrefs, selectionColor: e.target.value },
                  })
                }
              />
              {state.canvasPrefs.selectionColor && (
                <button
                  type="button"
                  onClick={() =>
                    change({
                      canvasPrefs: { ...state.canvasPrefs, selectionColor: null },
                    })
                  }
                >
                  {t("canvasPref.selectionColorTheme")}
                </button>
              )}
            </span>
          </label>
          {(["gridColor", "background"] as const).map(
            (key) => (
              <label key={key}>
                {t("canvasPref." + key)}
                <span className="settings-color-value">
                  <code>{state.canvasPrefs[key]}</code>
                  <input
                    type="color"
                    aria-label={t("canvasPref." + key)}
                    value={state.canvasPrefs[key]}
                    onChange={(e) =>
                      change({
                        canvasPrefs: {
                          ...state.canvasPrefs,
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </span>
              </label>
            ),
          )}
          <label>
            {t("canvasPref.selectionWidth")}
            <input
              type="number"
              aria-label={t("canvasPref.selectionWidth")}
              min={1}
              max={5}
              value={state.canvasPrefs.selectionWidth}
              onChange={(e) =>
                change({
                  canvasPrefs: {
                    ...state.canvasPrefs,
                    selectionWidth: Math.max(
                      1,
                      Math.min(5, Number(e.target.value) || 2),
                    ),
                  },
                })
              }
            />
          </label>
          <label>
            {t("canvasPref.pageShadow")}
            <select
              aria-label={t("canvasPref.pageShadow")}
              value={state.canvasPrefs.pageShadow}
              onChange={(e) =>
                change({
                  canvasPrefs: {
                    ...state.canvasPrefs,
                    pageShadow: e.target.value as CanvasPrefs["pageShadow"],
                  },
                })
              }
            >
              <option value="none">{t("set.sc.none")}</option>
              <option value="soft">{t("redesign.soft")}</option>
              <option value="strong">{t("redesign.strong")}</option>
            </select>
          </label>
        </>
      )}
      {section === "Preview" && (
        <>
          <label title={t("redesign.liveHint")}>
            {t("redesign.live")}
            <input
              type="checkbox"
              aria-label={t("redesign.live")}
              checked={state.livePreview}
              onChange={(e) => change({ livePreview: e.target.checked })}
            />
          </label>
          <p>{t("redesign.liveHint")}</p>
        </>
      )}
      {section === "Shortcuts" ? (
        <div>
          <p>{t("set.sc.intro")}</p>
          <div className="settings-transfer">
            <button
              onClick={() =>
                downloadText(
                  JSON.stringify(shortcutOverrides(), null, 2),
                  "somnia-shortcuts.json",
                  "application/json",
                )
              }
            >
              {t("redesign.exportShortcuts")}
            </button>
            <label className="settings-shortcut-import">
              {t("redesign.importShortcuts")}
              <input
                type="file"
                accept=".json,application/json"
                aria-label={t("redesign.importShortcuts")}
                onChange={async (e) => {
                  const input = e.currentTarget,
                    file = input.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 100000)
                      throw Error(t("finish.settings.shortcutTooLarge"));
                    const next = parseShortcutFile(
                      await file.text(),
                      listCommands().map((c) => c.id),
                    );
                    const old = shortcutOverrides();
                    preference(
                      () => {
                        Object.keys(old).forEach((id) =>
                          setShortcutOverride(id, null),
                        );
                        Object.entries(next).forEach(([id, v]) =>
                          setShortcutOverride(id, v),
                        );
                      },
                      () => {
                        Object.keys(shortcutOverrides()).forEach((id) =>
                          setShortcutOverride(id, null),
                        );
                        Object.entries(old).forEach(([id, v]) =>
                          setShortcutOverride(id, v),
                        );
                      },
                    );
                    setScTick((n) => n + 1);
                    setErrs([]);
                  } catch (error) {
                    setErrs([
                      error instanceof Error
                        ? error.message
                        : t("finish.settings.importFailed"),
                    ]);
                  }
                  input.value = "";
                }}
              />
            </label>
          </div>
          {errs.length > 0 && <p role="alert">{errs.join(" ")}</p>}
          <ul
            aria-label={t("cmd.help.shortcuts")}
            data-tick={scTick}
            className="max-h-[360px] overflow-auto"
          >
            {listCommands()
              .filter(
                (c) =>
                  c.shortcut ||
                  defaultShortcut(c.id) ||
                  c.id in shortcutOverrides() ||
                  c.id.startsWith("split."),
              )
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((c) => {
                const clash = c.shortcut
                  ? listCommands().find(
                      (o) => o.id !== c.id && o.shortcut === c.shortcut,
                    )
                  : undefined;
                return (
                  <li
                    key={c.id}
                    className="my-1 flex items-center justify-between gap-3"
                  >
                    <span>
                      {c.title}
                      {clash && (
                        <small role="alert">
                          {" "}
                          {t("set.sc.clash", {title: clash.title})}
                        </small>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <kbd>
                        {capture === c.id
                          ? t("set.sc.press")
                          : c.shortcut
                            ? formatShortcut(c.shortcut)
                            : t("set.sc.none")}
                      </kbd>
                      <button
                        aria-label={t("set.sc.change.aria", {title:c.title})}
                        onKeyDown={(e) => {
                          if (capture !== c.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.key === "Escape") {
                            setCapture(null);
                            return;
                          }
                          const sc = shortcutFromEvent(e.nativeEvent);
                          if (!sc) return;
                          shortcut(c.id, sc);
                          setCapture(null);
                          setScTick((t) => t + 1);
                        }}
                        onBlur={() => setCapture(null)}
                        onClick={() => setCapture(c.id)}
                      >
                        {t("set.sc.change")}
                      </button>
                      <button
                        aria-label={t("set.sc.clear.aria", {title:c.title})}
                        onClick={() => {
                          shortcut(c.id, "");
                          setScTick((t) => t + 1);
                        }}
                      >
                        {t("set.sc.clear")}
                      </button>
                      <button
                        aria-label={t("set.sc.reset.aria", {title:c.title})}
                        onClick={() => {
                          shortcut(c.id, null);
                          setScTick((t) => t + 1);
                        }}
                      >
                        {t("set.sc.reset")}
                      </button>
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}
      {section === "Updates" ? (
        <div>
          <p>
            {t("set.upd.intro", {release: __APP_RELEASE__, app: __APP_VERSION__})}
          </p>
          <p className="text-[12px] text-ink-3" data-testid="last-update-check">
            {(() => {
              const c = lastCheck();
              return c
                ? t("set.upd.last", {when: new Date(c.at).toLocaleString(locale), result: c.result === "available" ? t("set.upd.last.available", {detail:c.detail ?? ""}) : c.result === "up-to-date" ? t("set.upd.last.current") : t("set.upd.last.failed", {detail:c.detail ?? ""})})
                : t("set.upd.never");
            })()}
          </p>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              aria-label={t("set.upd.auto.aria")}
              checked={autoCheckEnabled()}
              onChange={(e) => {
                const old = autoCheckEnabled();
                preference(
                  () => setAutoCheck(e.target.checked),
                  () => setAutoCheck(old),
                );
              }}
            />
            {t("redesign.updateAuto")}
          </label>
          <label>
            {t("redesign.updateInterval")}
            <select
              aria-label={t("redesign.updateInterval")}
              value={state.updatePrefs.intervalMinutes}
              onChange={(e) =>
                change({
                  updatePrefs: {
                    ...state.updatePrefs,
                    intervalMinutes: Number(e.target.value) as
                      60 | 1440 | 10080,
                  },
                })
              }
            >
              <option value={60}>{t("redesign.hourly")}</option>
              <option value={1440}>{t("redesign.daily")}</option>
              <option value={10080}>{t("redesign.weekly")}</option>
            </select>
          </label>
          <label title={t("redesign.channelHint")}>
            {t("redesign.channel")}
            <select
              aria-label={t("redesign.channel")}
              value={state.updatePrefs.channel}
              onChange={(e) => {
                change({
                  updatePrefs: {
                    ...state.updatePrefs,
                    channel: e.target.value as "stable" | "beta" | "alpha",
                  },
                });
                setUpd({ state: "idle" });
              }}
            >
              <option value="stable">{t("finish.settings.stable")}</option>
              <option value="beta">Beta</option>
              <option value="alpha">Alpha</option>
            </select>
          </label>
          <p>{t("redesign.channelHint")}</p>
          <button onClick={() => void openExternal(REPO_URL + "/releases")}>
            {t("redesign.releaseNotes")}
          </button>
          <button
            onClick={async () => {
              setUpd({ state: "checking" });
              try {
                const r = await checkForUpdate(__APP_RELEASE__);
                setUpd(
                  r.status === "available"
                    ? { state: "available", release: r.release }
                    : { state: "current" },
                );
              } catch (e) {
                setUpd({
                  state: "error",
                  message:
                    e instanceof Error ? e.message : t("set.upd.failed"),
                });
              }
            }}
          >
            {upd.state === "checking" ? t("set.upd.checking") : t("set.upd.check")}
          </button>
          <p role="status" aria-live="polite">
            {upd.state === "current"
              ? t("set.upd.uptodate")
              : upd.state === "error"
                ? upd.message
                : upd.state === "available"
                  ? t(upd.release!.prerelease ? "set.upd.available.pre" : "set.upd.available", {name:upd.release!.name})
                  : ""}
          </p>
          {upd.state === "available" && (
            <p>
              <a
                className="underline"
                href={upd.release!.asset?.url ?? upd.release!.url}
                target="_blank"
                rel="noreferrer"
              >
                {upd.release!.asset
                  ? t("set.upd.download", {name:upd.release!.asset.name})
                  : t("set.upd.openpage")}
              </a>{" "}
              ·{" "}
              <a
                className="underline"
                href={upd.release!.url}
                target="_blank"
                rel="noreferrer"
              >
                {t("set.upd.notes")}
              </a>
            </p>
          )}
          <p className="text-[12px]">{t("redesign.signedUpdate")}</p>
        </div>
      ) : null}
      {section === "About" ? (
        <div>
          <p>
            <strong>Somnia</strong> {t("set.about.version", {release:__APP_RELEASE__, app:__APP_VERSION__})}
          </p>
          <p>
            {t("set.about.license")}{" "}
            <a
              className="underline"
              href="https://github.com/philppplik/somnia"
              onClick={(e) => {
                e.preventDefault();
                void openExternal(REPO_URL).catch(() => {});
              }}
            >
              github.com/philppplik/somnia
            </a>
          </p>
          <p>
            <button type="button" className="underline" data-testid="copy-error-report" onClick={() => { void copyErrorReport(); }}>
              {tOr("set.about.errorReport", "Copy error report")}
            </button>
            <span className="ml-2 text-[11px] text-ink-3">{tOr("set.about.errorReport.hint", "Version info and recent log lines, without keys or tokens. Paste it into a message when something goes wrong.")}</span>
          </p>
          <details>
            <summary>
              {t("set.about.third", {count:thirdParty.length})}
            </summary>
            <ul
              aria-label={t("set.about.third.aria")}
              className="mt-2 max-h-[260px] overflow-auto text-[12px]"
            >
              {thirdParty.map((x) => (
                <li key={x.name} className="my-1">
                  {x.name} {x.version} - {x.license}
                </li>
              ))}
            </ul>
            <p className="text-[12px]">{t("set.about.shadcn")}</p>
          </details>
        </div>
      ) : null}
      {section === "Extensions" ? (
        <div>
          <button
            onClick={() => {
              const old = enabledIds();
              preference(
                () => old.forEach((id) => setExtensionEnabled(id, false)),
                () => old.forEach((id) => setExtensionEnabled(id, true)),
              );
              setExts(loadExtensions());
            }}
          >
            {t("redesign.disableAllExt")}
          </button>
          <ExtensionCatalog onInstalled={() => setExts(loadExtensions())} />
          <p>
            {t("set.ext.intro", {count:exts.length})}
          </p>
          <ul aria-label={t("set.ext.list.aria")}>
            {exts.map((x) => (
              <li
                key={x.id}
                className="my-2 flex items-center justify-between gap-3"
              >
                <span>
                  {x.name}{" "}
                  <small>
                    {x.version} - {x.id}
                  </small>
                  <br />
                  <small>{t("set.ext.perms")}</small>
                  {x.permissions.length ? (
                    x.permissions.map((pm) => (
                      <label
                        key={pm}
                        className="!my-0 !inline-flex gap-1 text-[12px]"
                      >
                        <input
                          type="checkbox"
                          aria-label={t("set.ext.perm.aria", {name:x.name, perm:pm})}
                          checked={
                            !(revokedPermissions()[x.id] || []).includes(pm)
                          }
                          onChange={(e) => {
                            setPermissionRevoked(x.id, pm, !e.target.checked);
                            setExts(loadExtensions());
                          }}
                        />
                        {pm}
                      </label>
                    ))
                  ) : (
                    <small>{t("set.ext.none")}</small>
                  )}
                </span>
                <label className="!my-0 gap-2">
                  <input
                    type="checkbox"
                    aria-label={t("set.ext.enable.aria", {name:x.name})}
                    checked={enabledIds().includes(x.id)}
                    onChange={(e) => {
                      setExtensionEnabled(x.id, e.target.checked);
                      setExts(loadExtensions());
                    }}
                  />
                  {t("set.ext.on")}
                </label>
                <button
                  aria-label={t("set.ext.remove.aria", {name:x.name})}
                  onClick={() => {
                    removeExtension(x.id);
                    setExts(loadExtensions());
                  }}
                >
                  {t("set.ext.remove")}
                </button>
              </li>
            ))}
          </ul>
          <label>
            {t("set.ext.addjson")}
            <input
              type="file"
              accept=".json,application/json"
              aria-label={t("set.ext.file.aria")}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 300000) {
                  setErrs([t("set.ext.toolarge")]);
                  return;
                }
                const r = installExtension(await f.text());
                if (r.ok) {
                  setErrs([]);
                  setExts(loadExtensions());
                } else setErrs(r.errors);
                e.target.value = "";
              }}
            />
          </label>
          <label>
            {t("set.ext.addzip")}
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label={t("set.ext.zip.aria")}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = await installFromZip(f);
                if (r.ok) {
                  setErrs([]);
                  setExts(loadExtensions());
                } else setErrs(r.errors);
                e.target.value = "";
              }}
            />
          </label>
          <label>
            {t("set.ext.addfolder")}
            <input
              type="file"
              aria-label={t("set.ext.folder.aria")}
              {...({ webkitdirectory: "" } as object)}
              onChange={async (e) => {
                const l = e.target.files;
                if (!l || !l.length) return;
                const r = await installFromFolder(l);
                if (r.ok) {
                  setErrs([]);
                  setExts(loadExtensions());
                } else setErrs(r.errors);
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            aria-label={t("set.ext.manifest.aria")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full rounded-[6px] border border-line bg-panel p-2 font-mono text-[12px]"
          />
          {errs.length > 0 && (
            <ul role="alert">
              {errs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => {
              const r = installExtension(draft);
              if (r.ok) {
                setErrs([]);
                setDraft("");
                setExts(loadExtensions());
              } else setErrs(r.errors);
            }}
          >
            {t("set.ext.install")}
          </button>
        </div>
      ) : null}
      {section === "Appearance" ? (
        <>
          <label>
            {t("set.ap.theme")}
            <select
              aria-label={t("set.ap.theme")}
              value={state.themeChoice}
              onChange={(e) =>
                change({ themeChoice: e.target.value as ThemeChoice })
              }
            >
              {THEME_CHOICES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {t("finish.settings.theme." + theme.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("set.ap.background")}
            <select aria-label={t("set.ap.background")} aria-describedby="background-note"
              value={state.look.background}
              onChange={(e) => change({look:{...state.look,background:e.target.value === "glass" ? "glass" : "solid"}})}>
              <option value="solid">{t("set.ap.background.solid")}</option>
              <option value="glass">{t("set.ap.background.glass")}</option>
            </select>
          </label>
          <p id="background-note">{t("set.ap.background.note")}</p>
          <GlassSettings look={state.look} highContrast={state.contrast === "high"} onChange={(look) => change({ look })} />
          <label>
            {t("set.ap.outerRadius")}
            <span className="settings-range-value">
              <input type="range" min="0" max="25" step="1"
                aria-label={t("set.ap.outerRadius")} aria-describedby="outer-radius-note"
                aria-valuetext={`${state.look.outerRadius} px`} value={state.look.outerRadius}
                onChange={(e) => change({look:{...state.look,outerRadius:Number(e.target.value)}})} />
              <output aria-hidden="true">{state.look.outerRadius} px</output>
            </span>
          </label>
          <p id="outer-radius-note">{t("set.ap.outerRadiusNote")}</p>
          <label>
            {t("set.ap.contrast")}
            <select
              aria-label={t("set.ap.contrast")}
              value={state.contrast}
              onChange={(e) => change({ contrast: e.target.value as Contrast })}
            >
              <option value="standard">{t("set.ap.contrast.standard")}</option>
              <option value="high">{t("set.ap.contrast.high")}</option>
            </select>
          </label>
          <p>{t("set.ap.contrast.note")}</p>
          <fieldset className="my-3 border-0 p-0" aria-label={t("set.ap.look.aria")}>
            <label>
              {t("set.ap.accent")}
              <input
                type="color"
                aria-label={t("set.ap.accent")}
                value={state.look.accent ?? "#6366f1"}
                onChange={(e) =>
                  change({
                    look: { ...state.look, accent: e.target.value },
                  })
                }
              />
            </label>
            <div
              className="settings-accent-presets"
              aria-label={t("finish.settings.accentPresets")}
            >
              {[
                ["Indigo", "#6366f1"],
                ["Violet", "#8b5cf6"],
                ["Cyan", "#0891b2"],
                ["Pink", "#db2777"],
                ["Amber", "#d97706"],
                ["Green", "#16a34a"],
              ].map(([name, color]) => (
                <button
                  key={name}
                  aria-label={t("finish.settings.accentName", {name:t("finish.settings.color." + name)})}
                  title={t("finish.settings.color." + name)}
                  style={{ background: color }}
                  onClick={() =>
                    change({ look: { ...state.look, accent: color } })
                  }
                />
              ))}
              <code>{state.look.accent ?? "#6366f1"}</code>
            </div>
            {state.look.accent &&
              (() => {
                const bg = state.theme === "dark" ? "#131316" : "#ffffff";
                const r = contrastRatio(state.look.accent!, bg);
                return (
                  <p
                    role="status"
                    className="text-[12px]"
                    data-testid="accent-contrast"
                  >
                    {t("set.ap.accent.ratio", {ratio:r})}
                    {r < 3
                      ? t("set.ap.accent.low")
                      : t("set.ap.accent.good")}
                  </p>
                );
              })()}
            <label>
              {t("set.ap.uiscale", {value:state.look.uiScale})}
              <input
                type="range"
                aria-label={t("set.ap.uiscale.aria")}
                min={85}
                max={130}
                step={5}
                value={state.look.uiScale}
                onChange={(e) =>
                  change({
                    look: {
                      ...state.look,
                      uiScale: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              {t("set.ap.font", {value:state.look.editorFont})}
              <input
                type="range"
                aria-label={t("set.ap.font.aria")}
                min={10}
                max={22}
                step={1}
                value={state.look.editorFont}
                onChange={(e) =>
                  change({
                    look: {
                      ...state.look,
                      editorFont: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              {t("set.ap.lh", {value:state.look.lineHeight})}
              <input
                type="range"
                aria-label={t("set.ap.lh.aria")}
                min={1.2}
                max={2}
                step={0.1}
                value={state.look.lineHeight}
                onChange={(e) =>
                  change({
                    look: {
                      ...state.look,
                      lineHeight: Math.round(Number(e.target.value) * 10) / 10,
                    },
                  })
                }
              />
            </label>
            <label>
              {t("set.ap.density")}
              <select
                aria-label={t("set.ap.density")}
                value={state.look.density}
                onChange={(e) =>
                  change({
                    look: {
                      ...state.look,
                      density: e.target.value as Density,
                    },
                  })
                }
              >
                <option value="compact">{t("set.ap.density.compact")}</option>
                <option value="normal">{t("set.ap.density.normal")}</option>
                <option value="comfortable">
                  {t("set.ap.density.comfortable")}
                </option>
              </select>
            </label>
          </fieldset>
          <fieldset className="settings-ui-preferences">
            <legend>{t("redesign.interface")}</legend>
            <label>
              {t("redesign.uiFont")}
              <select
                aria-label={t("redesign.uiFont")}
                value={state.uiPrefs.font}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      font: e.target.value as "inter" | "system",
                    },
                  })
                }
              >
                <option value="inter">Inter</option>
                <option value="system">{t("redesign.systemFont")}</option>
              </select>
            </label>
            <label>
              {t("redesign.uiFontSize")}
              <input
                type="number"
                aria-label={t("redesign.uiFontSize")}
                min={10}
                max={20}
                value={state.uiPrefs.fontSize}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      fontSize: Math.max(
                        10,
                        Math.min(20, Number(e.target.value) || 13),
                      ),
                    },
                  })
                }
              />
            </label>
            <label>
              {t("redesign.animation")} ({state.uiPrefs.animationMs}ms)
              <input
                type="range"
                aria-label={t("redesign.animation")}
                min={0}
                max={200}
                step={10}
                value={state.uiPrefs.animationMs}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      animationMs: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label title={t("redesign.motionHint")}>
              {t("redesign.motion")}
              <select
                aria-label={t("redesign.motion")}
                value={state.uiPrefs.motion}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      motion: e.target.value as "system" | "reduce" | "full",
                    },
                  })
                }
              >
                <option value="system">{t("settings.language.system")}</option>
                <option value="reduce">{t("redesign.reduce")}</option>
                <option value="full">{t("redesign.full")}</option>
              </select>
            </label>
            <p>{t("redesign.motionHint")}</p>
            <label>
              {t("redesign.shadows")}
              <select
                aria-label={t("redesign.shadows")}
                value={state.uiPrefs.shadows}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      shadows: e.target.value as "none" | "subtle" | "standard",
                    },
                  })
                }
              >
                <option value="subtle">{t("redesign.subtle")}</option>
                <option value="standard">
                  {t("set.ap.contrast.standard")}
                </option>
                <option value="none">{t("set.sc.none")}</option>
              </select>
            </label>
            <label>
              {t("redesign.rememberPanels")}
              <input
                type="checkbox"
                aria-label={t("redesign.rememberPanels")}
                checked={state.uiPrefs.rememberPanels}
                onChange={(e) =>
                  change({
                    uiPrefs: {
                      ...state.uiPrefs,
                      rememberPanels: e.target.checked,
                    },
                  })
                }
              />
            </label>
          </fieldset>
        </>
      ) : section === "Code editor" ? (
        <>
          <label>
            {t("set.ce.wrap")}
            <input
              type="checkbox"
              aria-label={t("set.ce.wrap")}
              checked={state.wrapLines}
              onChange={(e) => change({ wrapLines: e.target.checked })}
            />
          </label>
          <fieldset
            aria-label={t("set.ce.assist.aria")}
            className="my-4 border-0 p-0"
          >
            {(
              [
                [
                  "autocomplete",
                  t("set.ce.autocomplete"),
                ],
                ["closeTags", t("set.ce.closeTags")],
                ["closeBrackets", t("set.ce.closeBrackets")],
                ["lint", t("set.ce.lint")],
                ["emmet", t("set.ce.emmet")],
                ["lineNumbers", t("redesign.lineNumbers")],
                ["autoIndent", t("redesign.autoIndent")],
                ["selectionScroll", t("redesign.selectionScroll")],
              ] as const
            ).map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  type="checkbox"
                  aria-label={l}
                  checked={state.editorPrefs[k]}
                  onChange={(e) =>
                    change({
                      editorPrefs: {
                        ...state.editorPrefs,
                        [k]: e.target.checked,
                      },
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <label>
            {t("set.ce.indent")}
            <select
              aria-label={t("set.ce.indent.aria")}
              value={String(readFormatPrefs().indent)}
              onChange={(e) => {
                const old = readFormatPrefs();
                const indent = (
                  e.target.value === "tab" ? "tab" : Number(e.target.value)
                ) as 2 | 4 | 8 | "tab";
                preference(
                  () => saveFormatPrefs({ indent }),
                  () => saveFormatPrefs(old),
                );
              }}
            >
              <option value="2">{t("set.ce.indent.n", {count:2})}</option>
              <option value="4">{t("set.ce.indent.n", {count:4})}</option>
              <option value="8">{t("set.ce.indent.n", {count:8})}</option>
              <option value="tab">{t("set.ce.indent.tabs")}</option>
            </select>
          </label>
          <label>
            {t("set.ce.syntax")}
            <select
              aria-label={t("set.ce.syntax")}
              value={state.codeTheme}
              onChange={(e) =>
                change({ codeTheme: e.target.value as CodeTheme })
              }
            >
              <option value="classic">{t("set.ce.syntax.classic")}</option>
              <option value="ocean">{t("set.ce.syntax.ocean")}</option>
              <option value="forest">{t("set.ce.syntax.forest")}</option>
              <option value="github">GitHub</option>
              <option value="solarized">Solarized</option>
              <option value="monokai">Monokai</option>
              <option value="dracula">Dracula</option>
              <option value="nord">Nord</option>
              {state.extensionThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label} {t("set.ce.syntax.ext")}
                </option>
              ))}
            </select>
          </label>
          <p>{t("set.ce.syntax.note")}</p>
        </>
      ) : ["Components", "Connections"].includes(section) ? (
        <p>
          {section === "Components"
            ? t("set.components.note")
            : t("set.connections.note")}
        </p>
      ) : null}
      <footer className="settings-section-footer">
        <a
          href="https://github.com/philppplik/somnia/tree/phase1-foundation/docs"
          onClick={(e) => {
            e.preventDefault();
            void openExternal(REPO_URL + "/tree/phase1-foundation/docs");
          }}
        >
          {t("redesign.learn")}
        </a>
        {[
          "General",
          "Projects",
          "Typography",
          "Export & Publish",
          "Window",
          "Editing",
          "Appearance",
          "Code editor",
          "Canvas",
          "Preview",
          "Shortcuts",
          "Updates",
        ].includes(section) && (
          <button
            aria-label={section === "Appearance" ? t("set.ap.reset.aria") : undefined}
            onClick={() => reset(section)}
          >
            {t("redesign.reset")}
          </button>
        )}
      </footer>
    </section>
  );
  return (
    <Dialog
      open={state.settingsOpen}
      onOpenChange={(open) => patchState({ settingsOpen: open })}
    >
      <DialogContent
        className="settings-popup"
        onKeyDownCapture={(e) => {
          if (
            (e.ctrlKey || e.metaKey) &&
            e.key.toLowerCase() === "z" &&
            !e.shiftKey
          ) {
            const el = e.target as HTMLElement;
            if (
              el.matches(
                "input:not([type=checkbox]):not([type=range]):not([type=color]),textarea",
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            undo.current.pop()?.();
            setTick((n) => n + 1);
            setScTick((n) => n + 1);
          }
        }}
      >
        <aside className="settings-sidebar">
          <DialogTitle>{t("set.title")}</DialogTitle>
          <div className="settings-search">
            <Search size={14} />
            <input
              type="search"
              aria-label={t("redesign.search")}
              placeholder={t("redesign.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <nav aria-label={t("set.nav.aria")}>
            {sections.map((item, i) => (
              <div
                key={item.name}
                hidden={!!query && !matches.includes(item.name)}
              >
                {(i === 0 || sections[i - 1].group !== item.group) && (
                  <div className="settings-group">
                    {item.group ? t("redesign.group." + item.group) : ""}
                  </div>
                )}
                <button
                  aria-current={
                    section === item.name && !query ? "page" : undefined
                  }
                  onClick={() => {
                    setQuery("");
                    setSection(item.name);
                  }}
                >
                  <item.icon size={16} />
                  {sectionTitle(item.name)}
                </button>
              </div>
            ))}
          </nav>
        </aside>
        <div className="settings-main">
          <button
            className="settings-close"
            aria-label={t("set.close.aria")}
            title={t("set.close")}
            onClick={() => patchState({ settingsOpen: false })}
          >
            <X size={14} />
          </button>
          <DialogDescription className="sr-only">
            {t(section === "Shortcuts" ? "set.sc.description" : "set.description")}
          </DialogDescription>
          <div className="settings-content" ref={content}>
            {query && matches.length === 0 && (
              <p role="status">{t("redesign.noResults")}</p>
            )}
            {query
              ? sections.map((item) => renderSection(item.name))
              : renderSection(
                  sections.some((x) => x.name === section)
                    ? section
                    : "General",
                )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
