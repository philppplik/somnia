import type {VectorDocument,VectorPath} from '../vectorio';

/** Compounds and groups are one painted/edited object and select together. Hidden objects stay unselected. */
export function selectedPaths(doc: VectorDocument, ids: readonly string[]): VectorPath[] {
  const chosen = new Set(ids);
  // Compounds and groups both pull in all their visible members; repeat until nothing new joins (a group can hold compounds).
  for (let round = 0; round < 3; round++) {
    const compounds = new Set<string>(), groups = new Set<string>();
    for (const p of doc.paths) if (chosen.has(p.id) && !p.hidden) { if (p.compound) compounds.add(p.compound); if (p.group) groups.add(p.group); }
    let grew = false;
    for (const p of doc.paths) if (!p.hidden && !chosen.has(p.id) && ((p.compound && compounds.has(p.compound)) || (p.group && groups.has(p.group)))) { chosen.add(p.id); grew = true; }
    if (!grew) break;
  }
  return doc.paths.filter(p => !p.hidden && chosen.has(p.id));
}
