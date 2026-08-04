import { readFileSync, writeFileSync } from 'fs';

const lines = readFileSync(
  'C:/Users/AHS/.cursor/projects/c-Projects-ElecDraw-Harmony/agent-transcripts/6e6ec6c1-c9bb-4e83-8f6b-b456b2ba9c16/6e6ec6c1-c9bb-4e83-8f6b-b456b2ba9c16.jsonl',
  'utf8'
).split(/\n/);

const obj = JSON.parse(lines[397]);
let i = 0;
for (const b of obj.message.content) {
  if (b.type !== 'tool_use' || b.name !== 'StrReplace') continue;
  writeFileSync('tools/pcb_templates/_recover/l397_' + i + '.txt', b.input.new_string);
  console.log(i, 'len', b.input.new_string.length);
  i++;
}

// Find expanded STM32 map with PC0
for (let li = 0; li < lines.length; li++) {
  if (!lines[li].includes('PC0') || !lines[li].includes('STM32F103C8_PIN_TO_PAD')) continue;
  const o = JSON.parse(lines[li]);
  const content = o?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const b of content) {
    const t = b.input?.new_string || b.input?.contents || '';
    if (t.includes('PC0') && t.includes('STM32F103C8_PIN_TO_PAD')) {
      writeFileSync('tools/pcb_templates/_recover/stm32_pc0.txt', t);
      console.log('PC0 map line', li, 'len', t.length);
    }
  }
}
