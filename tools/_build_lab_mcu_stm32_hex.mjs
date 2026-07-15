#!/usr/bin/env node
/** Build lab_mcu_stm32.hex — GPIOA PA0 blink (source LED: HIGH = on). */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function u32(x) {
  return [(x & 255), (x >> 8) & 255, (x >> 16) & 255, (x >> 24) & 255];
}
function ldrPc(rt, target, insn) {
  const pc = (insn + 4) & ~3;
  const imm = (target - pc) / 4;
  return 0x4800 | (rt << 8) | imm;
}
function bOp(insn, target) {
  const off = (target - (insn + 4)) / 2;
  return 0xE000 | (off & 0x7FF);
}
function checksum(bs) {
  return (-bs.reduce((a, b) => a + b, 0)) & 0xFF;
}
function ihex(addr, data) {
  const rec = [data.length, (addr >> 8) & 255, addr & 255, 0, ...data];
  rec.push(checksum(rec));
  return ':' + rec.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
}

const pool = [0x40021018, 0x4, 0x40010800, 0x1, 0x1, 0x0];
const patched = new Map();
let addr = 0x08000100;
const ldrSites = [];
const emit = (h) => { patched.set(addr, h); addr += 2; };
const emitLdr = (rt, pi) => { ldrSites.push([addr, rt, pi]); emit(0); };

emitLdr(0, 0); emitLdr(1, 1); emit(0x6001); // RCC IOPAEN
emitLdr(0, 2); emitLdr(1, 3); emit(0x6001); // CRL PA0 out
const loop = addr;
emitLdr(1, 4); emit(0x60C1); // ODR=1
for (let i = 0; i < 80; i++) emit(0xBF00);
emitLdr(1, 5); emit(0x60C1); // ODR=0
for (let i = 0; i < 80; i++) emit(0xBF00);
const bSite = addr; emit(0);
while (addr % 4) emit(0xBF00);

const poolAddrs = [];
for (const v of pool) {
  poolAddrs.push(addr);
  emit(v & 0xFFFF);
  emit((v >> 16) & 0xFFFF);
}
for (const [ia, rt, pi] of ldrSites) patched.set(ia, ldrPc(rt, poolAddrs[pi], ia));
patched.set(bSite, bOp(bSite, loop));

const end = Math.max(...patched.keys()) + 2;
const size = end - 0x08000000;
const img = Buffer.alloc(Math.max(size, 0x42), 0);
Buffer.from(u32(0x20001000)).copy(img, 0);
Buffer.from(u32(0x08000101)).copy(img, 4);
for (const [a, h] of patched) {
  const o = a - 0x08000000;
  img[o] = h & 255;
  img[o + 1] = (h >> 8) & 255;
}
img[0x40] = 0xFE;
img[0x41] = 0xE7;

const lines = [':020000040800F2'];
for (let off = 0; off < img.length; off += 16) {
  const chunk = [...img.subarray(off, off + 16)];
  const interesting = off < 0x10 || (off >= 0x40 && off < 0x50) || off >= 0x100 || chunk.some((b) => b);
  if (interesting) lines.push(ihex(off, chunk));
}
lines.push(':00000001FF');
const text = lines.join('\n') + '\n';

const paths = [
  join(ROOT, 'hex_files', 'lab_mcu_stm32.hex'),
  join(ROOT, 'entry', 'src', 'main', 'resources', 'rawfile', 'hex_files', 'lab_mcu_stm32.hex'),
];
for (const p of paths) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  console.log('wrote', p, 'bytes', img.length);
}
