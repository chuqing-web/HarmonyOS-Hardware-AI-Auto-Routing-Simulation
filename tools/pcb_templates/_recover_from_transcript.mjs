import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const p = 'C:/Users/AHS/.cursor/projects/c-Projects-ElecDraw-Harmony/agent-transcripts/6e6ec6c1-c9bb-4e83-8f6b-b456b2ba9c16/6e6ec6c1-c9bb-4e83-8f6b-b456b2ba9c16.jsonl';
const lines = readFileSync(p, 'utf8').split(/\n/).filter(Boolean);
const outDir = 'tools/pcb_templates/_recover';
mkdirSync(outDir, { recursive: true });

const keys = [
  'defQFP48', 'defDIP14', 'defDIP16', 'defDIP28', 'STM32F103C8_PIN',
  'MEM24C02', 'MEM2764', 'W25Q64_PIN', 'MEM62256', 'handLayoutLabUart',
  'handLayoutLabPassive', 'handLayoutLabDiscrete', 'handLayoutLabAnalog',
  'handLayoutLabDigital', 'isMcuStm32', 'defPOT3', 'defSIP5', 'BJT_PIN_TO_PAD'
];

let n = 0;
for (let i = 0; i < lines.length; i++) {
  let obj;
  try { obj = JSON.parse(lines[i]); } catch { continue; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    if (!['StrReplace', 'Write'].includes(block.name)) continue;
    const input = block.input || {};
    const path = input.path || '';
    const text = input.new_string || input.contents || '';
    if (!path.includes('export.mjs') && !path.includes('_hand_') && !path.includes('_splice_')) continue;
    const hit = keys.filter(k => text.includes(k));
    if (!hit.length && !(path.includes('_hand_') || path.includes('_splice_'))) continue;
    const fname = String(i).padStart(4, '0') + '_' + block.name + '_' + (hit[0] || 'misc') + '.json';
    writeFileSync(join(outDir, fname), JSON.stringify({
      line: i,
      name: block.name,
      path,
      hit,
      old_string: input.old_string || null,
      new_string: text
    }, null, 2));
    n++;
  }
}
console.log('wrote', n, 'snippets to', outDir);
