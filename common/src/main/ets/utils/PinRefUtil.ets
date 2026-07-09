/**
 * Standardized pin reference parser.
 * Pin references in net.pinIds use the format: compId:pinId:pinName
 * e.g. "comp_001:p1:VCC" or "comp_001:p1" (name defaults to pinId)
 */
export interface ParsedPinRef {
  compId: string;
  pinId: string;
  pinName: string;
}

/**
 * Parse a pin reference string into its components.
 * Returns null if the format is invalid.
 */
export function parsePinRef(pinRef: string): ParsedPinRef | null {
  if (pinRef.length === 0) return null;
  const parts = pinRef.split(':');
  if (parts.length < 2) {
    // Legacy format: just a component ID — treat as compId only
    return { compId: parts[0], pinId: '', pinName: '' };
  }
  return {
    compId: parts[0],
    pinId: parts[1],
    pinName: parts.length >= 3 ? parts[2] : parts[1]
  };
}

/**
 * Build a pin reference string in the standard format.
 */
export function buildPinRef(compId: string, pinId: string, pinName: string): string {
  return `${compId}:${pinId}:${pinName}`;
}

/**
 * Extract pin references from nets that belong to a specific component.
 * Returns a map of pinName → netId.
 */
export interface Net {
  id: string;
  pinIds: string[];
}

export function getPinNetMap(compId: string, nets: Net[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const net of nets) {
    for (const pinRef of net.pinIds) {
      const parsed = parsePinRef(pinRef);
      if (parsed !== null && parsed.compId === compId && parsed.pinName.length > 0) {
        map.set(parsed.pinName, net.id);
      }
    }
  }
  return map;
}
