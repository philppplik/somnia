import {parseRackPreset,type RackPreset} from './rack';

export const RACK_PRESET_KEY = 'somnia.sound.rack.presets.v1';
export const RACK_PRESET_LIMIT = 12;
const MAX_STORED_CHARS = 200000;

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read the stored presets. Invalid entries are skipped one by one, so a single bad entry never hides the rest. */
export function loadRackPresets(storage: PresetStorage): RackPreset[] {
  try {
    const raw = storage.getItem(RACK_PRESET_KEY);
    if (!raw || raw.length > MAX_STORED_CHARS) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: RackPreset[] = [];
    for (const entry of data.slice(0, RACK_PRESET_LIMIT)) {
      try {
        const preset = parseRackPreset(JSON.stringify(entry));
        if (!out.some(p => p.name === preset.name)) out.push(preset);
      } catch { /* skip invalid entry */ }
    }
    return out;
  } catch {
    return [];
  }
}

function persist(storage: PresetStorage, list: RackPreset[]): void {
  storage.setItem(RACK_PRESET_KEY, JSON.stringify(list.map(p => ({ version: 1, name: p.name, rack: p.rack }))));
}

/**
 * Save a preset. Same name replaces in place. A new name when the list is full is rejected
 * instead of silently dropping the oldest preset: delete one first.
 */
export function saveRackPreset(storage: PresetStorage, preset: RackPreset): RackPreset[] {
  const checked = parseRackPreset(JSON.stringify(preset));
  const list = loadRackPresets(storage);
  const at = list.findIndex(p => p.name === checked.name);
  if (at >= 0) list[at] = checked;
  else if (list.length >= RACK_PRESET_LIMIT) throw new Error(`Preset limit reached (${RACK_PRESET_LIMIT}). Delete a preset first.`);
  else list.push(checked);
  persist(storage, list);
  return list;
}

/** Delete a preset by name. Unknown names change nothing. */
export function deleteRackPreset(storage: PresetStorage, name: string): RackPreset[] {
  const list = loadRackPresets(storage);
  const next = list.filter(p => p.name !== name);
  if (next.length !== list.length) persist(storage, next);
  return next;
}
