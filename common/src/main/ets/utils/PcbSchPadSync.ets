/**
 * 原理图引脚 → PCB 焊盘同步
 * 权威：原理图符号引脚数量与引脚号（pin.number），PCB pads / 3D 引脚必须与之对齐。
 */
import { IdUtil } from './IdUtil';
import { Point2D } from '../types/CommonTypes';
import {
  PcbFootprintInst, PcbPad, PcbPadShape, PcbPadType, PcbLayerId
} from '../types/PcbTypes';
import { Logger } from './Logger';

/** 连续脚号 1..n */
function seqPadNumbers(n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    out.push(`${i}`);
  }
  return out;
}

/**
 * 按 libraryId 返回原理图符号焊盘号列表（与 BuiltinComponents / NamedDevicePins 对齐）。
 * 返回 null 表示未知器件，调用方勿强改焊盘。
 */
export function schPadNumbersForLibrary(libraryId: string): string[] | null {
  const lib = (libraryId ?? '').toUpperCase();
  if (lib.length === 0) {
    return null;
  }

  if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
    lib.startsWith('XTAL_') || lib.startsWith('FUSE_') || lib === 'LDR' ||
    lib === 'BUZZER') {
    return ['1', '2'];
  }
  if (lib.startsWith('POT_')) {
    return ['1', '2', '3'];
  }
  if (lib.startsWith('LED_') || lib === '1N4148' || lib === '1N4007' || lib === '1N5819') {
    return ['1', '2'];
  }
  if (lib === 'SW_PUSH') {
    return ['1', '2'];
  }
  if (lib === 'RELAY_SPDT') {
    return ['1', '2', '3', '4', '5'];
  }

  if (lib === 'UA741' || lib === 'LM741' || lib === 'TL081' || lib === 'TL071') {
    return ['3', '2', '6', '7', '4'];
  }
  if (lib === 'LM358' || lib === 'TL082') {
    return seqPadNumbers(8);
  }
  if (lib === 'LM555' || lib === 'NE555') {
    return seqPadNumbers(8);
  }
  if (lib === 'LM7805' || lib === 'LM7812' || lib === 'AMS1117_3V3') {
    return ['1', '2', '3'];
  }
  if (lib === 'LM2596') {
    return ['1', '2', '3', '4', '5'];
  }

  if (lib.startsWith('74HC') || lib.startsWith('74LS')) {
    if (lib.includes('04')) {
      return ['1', '2', '7', '14'];
    }
    return ['1', '2', '3', '7', '14'];
  }
  if (lib === 'CD4017') {
    return seqPadNumbers(16);
  }

  if (lib.includes('STM32F407')) {
    return seqPadNumbers(100);
  }
  if (lib.includes('STM32F030')) {
    return seqPadNumbers(32);
  }
  if (lib.includes('STM32')) {
    return seqPadNumbers(48);
  }
  if (lib.includes('AT89') || lib.includes('STC') || lib.includes('8051')) {
    return seqPadNumbers(40);
  }

  if (lib === '24C02' || lib === 'W25Q64') {
    return seqPadNumbers(8);
  }
  if (lib === '2764' || lib === '62256') {
    return seqPadNumbers(28);
  }
  if (lib === 'LCD1602') {
    return seqPadNumbers(16);
  }
  if (lib === 'OLED_12864') {
    return ['1', '2', '3', '4'];
  }
  if (lib.includes('DS18B20') || lib.includes('HALL')) {
    return ['1', '2', '3'];
  }

  if (lib.includes('2N3904') || lib.includes('2N3906') || lib.includes('BC547') ||
    lib.includes('BC557') || lib.includes('NPN') || lib.includes('PNP') ||
    lib.includes('2N7000') || lib.includes('IRF') || lib.includes('MOS')) {
    return ['1', '2', '3'];
  }

  return null;
}

function clonePad(src: PcbPad, number: string, pos: Point2D): PcbPad {
  const pad: PcbPad = {
    id: IdUtil.generate('pad'),
    number: number,
    type: src.type,
    shape: src.shape,
    pos: { x: pos.x, y: pos.y },
    size: { x: src.size.x, y: src.size.y },
    layers: src.layers.slice()
  };
  if (src.drill !== undefined) {
    pad.drill = src.drill;
  }
  return pad;
}

function estimatePadPos(index: number, total: number, template: PcbPad): Point2D {
  if (total <= 0) {
    return { x: 0, y: 0 };
  }
  if (total >= 20 && total % 4 === 0) {
    const perSide = total / 4;
    const side = Math.floor(index / perSide);
    const i = index % perSide;
    const pitch = 20;
    const half = ((perSide - 1) * pitch) / 2;
    const span = half + 40;
    const o = 0 - half + i * pitch;
    if (side === 0) {
      return { x: 0 - span, y: o };
    }
    if (side === 1) {
      return { x: o, y: span };
    }
    if (side === 2) {
      return { x: span, y: 0 - o };
    }
    return { x: 0 - o, y: 0 - span };
  }
  const rows = Math.ceil(total / 2);
  const pitch = 50;
  const row = index % rows;
  const col = index < rows ? 0 : 1;
  const y0 = 0 - ((rows - 1) * pitch) / 2;
  const ax = Math.abs(template.pos.x) > 1 ? Math.abs(template.pos.x) : 150;
  const x = col === 0 ? (0 - ax) : ax;
  return { x: x, y: y0 + row * pitch };
}

/**
 * 将封装焊盘强制对齐到原理图引脚号列表。
 * @returns 是否发生了增删改
 */
export function syncPadsToSchPinNumbers(inst: PcbFootprintInst, padNumbers: string[]): boolean {
  if (padNumbers.length === 0) {
    return false;
  }
  const wanted: Set<string> = new Set();
  for (let i = 0; i < padNumbers.length; i++) {
    wanted.add(padNumbers[i]);
  }

  const oldByNum: Map<string, PcbPad> = new Map();
  for (let i = 0; i < inst.pads.length; i++) {
    oldByNum.set(inst.pads[i].number, inst.pads[i]);
  }

  const template: PcbPad = inst.pads.length > 0 ? inst.pads[0] : {
    id: IdUtil.generate('pad'),
    number: '1',
    type: PcbPadType.SMD,
    shape: PcbPadShape.RECT,
    pos: { x: -40, y: 0 },
    size: { x: 30, y: 40 },
    layers: [PcbLayerId.F_CU, PcbLayerId.F_MASK]
  };

  const next: PcbPad[] = [];
  let changed = inst.pads.length !== padNumbers.length;
  for (let i = 0; i < padNumbers.length; i++) {
    const num = padNumbers[i];
    const old = oldByNum.get(num);
    if (old !== undefined) {
      next.push(old);
    } else {
      changed = true;
      next.push(clonePad(template, num, estimatePadPos(i, padNumbers.length, template)));
    }
  }

  if (!changed) {
    for (let i = 0; i < inst.pads.length; i++) {
      if (!wanted.has(inst.pads[i].number)) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    inst.pads = next;
    Logger.info('instr_trace',
      `[PCB] PAD_SYNC_SCH | ${inst.refDes} def=${inst.defId} pads→${padNumbers.length} nums=[${padNumbers.join(',')}]`);
  }
  return changed;
}

/** 正向标注后：按原理图 libraryId 同步焊盘；未知器件跳过 */
export function syncFootprintPadsFromSchematic(inst: PcbFootprintInst, libraryId: string): void {
  const nums = schPadNumbersForLibrary(libraryId);
  if (nums === null) {
    return;
  }
  const before = inst.pads.length;
  syncPadsToSchPinNumbers(inst, nums);
  if (inst.pads.length !== nums.length) {
    Logger.warn('instr_trace',
      `[PCB] PAD_SYNC_FAIL | ${inst.refDes}[${libraryId}] want=${nums.length} before=${before} got=${inst.pads.length}`);
  }
}
