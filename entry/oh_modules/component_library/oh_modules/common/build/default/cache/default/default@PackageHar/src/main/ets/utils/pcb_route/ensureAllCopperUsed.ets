/**
 * 硬门禁：当前 Cu 栈每一铜层必须有至少一段 track
 */
import { PcbDocument, PcbLayerId, PcbTrack, copperLayersFromStack } from '../../types/PcbTypes';

export function ensureAllCopperUsed(doc: PcbDocument, tracks: PcbTrack[]): PcbLayerId[] {
  const copper = copperLayersFromStack(doc.layerStack);
  const used: Set<string> = new Set();
  for (let i = 0; i < tracks.length; i++) {
    used.add(tracks[i].layer as string);
  }
  const missing: PcbLayerId[] = [];
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i];
    if (!used.has(lid as string)) {
      missing.push(lid);
    }
  }
  return missing;
}
