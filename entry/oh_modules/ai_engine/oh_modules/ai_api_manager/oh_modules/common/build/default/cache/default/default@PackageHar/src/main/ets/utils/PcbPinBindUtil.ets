/**
 * 原理图 pinId/pinName ↔ PCB 焊盘号映射（A/K、P1、数字脚等）
 */
import { PcbNetRef } from '../types/PcbTypes';

const PIN_LABEL_TO_PAD: Map<string, string> = new Map([
  ['A', '1'], ['ANODE', '1'], ['C', '1'], ['IN', '1'], ['+', '1'],
  ['V+', '1'], ['I+', '1'], ['VP', '1'],
  ['K', '2'], ['CATHODE', '2'], ['E', '2'], ['GND', '2'], ['-', '2'],
  ['COM', '2'], ['I-', '2'], ['V-', '2'],
  ['B', '3'], ['OUT', '3'], ['G', '3']
]);

export function registerPadNetKey(map: Map<string, PcbNetRef>,
  compId: string, key: string, netId: string, netName: string): void {
  if (key.length === 0) {
    return;
  }
  const entry: PcbNetRef = { netId, netName };
  map.set(`${compId}:${key}`, entry);
  map.set(`${compId}:${key.toUpperCase()}`, entry);
  const stripped = key.replace(/^p/i, '');
  if (stripped.length > 0 && stripped !== key) {
    map.set(`${compId}:${stripped}`, entry);
    map.set(`${compId}:${stripped.toUpperCase()}`, entry);
  }
}

function tryMcuStylePin(map: Map<string, PcbNetRef>, compId: string, pin: string,
  netId: string, netName: string): void {
  if (pin.length >= 2 && (pin.charAt(0) === 'P' || pin.charAt(0) === 'p')) {
    const rest = pin.substring(1);
    if (/^\d+$/.test(rest)) {
      registerPadNetKey(map, compId, rest, netId, netName);
    }
  }
}

function tryLabelAlias(map: Map<string, PcbNetRef>, compId: string, pin: string,
  netId: string, netName: string): void {
  const padNum = PIN_LABEL_TO_PAD.get(pin.toUpperCase());
  if (padNum !== undefined) {
    registerPadNetKey(map, compId, padNum, netId, netName);
  }
}

/** 将原理图 net.pinIds 中的一脚注册到 compId:padKey 查找表 */
export function registerSchPinToPadNet(map: Map<string, PcbNetRef>,
  compId: string, pinId: string, pinName: string, netId: string, netName: string): void {
  registerPadNetKey(map, compId, pinId, netId, netName);
  registerPadNetKey(map, compId, pinName, netId, netName);
  tryMcuStylePin(map, compId, pinId, netId, netName);
  tryMcuStylePin(map, compId, pinName, netId, netName);
  tryLabelAlias(map, compId, pinId, netId, netName);
  tryLabelAlias(map, compId, pinName, netId, netName);
}

function padLookupKeys(padNumber: string): string[] {
  const keys: string[] = [padNumber, padNumber.toUpperCase(), `p${padNumber}`, `P${padNumber}`];
  if (padNumber === '1') {
    keys.push('A', 'C', 'IN', 'ANODE', '+', 'V+', 'I+');
  } else if (padNumber === '2') {
    keys.push('K', 'E', 'GND', 'CATHODE', '-', 'COM', 'I-', 'V-');
  } else if (padNumber === '3') {
    keys.push('B', 'OUT', 'G');
  }
  return keys;
}

/** 按焊盘号在 net 映射表中查找网络 */
export function lookupPadNet(map: Map<string, PcbNetRef>,
  compId: string, padNumber: string): PcbNetRef | undefined {
  const keys = padLookupKeys(padNumber);
  for (let i = 0; i < keys.length; i++) {
    const hit = map.get(`${compId}:${keys[i]}`);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}
