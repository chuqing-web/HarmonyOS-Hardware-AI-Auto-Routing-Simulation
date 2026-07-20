/**
 * 模块并行：计划类型、门禁、拓扑合并（POWER + pin-to-pin joints）
 */
import {
  SchTopology, DeviceInst, NetInfo, IdUtil, emptySchTopology, TopologyAdapter,
  Logger, INSTR_TRACE_TAG, NetType, mapAwareStringify, mapAwareParse
} from 'common';
import { IComponentLibrary } from 'component_library';
import { TemplateSchematicKit, PinSpec } from './TemplateSchematicKit';

export interface ModularModuleSpec {
  id: string;
  title: string;
  prompt: string;
  boundaryPins: string[];
}

export interface ModularJointSpec {
  from: string;
  to: string;
}

export interface ModularPlan {
  systemOverview: string;
  modules: ModularModuleSpec[];
  joints: ModularJointSpec[];
}

export interface ModularEndpoint {
  kind: 'power' | 'module';
  moduleId: string;
  refDes: string;
  pin: string;
  raw: string;
}

export interface ModularMergeResult {
  topology: SchTopology;
  jointOk: number;
  jointFail: number;
  jointFailReasons: string[];
}

function asText(v: Object | string | number | boolean | null | undefined, fallback: string): string {
  if (v === undefined || v === null) {
    return fallback;
  }
  return `${v}`.trim();
}

function stripBoundaryNote(s: string): string {
  const eq = s.indexOf('=');
  return (eq >= 0 ? s.substring(0, eq) : s).trim();
}

/** 归一化边界脚键：RefDes.Pin（大写）— orchestrator ERC 软化共用 */
export function normalizeBoundaryKey(raw: string): string {
  const clean = stripBoundaryNote(raw).toUpperCase();
  const parts = clean.split('.');
  if (parts.length < 2) {
    return clean;
  }
  return `${parts[0]}.${parts.slice(1).join('.')}`;
}

/**
 * 是否把 libDevId/型号误当作 RefDes（如 LM555、LED_RED）。
 * 合法位号：U1/R12/RV1/LED1/SW1/AM1/VM1/SCOPE1（≤5 字母 + ≤2 数字）。
 * 注意：勿把 SCOPE1 等仪器位号误判为型号（旧规则 ≤3 字母会误伤）。
 */
export function looksLikeLibIdAsRefDes(ref: string): boolean {
  const r = (ref ?? '').trim().toUpperCase();
  if (r.length === 0) {
    return false;
  }
  if (r === 'VCC' || r === 'GND' || r === 'VDD' || r === 'VSS' || r === 'POWER') {
    return false;
  }
  if (r.indexOf('_') >= 0) {
    return true;
  }
  // 标准位号：1～5 字母 + 1～2 数字（含 SCOPE1/UART1/OSC1/SW1 等）
  if (/^[A-Z]{1,5}\d{1,2}$/.test(r)) {
    return false;
  }
  // 型号形态：含字母与数字且长度≥4（LM555、CD4017、2N2222）
  if (r.length >= 4 && /[A-Z]/.test(r) && /\d/.test(r)) {
    return true;
  }
  // 纯大写长词无数字：库 ID（OSCILLOSCOPE、BUZZER）而非位号
  if (r.length >= 6 && /^[A-Z]+$/.test(r)) {
    return true;
  }
  return false;
}

/** libDevId 误写入 boundary/joints 时的推荐位号前缀 */
export function suggestRefPrefixForLibId(libId: string): string {
  const u = (libId ?? '').trim().toUpperCase();
  if (u === 'OSCILLOSCOPE') {
    return 'OSC';
  }
  if (u === 'VOLTMETER_DC' || u === 'VIRTUAL_METER') {
    return 'VM';
  }
  if (u === 'AMMETER_DC') {
    return 'AM';
  }
  if (u.indexOf('UART') >= 0) {
    return 'UART';
  }
  if (u.indexOf('LOGIC_ANALYZER') >= 0) {
    return 'LA';
  }
  if (u.indexOf('FREQ') >= 0) {
    return 'FC';
  }
  if (u.indexOf('POWER_METER') >= 0) {
    return 'PM';
  }
  if (u.startsWith('SW_') || u === 'SW') {
    return 'SW';
  }
  if (u.indexOf('RELAY') >= 0) {
    return 'K';
  }
  if (u === 'BUZZER') {
    return 'BZ';
  }
  if (u.startsWith('POT_')) {
    return 'RV';
  }
  if (u.startsWith('R_')) {
    return 'R';
  }
  if (u.startsWith('C_')) {
    return 'C';
  }
  if (u.startsWith('LED_') || u.startsWith('1N')) {
    return 'D';
  }
  if (u.length >= 1 && u.length <= 5 && /^[A-Z]+$/.test(u)) {
    return u.substring(0, Math.min(3, u.length));
  }
  return 'U';
}

/**
 * 归一化 modular plan：补全 joints 缺的 boundaryPins；把 libId 当 RefDes 改成位号。
 * 在 critique 前调用，减少无谓的 LLM 重试（如 POWER→R1.1 漏写 boundary）。
 */
export function healModularPlan(plan: ModularPlan): ModularPlan {
  // 1) 各模块内：libId-as-RefDes → 唯一位号
  for (let mi = 0; mi < plan.modules.length; mi++) {
    const mod = plan.modules[mi];
    const used = new Set<string>();
    const rewrite = new Map<string, string>();
    const noteLibRef = (rawRef: string): void => {
      const ref = (rawRef ?? '').trim();
      if (ref.length === 0 || !looksLikeLibIdAsRefDes(ref)) {
        return;
      }
      const key = ref.toUpperCase();
      if (rewrite.has(key)) {
        return;
      }
      const prefix = suggestRefPrefixForLibId(ref);
      let n = 1;
      let cand = `${prefix}${n}`;
      while (used.has(cand.toUpperCase())) {
        n++;
        cand = `${prefix}${n}`;
      }
      used.add(cand.toUpperCase());
      rewrite.set(key, cand);
    };
    for (let bi = 0; bi < mod.boundaryPins.length; bi++) {
      const key = normalizeBoundaryKey(mod.boundaryPins[bi]);
      const dot = key.indexOf('.');
      if (dot > 0) {
        const ref = key.substring(0, dot);
        if (!looksLikeLibIdAsRefDes(ref)) {
          used.add(ref.toUpperCase());
        } else {
          noteLibRef(ref);
        }
      }
    }
    for (let ji = 0; ji < plan.joints.length; ji++) {
      for (const side of [plan.joints[ji].from, plan.joints[ji].to]) {
        const ep = parseModularEndpoint(side);
        if (ep && ep.kind === 'module' && ep.moduleId === mod.id) {
          if (!looksLikeLibIdAsRefDes(ep.refDes)) {
            used.add(ep.refDes.toUpperCase());
          } else {
            noteLibRef(ep.refDes);
          }
        }
      }
    }
    if (rewrite.size === 0) {
      continue;
    }
    const applyRef = (ref: string): string => {
      const mapped = rewrite.get(ref.toUpperCase());
      return mapped !== undefined ? mapped : ref;
    };
    const newBps: string[] = [];
    for (let bi = 0; bi < mod.boundaryPins.length; bi++) {
      const raw = stripBoundaryNote(mod.boundaryPins[bi]);
      const parts = raw.split('.');
      if (parts.length >= 2) {
        newBps.push(`${applyRef(parts[0])}.${parts.slice(1).join('.')}`);
      } else {
        newBps.push(raw);
      }
    }
    mod.boundaryPins = newBps;
    // prompt：仅替换「LibId.Pin」形态；若缺新位号则追加一句，满足 critique「RefDes 须出现在 prompt」
    let prompt = mod.prompt;
    const rewriteKeys: string[] = Array.from(rewrite.keys());
    for (let ri = 0; ri < rewriteKeys.length; ri++) {
      const fromLib = rewriteKeys[ri];
      const toRef = rewrite.get(fromLib) as string;
      const pinForm = new RegExp(`${fromLib}\\.`, 'gi');
      prompt = prompt.replace(pinForm, `${toRef}.`);
      if (prompt.toUpperCase().indexOf(toRef.toUpperCase()) < 0) {
        prompt = `${prompt} 位号${toRef}（libDevId=${fromLib}）。`;
      }
    }
    mod.prompt = prompt;
    for (let ji = 0; ji < plan.joints.length; ji++) {
      const j = plan.joints[ji];
      const rewriteSide = (side: string): string => {
        const ep = parseModularEndpoint(side);
        if (!ep || ep.kind !== 'module' || ep.moduleId !== mod.id) {
          return side;
        }
        const nr = applyRef(ep.refDes);
        if (nr === ep.refDes) {
          return side;
        }
        return `${ep.moduleId}.${nr}.${ep.pin}`;
      };
      j.from = rewriteSide(j.from);
      j.to = rewriteSide(j.to);
    }
  }

  // 2) joints 端点自动补进对应模块 boundaryPins（尤其 POWER→R1.1）
  for (let ji = 0; ji < plan.joints.length; ji++) {
    const j = plan.joints[ji];
    for (const side of [j.from, j.to]) {
      const ep = parseModularEndpoint(side);
      if (!ep || ep.kind !== 'module') {
        continue;
      }
      const mod = plan.modules.find(m => m.id === ep.moduleId);
      if (!mod) {
        continue;
      }
      if (looksLikeLibIdAsRefDes(ep.refDes)) {
        continue;
      }
      if (!boundaryContains(mod, ep.refDes, ep.pin)) {
        mod.boundaryPins.push(`${ep.refDes}.${ep.pin}`);
      }
    }
  }
  return plan;
}

function is555FamilyHint(hint: string): boolean {
  const h = hint.toUpperCase();
  return h === 'NE555' || h === 'LM555' || h === 'SE555' || h === 'SA555' ||
    h === 'ICM7555' || h === 'TLC555' || h === '555';
}

/** 555 族等别名归一，便于 joints 按 libDevId 回退 */
function normalizeLibAlias(libOrRef: string): string {
  const u = (libOrRef ?? '').trim().toUpperCase();
  if (is555FamilyHint(u)) {
    return 'LM555';
  }
  return u;
}

/** 解析 "M1.RV1.W" 或 "POWER.VCC" */
export function parseModularEndpoint(raw: string): ModularEndpoint | null {
  const t = raw.trim();
  if (t.length === 0) {
    return null;
  }
  const parts = t.split('.');
  if (parts.length < 2) {
    return null;
  }
  const head = parts[0].toUpperCase();
  if (head === 'POWER') {
    const rail = parts[1].toUpperCase();
    if (rail !== 'VCC' && rail !== 'GND' && rail !== 'VDD' && rail !== 'VSS' &&
      rail !== 'VEE') {
      return null;
    }
    const pin = rail === 'VDD' ? 'VCC' : (rail === 'VSS' ? 'GND' : rail);
    return { kind: 'power', moduleId: 'POWER', refDes: pin, pin: pin, raw: t };
  }
  if (parts.length < 3) {
    return null;
  }
  return {
    kind: 'module',
    moduleId: parts[0],
    refDes: parts[1],
    pin: parts.slice(2).join('.'),
    raw: t
  };
}

export function normalizeModularPlan(raw: Object | null): ModularPlan | null {
  if (!raw) {
    return null;
  }
  const src = raw as Record<string, Object>;
  const overview = asText(src['systemOverview'] ?? src['system_overview'], '');
  const modulesRaw = src['modules'];
  const jointsRaw = src['joints'];
  const modules: ModularModuleSpec[] = [];
  if (Array.isArray(modulesRaw)) {
    for (const mObj of modulesRaw as Object[]) {
      const m = mObj as Record<string, Object>;
      const id = asText(m['id'] ?? m['moduleId'] ?? m['module_id'], '');
      const title = asText(m['title'] ?? m['name'], id);
      const prompt = asText(m['prompt'] ?? m['subPrompt'] ?? m['sub_prompt'], '');
      const bpRaw = m['boundaryPins'] ?? m['boundary_pins'] ?? m['boundaries'];
      const boundaryPins: string[] = [];
      if (Array.isArray(bpRaw)) {
        for (const b of bpRaw as Object[]) {
          const s = stripBoundaryNote(asText(b, ''));
          if (s.length > 0) {
            boundaryPins.push(s);
          }
        }
      }
      if (id.length > 0 && prompt.length > 0) {
        modules.push({ id, title, prompt, boundaryPins });
      }
    }
  }
  const joints: ModularJointSpec[] = [];
  if (Array.isArray(jointsRaw)) {
    for (const jObj of jointsRaw as Object[]) {
      const j = jObj as Record<string, Object>;
      const from = asText(j['from'] ?? j['a'] ?? j['src'], '');
      const to = asText(j['to'] ?? j['b'] ?? j['dst'], '');
      if (from.length > 0 && to.length > 0) {
        joints.push({ from, to });
      }
    }
  }
  if (modules.length === 0) {
    return null;
  }
  return { systemOverview: overview, modules, joints };
}

function boundaryContains(mod: ModularModuleSpec, refDes: string, pin: string): boolean {
  const key = `${refDes}.${pin}`.toUpperCase();
  for (let i = 0; i < mod.boundaryPins.length; i++) {
    if (normalizeBoundaryKey(mod.boundaryPins[i]) === key) {
      return true;
    }
  }
  return false;
}

function overviewAllowsNoPower(overview: string): boolean {
  const t = overview.toLowerCase();
  return t.indexOf('无源') >= 0 || t.indexOf('浮空') >= 0 ||
    t.indexOf('教学') >= 0 || t.indexOf('无电源') >= 0 ||
    t.indexOf('battery-less') >= 0;
}

/** 教材常见库外型号 — 出现且库无法解析则 HARD 拒收 plan */
const CLASSIC_OOD_HINTS: string[] = [
  'NE555', 'LM555', 'SE555', 'SA555', 'ICM7555', 'TLC555',
  '2N3904', '2N3906', 'BC547', 'BC557', 'BC337', 'BC327',
  'TIP120', 'TIP31C', 'TIP42C', 'Arduino', 'ATMEGA328',
  'ESP32', 'ESP8266', 'RASPBERRY'
];

function libraryHasId(library: IComponentLibrary, id: string): boolean {
  if (!id || id.length === 0) {
    return false;
  }
  try {
    const exact = library.getComponent(id);
    if (exact.success && exact.data) {
      return true;
    }
    // 仅做精确/大小写变体查询，避免 resolveLibraryId 扫全库时对空 id 调 toUpperCase 崩掉
    const upper = id.toUpperCase();
    if (upper !== id) {
      const byUpper = library.getComponent(upper);
      if (byUpper.success && byUpper.data) {
        return true;
      }
    }
  } catch (_e) {
    return false;
  }
  return false;
}

/** 扫描模块 prompt 中的库外型号提及 */
export function findOutOfLibraryMentions(text: string, library: IComponentLibrary): string[] {
  const found: string[] = [];
  const safe = text ?? '';
  const upper = safe.toUpperCase();
  for (let i = 0; i < CLASSIC_OOD_HINTS.length; i++) {
    const hint = CLASSIC_OOD_HINTS[i];
    const h = hint.toUpperCase();
    if (upper.indexOf(h) < 0) {
      continue;
    }
    if (!libraryHasId(library, hint)) {
      // 555 族别名均解析到 LM555
      if (is555FamilyHint(hint) && libraryHasId(library, 'LM555')) {
        continue;
      }
      if (found.indexOf(hint) < 0) {
        found.push(hint);
      }
    }
  }
  // 裸 555 定时器写法（库无 LM555 时拒收）
  const has555Chip =
    upper.indexOf('NE555') >= 0 || upper.indexOf('LM555') >= 0 ||
    safe.indexOf('555定时') >= 0 || safe.indexOf('555 定时') >= 0 ||
    safe.indexOf('555振荡') >= 0 || safe.indexOf('555芯片') >= 0 ||
    safe.indexOf('（555') >= 0 || safe.indexOf('(555') >= 0 ||
    upper.indexOf('555）') >= 0 || upper.indexOf('555)') >= 0;
  if (has555Chip || (upper.indexOf('555') >= 0 &&
    (safe.indexOf('无稳态') >= 0 || safe.indexOf('多谐') >= 0 || safe.indexOf('振荡器') >= 0))) {
    if (!libraryHasId(library, 'NE555') && !libraryHasId(library, 'LM555') &&
      found.indexOf('555') < 0 && found.indexOf('NE555') < 0 && found.indexOf('NE555/555') < 0) {
      found.push('NE555/555');
    }
  }
  return found;
}

/**
 * 从模块 prompt 解析 RefDes → libDevId（libDevId=XXX / U1（libDevId=LM555）/ U1=LM555）。
 */
export function extractRefLibMapFromPrompt(prompt: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = prompt ?? '';
  // RefDes（libDevId=XXX）或 RefDes(libDevId=XXX)
  const re1 = /([A-Za-z]{1,5}\d{1,2})\s*[（(]\s*libDevId\s*=\s*([A-Za-z0-9_.-]+)\s*[）)]/gi;
  let m: RegExpExecArray | null = re1.exec(text);
  while (m) {
    map.set((m[1] ?? '').toUpperCase(), (m[2] ?? '').trim());
    m = re1.exec(text);
  }
  // RefDes=LIB 或 RefDes＝LIB
  const re2 = /([A-Za-z]{1,5}\d{1,2})\s*[=＝]\s*([A-Za-z0-9_.-]+)/gi;
  m = re2.exec(text);
  while (m) {
    const ref = (m[1] ?? '').toUpperCase();
    const lib = (m[2] ?? '').trim();
    if (!map.has(ref) && lib.length > 0 && looksLikeLibIdAsRefDes(lib)) {
      map.set(ref, lib);
    }
    m = re2.exec(text);
  }
  return map;
}

/** 从文本提取出现的库内 libDevId */
export function extractLibIdsInText(text: string, library: IComponentLibrary): string[] {
  const found: string[] = [];
  const upper = (text ?? '').toUpperCase();
  const re = /libDevId\s*=\s*([A-Za-z0-9_.-]+)/gi;
  let m: RegExpExecArray | null = re.exec(text ?? '');
  while (m) {
    const id = (m[1] ?? '').trim();
    if (id.length > 0 && found.indexOf(id) < 0) {
      found.push(id);
    }
    m = re.exec(text ?? '');
  }
  const categories = library.getCategories();
  for (const cat of categories) {
    const result = library.listByCategory(cat, 1, 200);
    for (const d of result.items) {
      const id = d.id;
      if (id.length < 2) {
        continue;
      }
      if (upper.indexOf(id.toUpperCase()) >= 0 && found.indexOf(id) < 0) {
        found.push(id);
      }
    }
  }
  return found;
}

/** 电源/无源/常见分立不算「擅自加的大器件」 */
function isInfrastructureLib(libId: string): boolean {
  const id = (libId ?? '').toUpperCase();
  if (id === 'VCC' || id === 'GND' || id === 'VAC' || id === 'VDD' || id === 'VSS') {
    return true;
  }
  if (id.indexOf('R_') === 0 || id.indexOf('C_') === 0 || id.indexOf('L_') === 0) {
    return true;
  }
  if (id.indexOf('POT_') === 0 || id.indexOf('XTAL_') === 0 || id.indexOf('FUSE_') === 0) {
    return true;
  }
  if (id.indexOf('LED_') === 0 || id.indexOf('1N') === 0) {
    return true;
  }
  if (id.indexOf('2N') === 0 || id.indexOf('IRF') === 0) {
    return true;
  }
  if (id === 'SW_PUSH' || id === 'BUZZER' || id === 'RELAY_SPDT') {
    return true;
  }
  return false;
}

function isInstrumentLib(libId: string): boolean {
  const id = (libId ?? '').toUpperCase();
  return id.indexOf('OSCILLOSCOPE') >= 0 || id.indexOf('VOLTMETER') >= 0 ||
    id.indexOf('AMMETER') >= 0 || id.indexOf('UART_TERMINAL') >= 0 ||
    id.indexOf('LOGIC_ANALYZER') >= 0 || id.indexOf('POWER_METER') >= 0 ||
    id.indexOf('FREQ_COUNTER') >= 0 || id.indexOf('VIRTUAL_METER') >= 0;
}

/** 用户需求是否足以支撑该 libDevId（通用忠实度，非场景特例） */
function userSolicitsLib(userPrompt: string, libId: string): boolean {
  const u = (userPrompt ?? '').toLowerCase();
  const uUpper = (userPrompt ?? '').toUpperCase();
  const id = (libId ?? '').toUpperCase();
  if (id.length === 0) {
    return true;
  }
  if (uUpper.indexOf(id) >= 0) {
    return true;
  }
  // 仪器：测量/观测类关键词
  if (isInstrumentLib(id)) {
    if (id.indexOf('OSCILLOSCOPE') >= 0) {
      return u.indexOf('示波') >= 0 || u.indexOf('波形') >= 0 || u.indexOf('指数') >= 0 ||
        u.indexOf('oscilloscope') >= 0 || u.indexOf('观测') >= 0 || u.indexOf('τ') >= 0 ||
        u.indexOf('时间常数') >= 0 || u.indexOf('充放电') >= 0;
    }
    if (id.indexOf('VOLTMETER') >= 0) {
      return u.indexOf('电压表') >= 0 || u.indexOf('测电压') >= 0 || u.indexOf('分压') >= 0 ||
        u.indexOf('voltmeter') >= 0;
    }
    if (id.indexOf('AMMETER') >= 0) {
      return u.indexOf('电流表') >= 0 || u.indexOf('测电流') >= 0 || u.indexOf('ammeter') >= 0;
    }
    if (id.indexOf('UART') >= 0) {
      return u.indexOf('uart') >= 0 || u.indexOf('串口') >= 0 || u.indexOf('终端') >= 0;
    }
    if (id.indexOf('LOGIC') >= 0) {
      return u.indexOf('逻辑分析') >= 0 || u.indexOf('数字') >= 0 || u.indexOf('门电路') >= 0;
    }
    // 其它仪器：用户点名测量/仪器即允许
    return u.indexOf('仪器') >= 0 || u.indexOf('测量') >= 0 || u.indexOf('meter') >= 0;
  }
  // 定时器族
  if (id.indexOf('555') >= 0) {
    return uUpper.indexOf('555') >= 0 || u.indexOf('方波') >= 0 || u.indexOf('振荡') >= 0 ||
      u.indexOf('定时') >= 0 || u.indexOf('多谐') >= 0 || u.indexOf('无稳态') >= 0;
  }
  // MCU 族
  if (id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0) {
    return uUpper.indexOf('STM32') >= 0 || uUpper.indexOf('AT89') >= 0 ||
      uUpper.indexOf('STC') >= 0 || u.indexOf('单片机') >= 0 || u.indexOf('mcu') >= 0 ||
      u.indexOf('微控') >= 0 || u.indexOf('最小系统') >= 0;
  }
  // 运放族
  if (id.indexOf('741') >= 0 || id.indexOf('LM358') >= 0 || id.indexOf('TL082') >= 0) {
    return u.indexOf('运放') >= 0 || u.indexOf('放大') >= 0 || u.indexOf('跟随') >= 0 ||
      uUpper.indexOf('741') >= 0 || uUpper.indexOf('LM358') >= 0 || uUpper.indexOf('TL082') >= 0;
  }
  // 逻辑 IC
  if (id.indexOf('74HC') === 0 || id.indexOf('CD40') === 0) {
    return u.indexOf('门电路') >= 0 || u.indexOf('逻辑') >= 0 || uUpper.indexOf('74HC') >= 0 ||
      uUpper.indexOf('CD40') >= 0 || u.indexOf('计数') >= 0;
  }
  // 稳压
  if (id.indexOf('LM78') === 0 || id.indexOf('AMS1117') === 0 || id.indexOf('LM2596') === 0) {
    return u.indexOf('稳压') >= 0 || u.indexOf('电源') >= 0 || u.indexOf('ldo') >= 0 ||
      u.indexOf('降压') >= 0 || uUpper.indexOf(id) >= 0;
  }
  // 默认：用户原文出现型号关键词（去前缀数字比对弱匹配）
  const short = id.replace(/_/g, '');
  return short.length >= 4 && uUpper.indexOf(short) >= 0;
}

/**
 * 通用忠实度：plan 中的重大有源/仪器必须能被用户需求支撑。
 * 无源、电源、基础分立不拦。
 */
function detectUnsolicitedMajorDevices(
  userPrompt: string,
  plan: ModularPlan,
  library: IComponentLibrary
): string[] {
  const issues: string[] = [];
  const planText = `${plan.systemOverview}\n${plan.modules.map(m => m.prompt).join('\n')}`;
  const libs = extractLibIdsInText(planText, library);
  const bad: string[] = [];
  for (let i = 0; i < libs.length; i++) {
    const id = libs[i];
    if (isInfrastructureLib(id)) {
      continue;
    }
    if (userSolicitsLib(userPrompt, id)) {
      continue;
    }
    if (bad.indexOf(id) < 0) {
      bad.push(id);
    }
  }
  if (bad.length > 0) {
    issues.push(
      `擅自加入用户未要求的器件 [${bad.join(',')}] — ` +
      '请忠实用户需求，删除扩容芯片/仪器，或改用需求明确点名的方案');
  }
  return issues;
}

function libraryPinIds(library: IComponentLibrary, libId: string): string[] {
  const ids: string[] = [];
  try {
    const comp = library.getComponent(libId);
    if (comp.success && comp.data && comp.data.pins) {
      for (let i = 0; i < comp.data.pins.length; i++) {
        const p = comp.data.pins[i];
        const pid = `${p.id ?? ''}`.toUpperCase();
        const pname = `${p.name ?? ''}`.toUpperCase();
        if (pid.length > 0 && ids.indexOf(pid) < 0) {
          ids.push(pid);
        }
        if (pname.length > 0 && ids.indexOf(pname) < 0) {
          ids.push(pname);
        }
      }
      return ids;
    }
    const meta = library.getDeviceMeta(libId);
    if (meta.success && meta.data && meta.data.pin_list) {
      for (let i = 0; i < meta.data.pin_list.length; i++) {
        const mp = meta.data.pin_list[i];
        const pid = `${mp.pin_id ?? ''}`.toUpperCase();
        const pl = `${mp.pin_label ?? ''}`.toUpperCase();
        if (pid.length > 0 && ids.indexOf(pid) < 0) {
          ids.push(pid);
        }
        if (pl.length > 0 && ids.indexOf(pl) < 0) {
          ids.push(pl);
        }
      }
    }
  } catch (_e) {
    // ignore
  }
  return ids;
}

function pinMatchesLibrary(library: IComponentLibrary, libId: string, pinHint: string): boolean {
  const h = (pinHint ?? '').toUpperCase().trim();
  if (h.length === 0 || libId.length === 0) {
    return false;
  }
  const pins = libraryPinIds(library, libId);
  if (pins.length === 0) {
    return true; // 无脚信息则不误杀
  }
  for (let i = 0; i < pins.length; i++) {
    if (pins[i] === h) {
      return true;
    }
  }
  return false;
}

/** 猜测 RefDes 对应 lib（无显式映射时）：OSC*→示波器，RV*→电位器，VM*→电压表… */
function inferLibIdFromRefDes(refDes: string, modPrompt: string, library: IComponentLibrary): string {
  const ref = (refDes ?? '').toUpperCase();
  const map = extractRefLibMapFromPrompt(modPrompt);
  const hit = map.get(ref);
  if (hit && hit.length > 0) {
    return hit;
  }
  const libs = extractLibIdsInText(modPrompt, library);
  let wantKind = '';
  if (ref.indexOf('OSC') === 0 || ref.indexOf('SCOPE') === 0) {
    wantKind = 'OSC';
  } else if (ref.indexOf('VM') === 0) {
    wantKind = 'VM';
  } else if (ref.indexOf('AM') === 0) {
    wantKind = 'AM';
  } else if (ref.indexOf('RV') === 0) {
    wantKind = 'POT';
  } else if (ref.indexOf('UART') === 0) {
    wantKind = 'UART';
  } else if (ref.indexOf('LA') === 0) {
    wantKind = 'LA';
  }
  if (wantKind.length > 0) {
    for (let li = 0; li < libs.length; li++) {
      const idU = libs[li].toUpperCase();
      if (wantKind === 'OSC' && idU.indexOf('OSCILLOSCOPE') >= 0) {
        return libs[li];
      }
      if (wantKind === 'VM' && idU.indexOf('VOLTMETER') >= 0) {
        return libs[li];
      }
      if (wantKind === 'AM' && idU.indexOf('AMMETER') >= 0) {
        return libs[li];
      }
      if (wantKind === 'POT' && idU.indexOf('POT_') === 0) {
        return libs[li];
      }
      if (wantKind === 'UART' && idU.indexOf('UART') >= 0) {
        return libs[li];
      }
      if (wantKind === 'LA' && idU.indexOf('LOGIC') >= 0) {
        return libs[li];
      }
    }
  }
  if (ref.indexOf('R') === 0 && ref.indexOf('RV') !== 0) {
    for (let li = 0; li < libs.length; li++) {
      if (libs[li].indexOf('R_') === 0) {
        return libs[li];
      }
    }
  }
  if (ref.indexOf('C') === 0) {
    for (let li = 0; li < libs.length; li++) {
      if (libs[li].indexOf('C_') === 0) {
        return libs[li];
      }
    }
  }
  if (ref.indexOf('U') === 0) {
    for (let li = 0; li < libs.length; li++) {
      if (!isInfrastructureLib(libs[li]) && !isInstrumentLib(libs[li])) {
        return libs[li];
      }
    }
  }
  return '';
}

/** prompt/boundary 脚名幻觉与库脚校验 */
function detectInvalidPins(
  mod: ModularModuleSpec,
  library?: IComponentLibrary
): string[] {
  const issues: string[] = [];
  const p = mod.prompt ?? '';

  if (p.indexOf('假设') >= 0 || p.indexOf('假定') >= 0) {
    issues.push(
      `模块 ${mod.id} prompt 含「假设/假定」脚名 — 禁止猜测，必须使用库内真实 pinId`);
  }
  if (p.indexOf('悬空') >= 0 && p.indexOf('可悬空') < 0) {
    issues.push(
      `模块 ${mod.id} prompt 将引脚「悬空」当作完成态 — 请连接、删除器件或明确标为 NC 且不进 boundaryPins`);
  }

  if (!library) {
    return issues;
  }

  for (const bp of mod.boundaryPins) {
    const key = normalizeBoundaryKey(bp);
    const parts = key.split('.');
    if (parts.length < 2) {
      continue;
    }
    const ref = parts[0];
    const pin = parts.slice(1).join('.');
    if (looksLikeLibIdAsRefDes(ref)) {
      continue;
    }
    const libId = inferLibIdFromRefDes(ref, mod.prompt, library);
    if (libId.length === 0) {
      continue;
    }
    if (!pinMatchesLibrary(library, libId, pin)) {
      const ok = libraryPinIds(library, libId).slice(0, 8).join('/');
      issues.push(
        `模块 ${mod.id} boundaryPin ${bp} 脚「${pin}」不属于 ${libId}` +
        (ok.length > 0 ? `（可用: ${ok}）` : ''));
    }
  }
  return issues;
}

/** 边界门禁；返回问题列表（空=通过）。传入 library 时额外拒收库外型号。 */
export function critiqueModularPlan(
  plan: ModularPlan,
  library?: IComponentLibrary,
  userPrompt?: string
): string[] {
  const issues: string[] = [];
  if (plan.systemOverview.trim().length < 8) {
    issues.push('systemOverview 过短 — 需描述整电路功能与信号流');
  }
  if (plan.modules.length < 2 || plan.modules.length > 4) {
    issues.push(`modules 数量须为 2～4，当前 ${plan.modules.length}`);
  }
  const idSet = new Set<string>();
  const jointedBoundaries = new Set<string>();

  for (const m of plan.modules) {
    if (idSet.has(m.id)) {
      issues.push(`模块 id 重复: ${m.id}`);
    }
    idSet.add(m.id);
    if (m.prompt.trim().length < 12) {
      issues.push(`模块 ${m.id} prompt 过短`);
    }
    if (m.boundaryPins.length === 0) {
      issues.push(`模块 ${m.id} 缺少 boundaryPins（连接边界）`);
    }
    for (const bp of m.boundaryPins) {
      const key = normalizeBoundaryKey(bp);
      if (key.indexOf('.') < 0) {
        issues.push(`模块 ${m.id} boundaryPin 格式须为 RefDes.Pin: ${bp}`);
        continue;
      }
      const ref = key.split('.')[0];
      if (looksLikeLibIdAsRefDes(ref)) {
        issues.push(
          `模块 ${m.id} boundaryPin ${bp} 把型号/libDevId「${ref}」当成了 RefDes` +
          ` — 请改用位号如 U1/D1/R1（型号写在 prompt，勿写入 boundaryPins/joints）`);
        continue;
      }
      // 弱校验：prompt 中应出现 RefDes（避免完全无关的边界）
      if (ref.length >= 1 && m.prompt.toUpperCase().indexOf(ref) < 0) {
        issues.push(`模块 ${m.id} 的 boundaryPin ${bp} 中 RefDes=${ref} 未在 prompt 中出现`);
      }
    }
    if (library) {
      const ood = findOutOfLibraryMentions(m.prompt, library);
      if (ood.length > 0) {
        issues.push(`模块 ${m.id} prompt 含库外型号 [${ood.join(',')}] — 必须改用可用 libDevId`);
      }
    }
    const pinIssues = detectInvalidPins(m, library);
    for (let hi = 0; hi < pinIssues.length; hi++) {
      issues.push(pinIssues[hi]);
    }
  }

  if (library) {
    const oodOverview = findOutOfLibraryMentions(plan.systemOverview, library);
    if (oodOverview.length > 0) {
      issues.push(`systemOverview 含库外型号 [${oodOverview.join(',')}] — 改写为库内方案描述`);
    }
  }

  if (userPrompt && userPrompt.trim().length > 0 && library) {
    const creep = detectUnsolicitedMajorDevices(userPrompt, plan, library);
    for (let ci = 0; ci < creep.length; ci++) {
      issues.push(creep[ci]);
    }
  }

  if (plan.joints.length === 0) {
    issues.push('joints 为空 — 必须给出模块间/电源 pin↔pin');
  }

  let powerJoints = 0;
  for (const j of plan.joints) {
    const a = parseModularEndpoint(j.from);
    const b = parseModularEndpoint(j.to);
    if (!a || !b) {
      issues.push(`joint 无法解析: ${j.from} ↔ ${j.to}`);
      continue;
    }
    if (a.kind === 'power' || b.kind === 'power') {
      powerJoints++;
    }
    for (const ep of [a, b]) {
      if (ep.kind !== 'module') {
        continue;
      }
      if (!idSet.has(ep.moduleId)) {
        issues.push(`joint 引用未知模块 ${ep.moduleId}: ${ep.raw}`);
        continue;
      }
      if (looksLikeLibIdAsRefDes(ep.refDes)) {
        issues.push(
          `joint ${ep.raw} 把型号/libDevId「${ep.refDes}」当成了 RefDes` +
          ` — 请改用位号如 U1/D1/R1`);
      }
      const mod = plan.modules.find(x => x.id === ep.moduleId);
      if (!mod) {
        continue;
      }
      if (library) {
        const libId = inferLibIdFromRefDes(ep.refDes, mod.prompt, library);
        if (libId.length > 0 && !pinMatchesLibrary(library, libId, ep.pin)) {
          const ok = libraryPinIds(library, libId).slice(0, 8).join('/');
          issues.push(
            `joint ${ep.raw} 脚「${ep.pin}」不属于 ${libId}` +
            (ok.length > 0 ? `（可用: ${ok}）` : ''));
        }
      }
      if (!boundaryContains(mod, ep.refDes, ep.pin)) {
        issues.push(`joint ${ep.raw} 不在模块 ${ep.moduleId} 的 boundaryPins 中（须精确 RefDes.Pin）`);
      } else {
        jointedBoundaries.add(`${ep.moduleId}|${ep.refDes}.${ep.pin}`.toUpperCase());
      }
    }
  }

  // 每个 boundaryPin 应至少出现在一条 joint（含 POWER）
  for (const m of plan.modules) {
    for (const bp of m.boundaryPins) {
      const key = normalizeBoundaryKey(bp);
      const tag = `${m.id}|${key}`.toUpperCase();
      if (!jointedBoundaries.has(tag)) {
        issues.push(`模块 ${m.id} 的 boundaryPin ${bp} 未出现在任何 joint 中`);
      }
    }
  }

  if (powerJoints === 0 && !overviewAllowsNoPower(plan.systemOverview)) {
    issues.push('缺少 POWER.VCC / POWER.GND 相关 joints（无源/教学电路请在 overview 标明）');
  }
  return issues;
}

function offsetTopo(topo: SchTopology, dx: number, dy: number): void {
  for (const d of topo.deviceList) {
    d.x += dx;
    d.y += dy;
  }
  for (const w of topo.wireList) {
    for (const p of w.points) {
      p.x += dx;
      p.y += dy;
    }
  }
  for (const lb of topo.netLabelList) {
    lb.x += dx;
    lb.y += dy;
  }
}

function prefixRefNames(topo: SchTopology, prefix: string): void {
  for (const d of topo.deviceList) {
    if (d.refName.indexOf(prefix) !== 0) {
      d.refName = `${prefix}${d.refName}`;
    }
  }
}

function remapUuids(topo: SchTopology, tag: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of topo.deviceList) {
    const neu = IdUtil.generate(`mod_${tag}`);
    map.set(d.instUuid, neu);
    d.instUuid = neu;
  }
  const netMap = new Map<string, string>();
  for (const n of topo.netList) {
    const oldNet = n.netUuid;
    const neuNet = IdUtil.generate(`net_${tag}`);
    netMap.set(oldNet, neuNet);
    n.netUuid = neuNet;
    for (const p of n.nodeList) {
      const mapped = map.get(p.devUuid);
      if (mapped) {
        p.devUuid = mapped;
      }
    }
  }
  for (const w of topo.wireList) {
    const mappedNet = netMap.get(w.netUuid);
    if (mappedNet) {
      w.netUuid = mappedNet;
    }
  }
  for (const lb of topo.netLabelList) {
    const mappedNet = netMap.get(lb.netUuid);
    if (mappedNet) {
      lb.netUuid = mappedNet;
    }
  }
  return map;
}

/** 严格按 M{id}_{Ref} / _{Ref} / 精确 Ref；再按模块内 libDevId（含 555 别名）回退 */
function findDevice(topo: SchTopology, moduleId: string, refDes: string): DeviceInst | null {
  const pref = `${moduleId}_`;
  const want = (refDes ?? '').toUpperCase();
  if (want.length === 0) {
    return null;
  }
  const exactPref = `${pref}${want}`.toUpperCase();
  for (const d of topo.deviceList) {
    if ((d.refName ?? '').toUpperCase() === exactPref) {
      return d;
    }
  }
  for (const d of topo.deviceList) {
    if ((d.refName ?? '').toUpperCase() === want) {
      return d;
    }
  }
  for (const d of topo.deviceList) {
    const rn = (d.refName ?? '').toUpperCase();
    if (rn.endsWith(`_${want}`)) {
      return d;
    }
  }
  // 回退：plan 误用 libDevId 当 RefDes（M1.LM555 → 模块内 lib=LM555）
  const wantLib = normalizeLibAlias(want);
  const prefUpper = pref.toUpperCase();
  const byLibInMod: DeviceInst[] = [];
  for (const d of topo.deviceList) {
    if (d.libDevId === 'VCC' || d.libDevId === 'GND') {
      continue;
    }
    if (normalizeLibAlias(d.libDevId) !== wantLib) {
      continue;
    }
    if ((d.refName ?? '').toUpperCase().indexOf(prefUpper) === 0) {
      byLibInMod.push(d);
    }
  }
  if (byLibInMod.length >= 1) {
    return byLibInMod[0];
  }
  // 禁止跨模块 libDevId 唯一性回退：多模块同型号会误绑他模块器件 → jointFail/错脚
  return null;
}

/** 合并同名电源轨网（VCC/GND/VDD/VSS），消除模块并行后的重复网络标号 */
function unifyPowerRailNets(topo: SchTopology): number {
  const railKey = (name: string): string => {
    const u = (name ?? '').toUpperCase();
    if (u === 'VDD' || u === 'VCC') {
      return 'VCC';
    }
    if (u === 'VSS' || u === 'GND' || u === '0') {
      return 'GND';
    }
    return '';
  };
  const keepByRail = new Map<string, NetInfo>();
  const drop = new Map<string, string>();
  let merged = 0;
  for (let i = 0; i < topo.netList.length; i++) {
    const n = topo.netList[i];
    const key = railKey(n.netName);
    if (key.length === 0) {
      continue;
    }
    const keep = keepByRail.get(key);
    if (!keep) {
      n.netName = key;
      n.displayName = key;
      n.isPower = true;
      keepByRail.set(key, n);
      continue;
    }
    for (let j = 0; j < n.nodeList.length; j++) {
      const node = n.nodeList[j];
      const dup = keep.nodeList.some(
        p => p.devUuid === node.devUuid && p.pinId === node.pinId);
      if (!dup) {
        keep.nodeList.push(node);
      }
    }
    drop.set(n.netUuid, keep.netUuid);
    merged++;
  }
  if (drop.size === 0) {
    return 0;
  }
  topo.netList = topo.netList.filter(n => !drop.has(n.netUuid));
  for (let i = 0; i < topo.wireList.length; i++) {
    const w = topo.wireList[i];
    const neu = drop.get(w.netUuid);
    if (neu) {
      w.netUuid = neu;
    }
  }
  for (let i = 0; i < topo.netLabelList.length; i++) {
    const lb = topo.netLabelList[i];
    const neu = drop.get(lb.netUuid);
    if (neu) {
      lb.netUuid = neu;
    }
    const t = (lb.text ?? '').toUpperCase();
    if (t === 'VDD') {
      lb.text = 'VCC';
    } else if (t === 'VSS') {
      lb.text = 'GND';
    }
  }
  Logger.info(INSTR_TRACE_TAG,
    `[AI_PIPE] modular_merge unifyPowerRails merged=${merged}` +
    ` vcc=${keepByRail.has('VCC')} gnd=${keepByRail.has('GND')}`);
  return merged;
}

/**
 * 模块并行流式预览：按与 merge 相同的列间距/前缀拼合已完成的子模块拓扑（不含 joints）。
 * 用于并行生图过程中逐帧把各模块摆到画布上。
 */
export function buildModularStreamPreview(
  moduleTopos: Array<SchTopology | null | undefined>,
  plan: ModularPlan,
  colPitch: number = 400
): SchTopology {
  const preview = emptySchTopology();
  preview.schName = 'AI Modular Preview';
  preview.bgColor = '#FFFFFF';
  if (!plan || !plan.modules) {
    return preview;
  }
  for (let i = 0; i < plan.modules.length; i++) {
    const mod = plan.modules[i];
    const src = i < moduleTopos.length ? moduleTopos[i] : null;
    if (!mod || !src || !src.deviceList || src.deviceList.length === 0) {
      continue;
    }
    const topo = mapAwareParse<SchTopology>(mapAwareStringify(src));
    offsetTopo(topo, i * colPitch, 0);
    prefixRefNames(topo, `${mod.id}_`);
    remapUuids(topo, `pv_${mod.id}`);
    for (let di = 0; di < topo.deviceList.length; di++) {
      preview.deviceList.push(topo.deviceList[di]);
    }
    for (let wi = 0; wi < topo.wireList.length; wi++) {
      preview.wireList.push(topo.wireList[wi]);
    }
    for (let ni = 0; ni < topo.netList.length; ni++) {
      preview.netList.push(topo.netList[ni]);
    }
    for (let li = 0; li < topo.netLabelList.length; li++) {
      preview.netLabelList.push(topo.netLabelList[li]);
    }
  }
  return preview;
}

/**
 * 合并并行模块拓扑，并按 joints 做 pin-to-pin / POWER 连接。
 * pinLookup: (libDevId, pinHint) → pinId；未匹配须返回空串（禁止默认真脚）
 */
export function mergeModularTopologies(
  moduleTopos: SchTopology[],
  plan: ModularPlan,
  pinLookup: (libId: string, hint: string) => string
): ModularMergeResult {
  const merged = emptySchTopology();
  merged.schName = 'AI Modular';
  merged.bgColor = '#FFFFFF';
  const failReasons: string[] = [];

  const colPitch = 400;
  for (let i = 0; i < moduleTopos.length; i++) {
    const mod = plan.modules[i];
    const topo = moduleTopos[i];
    if (!topo || !mod) {
      continue;
    }
    offsetTopo(topo, i * colPitch, 0);
    prefixRefNames(topo, `${mod.id}_`);
    remapUuids(topo, mod.id);
    for (const d of topo.deviceList) {
      merged.deviceList.push(d);
    }
    for (const w of topo.wireList) {
      merged.wireList.push(w);
    }
    for (const n of topo.netList) {
      merged.netList.push(n);
    }
    for (const lb of topo.netLabelList) {
      merged.netLabelList.push(lb);
    }
  }

  // 统一 POWER：保留/创建 VCC/GND（有负压需求时保留 VEE）
  let vcc = merged.deviceList.find(d => d.libDevId === 'VCC');
  let gnd = merged.deviceList.find(d => d.libDevId === 'GND');
  let vee = merged.deviceList.find(d => d.libDevId === 'VEE');
  if (!vcc) {
    vcc = {
      instUuid: IdUtil.generate('pwr'),
      libDevId: 'VCC',
      refName: 'VCC',
      x: 60, y: 80, rotate: 0,
      mirrorH: false, mirrorV: false,
      params: new Map(),
      pinVoltage: new Map(),
      hidden: false, subCircuitRef: '', ercErrorMsg: ''
    };
    merged.deviceList.push(vcc);
  } else {
    vcc.refName = 'VCC';
    vcc.x = 60;
    vcc.y = 80;
  }
  if (!gnd) {
    gnd = {
      instUuid: IdUtil.generate('pwr'),
      libDevId: 'GND',
      refName: 'GND',
      x: 60, y: 640, rotate: 0,
      mirrorH: false, mirrorV: false,
      params: new Map(),
      pinVoltage: new Map(),
      hidden: false, subCircuitRef: '', ercErrorMsg: ''
    };
    merged.deviceList.push(gnd);
  } else {
    gnd.refName = 'GND';
    gnd.x = 60;
    gnd.y = 640;
  }
  if (vee) {
    vee.refName = 'VEE';
    vee.x = 60;
    vee.y = 560;
  }

  const keepVcc = vcc.instUuid;
  const keepGnd = gnd.instUuid;
  const keepVee = vee ? vee.instUuid : '';
  const dropPower = new Set<string>();
  for (const d of merged.deviceList) {
    if (d.libDevId === 'VCC' && d.instUuid !== keepVcc) {
      dropPower.add(d.instUuid);
    }
    if (d.libDevId === 'GND' && d.instUuid !== keepGnd) {
      dropPower.add(d.instUuid);
    }
    if (d.libDevId === 'VEE' && keepVee.length > 0 && d.instUuid !== keepVee) {
      dropPower.add(d.instUuid);
    }
  }
  if (dropPower.size > 0) {
    for (const n of merged.netList) {
      for (const p of n.nodeList) {
        if (dropPower.has(p.devUuid)) {
          const src = merged.deviceList.find(d => d.instUuid === p.devUuid);
          if (src && src.libDevId === 'GND') {
            p.devUuid = keepGnd;
          } else if (src && src.libDevId === 'VEE' && keepVee.length > 0) {
            p.devUuid = keepVee;
          } else {
            p.devUuid = keepVcc;
          }
        }
      }
    }
  }
  merged.deviceList = merged.deviceList.filter(d => !dropPower.has(d.instUuid));

  // 清理孤儿：nodeList 引用已删器件的 net / 无对应 net 的 wire
  const liveDev = new Set<string>();
  for (const d of merged.deviceList) {
    liveDev.add(d.instUuid);
  }
  for (const n of merged.netList) {
    n.nodeList = n.nodeList.filter(p => liveDev.has(p.devUuid));
  }
  const liveNets = new Set<string>();
  for (const n of merged.netList) {
    if (n.nodeList.length > 0) {
      liveNets.add(n.netUuid);
    }
  }
  merged.netList = merged.netList.filter(n => liveNets.has(n.netUuid));
  merged.wireList = merged.wireList.filter(w => liveNets.has(w.netUuid));
  merged.netLabelList = merged.netLabelList.filter(lb => liveNets.has(lb.netUuid));

  // 各子模块各自带 VCC/GND 网 → 合并为唯一电源轨，避免 ERC 重复网络标号
  unifyPowerRailNets(merged);

  const doc = TopologyAdapter.fromTopology(merged);
  let jointOk = 0;
  let jointFail = 0;
  for (let ji = 0; ji < plan.joints.length; ji++) {
    const j = plan.joints[ji];
    const a = parseModularEndpoint(j.from);
    const b = parseModularEndpoint(j.to);
    if (!a || !b) {
      jointFail++;
      failReasons.push(`无法解析 joint: ${j.from} ↔ ${j.to}`);
      continue;
    }
    const pins: PinSpec[] = [];
    for (const ep of [a, b]) {
      if (ep.kind === 'power') {
        let railDev: DeviceInst | null = vcc;
        if (ep.pin === 'GND') {
          railDev = gnd;
        } else if (ep.pin === 'VEE') {
          railDev = vee ?? null;
        }
        if (!railDev) {
          failReasons.push(`POWER 符号缺失: ${ep.raw}`);
          continue;
        }
        const comp = doc.components.find(c => c.id === railDev!.instUuid);
        if (comp) {
          pins.push({ comp, pinId: '1', pinName: ep.pin });
        } else {
          failReasons.push(`POWER 符号缺失: ${ep.raw}`);
        }
      } else {
        const dev = findDevice(merged, ep.moduleId, ep.refDes);
        if (!dev) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] modular_merge miss device ${ep.moduleId}.${ep.refDes}`);
          failReasons.push(`找不到器件 ${ep.moduleId}.${ep.refDes}`);
          continue;
        }
        const pinId = pinLookup(dev.libDevId, ep.pin);
        if (!pinId || pinId.length === 0) {
          failReasons.push(`引脚未解析 ${ep.raw} lib=${dev.libDevId} hint=${ep.pin}`);
          continue;
        }
        const comp = doc.components.find(c => c.id === dev.instUuid);
        if (comp) {
          pins.push({ comp, pinId, pinName: ep.pin });
        } else {
          failReasons.push(`文档缺组件 ${dev.refName}`);
        }
      }
    }
    if (pins.length < 2) {
      jointFail++;
      continue;
    }
    const isGnd = a.pin === 'GND' || b.pin === 'GND' ||
      a.refDes === 'GND' || b.refDes === 'GND';
    const isVcc = a.pin === 'VCC' || b.pin === 'VCC' ||
      a.refDes === 'VCC' || b.refDes === 'VCC';
    const isVee = a.pin === 'VEE' || b.pin === 'VEE' ||
      a.refDes === 'VEE' || b.refDes === 'VEE';
    const nType = isGnd ? NetType.GROUND :
      ((isVcc || isVee) ? NetType.POWER : NetType.SIGNAL);
    // 跨模块 / POWER 一律网络标号并网，避免列间距上的长线
    let netName: string;
    if (isGnd) {
      netName = 'GND';
    } else if (isVcc) {
      netName = 'VCC';
    } else {
      const ra = `${a.refDes}_${a.pin}`.replace(/[^A-Za-z0-9_]/g, '_');
      const rb = `${b.refDes}_${b.pin}`.replace(/[^A-Za-z0-9_]/g, '_');
      netName = `MJ_${ji + 1}_${ra}_${rb}`.substring(0, 48);
    }
    TemplateSchematicKit.joinByLabel(doc, netName, nType, pins);
    jointOk++;
  }

  let outTopo = TopologyAdapter.toTopology(doc);
  // joinByLabel 可能再引入同名电源网：落图前再统一一次
  unifyPowerRailNets(outTopo);
  Logger.info(INSTR_TRACE_TAG,
    `[AI_PIPE] modular_merge joints(label) ok=${jointOk} fail=${jointFail}` +
    ` devices=${doc.components.length} labels=${doc.netLabels.length}`);
  return {
    topology: outTopo,
    jointOk,
    jointFail,
    jointFailReasons: failReasons
  };
}

/** 模块子 prompt：注入边界，禁止跨模块连线，电源交给 POWER。
 * 不注入完整 systemOverview，避免子模块 Intent 被整电路关键词（灯/交替）污染。 */
export function buildModuleSubPrompt(mod: ModularModuleSpec, _overview?: string,
  library?: IComponentLibrary): string {
  const bps = mod.boundaryPins.join(', ');
  let pinSheet = '';
  if (library) {
    const lines: string[] = [];
    for (let i = 0; i < mod.boundaryPins.length && lines.length < 16; i++) {
      const bp = mod.boundaryPins[i];
      const key = normalizeBoundaryKey(bp);
      const dot = key.indexOf('.');
      if (dot <= 0) {
        continue;
      }
      const ref = key.substring(0, dot);
      const pinHint = key.substring(dot + 1);
      const libId = inferLibIdFromRefDes(ref, mod.prompt, library);
      if (libId.length === 0) {
        lines.push(`- ${bp} (lib未知)`);
        continue;
      }
      const pins = libraryPinIds(library, libId);
      lines.push(`- ${ref} lib=${libId} 边界脚=${pinHint} 库脚=[${pins.slice(0, 10).join(',')}]`);
    }
    if (lines.length > 0) {
      pinSheet = `\n【边界脚库对照 — 建网必须用下列 pinId】:\n${lines.join('\n')}`;
    }
  }
  return `${mod.prompt}

【模块并行约束 — 必须遵守】
- 本模块 ID=${mod.id} 标题=${mod.title}
- 本模块对外边界脚(boundaryPins): ${bps}
- 只放置并连接本模块内部器件与内部连线；禁止绘制跨模块长线
- 不要依赖其它模块的器件；电源 VCC/GND 符号可保留供内部用，跨模块电源由合并阶段 POWER joints 用网络标号统一
- 边界脚必须存在且可被引用（与 boundaryPins 一致）
- RefDes 须与 boundaryPins 中的前缀一致（合并时会加 ${mod.id}_ 前缀）；禁止用 libDevId/型号当位号
- explicitModel 必须使用器件库 libDevId；禁止库外型号${pinSheet}`;
}

/**
 * 将子模块拓扑位号对齐到 boundaryPins（如计划写 R3 但摆放成 R1）。
 * 合并阶段 joints 按 boundaryPins 查找，不对齐会导致 jointFail 与空连线。
 */
export function alignTopoRefsToBoundaryPins(topo: SchTopology, boundaryPins: string[]): number {
  if (!topo || !boundaryPins || boundaryPins.length === 0) {
    return 0;
  }
  const desired: string[] = [];
  for (let i = 0; i < boundaryPins.length; i++) {
    const key = normalizeBoundaryKey(boundaryPins[i]);
    const dot = key.indexOf('.');
    if (dot <= 0) {
      continue;
    }
    const ref = key.substring(0, dot);
    if (ref === 'VCC' || ref === 'GND' || ref === 'POWER') {
      continue;
    }
    if (desired.indexOf(ref) < 0) {
      desired.push(ref);
    }
  }
  if (desired.length === 0) {
    return 0;
  }
  const desiredSet = new Set<string>();
  for (let i = 0; i < desired.length; i++) {
    desiredSet.add(desired[i]);
  }
  let renamed = 0;
  for (let di = 0; di < desired.length; di++) {
    const want = desired[di];
    if (topo.deviceList.some(d => d.refName === want)) {
      continue;
    }
    let donor: DeviceInst | null = null;
    // 边界误写 libDevId：按库型号对齐到该器件，并改成边界中的「伪位号」以便 joints 精确匹配
    if (looksLikeLibIdAsRefDes(want)) {
      const wantLib = normalizeLibAlias(want);
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if (desiredSet.has(d.refName)) {
          continue;
        }
        if (d.libDevId === 'VCC' || d.libDevId === 'GND') {
          continue;
        }
        if (normalizeLibAlias(d.libDevId) === wantLib) {
          donor = d;
          break;
        }
      }
    } else {
      const letter = want.replace(/\d+$/, '');
      if (letter.length === 0) {
        continue;
      }
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if (desiredSet.has(d.refName)) {
          continue;
        }
        if (d.libDevId === 'VCC' || d.libDevId === 'GND') {
          continue;
        }
        if (!refCompatibleWithLib(want, d.libDevId, d.refName)) {
          continue;
        }
        // 同字母前缀优先（R3←R1），否则按 lib 类型兜底
        const curLetter = (d.refName ?? '').replace(/\d+$/, '');
        if (curLetter === letter || donor === null) {
          donor = d;
          if (curLetter === letter) {
            break;
          }
        }
      }
    }
    if (donor) {
      const old = donor.refName;
      donor.refName = want;
      renamed++;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] boundary_ref_align ${old}→${want} lib=${donor.libDevId}`);
    }
  }
  return renamed;
}

function refCompatibleWithLib(wantRef: string, libDevId: string, curRef: string): boolean {
  const letter = wantRef.replace(/\d+$/, '').toUpperCase();
  const id = (libDevId ?? '').toUpperCase();
  const cur = (curRef ?? '').toUpperCase();
  if (letter === 'R') {
    return id.startsWith('R_') || cur.startsWith('R');
  }
  if (letter === 'C') {
    return id.startsWith('C_') || cur.startsWith('C');
  }
  if (letter === 'D') {
    return id.startsWith('LED_') || id.indexOf('DIODE') >= 0 || cur.startsWith('D');
  }
  if (letter === 'K') {
    return id.indexOf('RELAY') >= 0 || cur.startsWith('K');
  }
  if (letter === 'SW') {
    return id.startsWith('SW_') || cur.startsWith('SW');
  }
  if (letter === 'U' || letter === 'IC') {
    return id.indexOf('555') >= 0 || id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 ||
      id.indexOf('OPAMP') >= 0 || cur.startsWith('U');
  }
  // 未知前缀：允许同字母重命名
  return cur.replace(/\d+$/, '') === letter;
}
