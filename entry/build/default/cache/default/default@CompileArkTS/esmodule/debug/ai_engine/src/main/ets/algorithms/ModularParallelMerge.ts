import { IdUtil, emptySchTopology, TopologyAdapter, Logger, INSTR_TRACE_TAG, NetType, mapAwareStringify, mapAwareParse } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst, NetInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
import { TemplateSchematicKit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
import type { PinSpec } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
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
/** 归一化边界脚键：RefDes.Pin（大写） */
function normalizeBoundaryKey(raw: string): string {
    const clean = stripBoundaryNote(raw).toUpperCase();
    const parts = clean.split('.');
    if (parts.length < 2) {
        return clean;
    }
    return `${parts[0]}.${parts.slice(1).join('.')}`;
}
/**
 * 是否把 libDevId/型号误当作 RefDes（如 LM555、LED_RED）。
 * 合法位号：U1/R12/RV1/LED1/SW1（≤3 字母 + ≤2 数字）。
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
    // 标准位号：1～3 字母 + 1～2 数字
    if (/^[A-Z]{1,3}\d{1,2}$/.test(r)) {
        return false;
    }
    // 型号形态：含字母与数字且长度≥4（LM555、CD4017、2N2222）
    if (r.length >= 4 && /[A-Z]/.test(r) && /\d/.test(r)) {
        return true;
    }
    return false;
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
        if (rail !== 'VCC' && rail !== 'GND' && rail !== 'VDD' && rail !== 'VSS') {
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
    }
    catch (_e) {
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
    const has555Chip = upper.indexOf('NE555') >= 0 || upper.indexOf('LM555') >= 0 ||
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
/** 边界门禁；返回问题列表（空=通过）。传入 library 时额外拒收库外型号。 */
export function critiqueModularPlan(plan: ModularPlan, library?: IComponentLibrary): string[] {
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
                issues.push(`模块 ${m.id} boundaryPin ${bp} 把型号/libDevId「${ref}」当成了 RefDes` +
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
    }
    if (library) {
        const oodOverview = findOutOfLibraryMentions(plan.systemOverview, library);
        if (oodOverview.length > 0) {
            issues.push(`systemOverview 含库外型号 [${oodOverview.join(',')}] — 改写为库内方案描述`);
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
                issues.push(`joint ${ep.raw} 把型号/libDevId「${ep.refDes}」当成了 RefDes` +
                    ` — 请改用位号如 U1/D1/R1`);
            }
            const mod = plan.modules.find(x => x.id === ep.moduleId);
            if (!mod) {
                continue;
            }
            if (!boundaryContains(mod, ep.refDes, ep.pin)) {
                issues.push(`joint ${ep.raw} 不在模块 ${ep.moduleId} 的 boundaryPins 中（须精确 RefDes.Pin）`);
            }
            else {
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
    const byLibAny: DeviceInst[] = [];
    for (const d of topo.deviceList) {
        if (d.libDevId === 'VCC' || d.libDevId === 'GND') {
            continue;
        }
        if (normalizeLibAlias(d.libDevId) !== wantLib) {
            continue;
        }
        byLibAny.push(d);
        if ((d.refName ?? '').toUpperCase().indexOf(prefUpper) === 0) {
            byLibInMod.push(d);
        }
    }
    if (byLibInMod.length >= 1) {
        return byLibInMod[0];
    }
    if (byLibAny.length === 1) {
        return byLibAny[0];
    }
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
            const dup = keep.nodeList.some(p => p.devUuid === node.devUuid && p.pinId === node.pinId);
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
        }
        else if (t === 'VSS') {
            lb.text = 'GND';
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] modular_merge unifyPowerRails merged=${merged}` +
        ` vcc=${keepByRail.has('VCC')} gnd=${keepByRail.has('GND')}`);
    return merged;
}
/**
 * 模块并行流式预览：按与 merge 相同的列间距/前缀拼合已完成的子模块拓扑（不含 joints）。
 * 用于并行生图过程中逐帧把各模块摆到画布上。
 */
export function buildModularStreamPreview(moduleTopos: Array<SchTopology | null | undefined>, plan: ModularPlan, colPitch: number = 400): SchTopology {
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
export function mergeModularTopologies(moduleTopos: SchTopology[], plan: ModularPlan, pinLookup: (libId: string, hint: string) => string): ModularMergeResult {
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
    // 统一 POWER：保留/创建一对 VCC/GND
    let vcc = merged.deviceList.find(d => d.libDevId === 'VCC');
    let gnd = merged.deviceList.find(d => d.libDevId === 'GND');
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
    }
    else {
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
    }
    else {
        gnd.refName = 'GND';
        gnd.x = 60;
        gnd.y = 640;
    }
    const keepVcc = vcc.instUuid;
    const keepGnd = gnd.instUuid;
    const dropPower = new Set<string>();
    for (const d of merged.deviceList) {
        if (d.libDevId === 'VCC' && d.instUuid !== keepVcc) {
            dropPower.add(d.instUuid);
        }
        if (d.libDevId === 'GND' && d.instUuid !== keepGnd) {
            dropPower.add(d.instUuid);
        }
    }
    if (dropPower.size > 0) {
        for (const n of merged.netList) {
            for (const p of n.nodeList) {
                if (dropPower.has(p.devUuid)) {
                    const src = merged.deviceList.find(d => d.instUuid === p.devUuid);
                    p.devUuid = (src && src.libDevId === 'GND') ? keepGnd : keepVcc;
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
                const rail = ep.pin === 'GND' ? gnd : vcc;
                const comp = doc.components.find(c => c.id === rail!.instUuid);
                if (comp) {
                    pins.push({ comp, pinId: '1', pinName: ep.pin });
                }
                else {
                    failReasons.push(`POWER 符号缺失: ${ep.raw}`);
                }
            }
            else {
                const dev = findDevice(merged, ep.moduleId, ep.refDes);
                if (!dev) {
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] modular_merge miss device ${ep.moduleId}.${ep.refDes}`);
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
                }
                else {
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
        const nType = isGnd ? NetType.GROUND : (isVcc ? NetType.POWER : NetType.SIGNAL);
        // 跨模块 / POWER 一律网络标号并网，避免列间距上的长线
        let netName: string;
        if (isGnd) {
            netName = 'GND';
        }
        else if (isVcc) {
            netName = 'VCC';
        }
        else {
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
    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] modular_merge joints(label) ok=${jointOk} fail=${jointFail}` +
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
export function buildModuleSubPrompt(mod: ModularModuleSpec, _overview?: string): string {
    const bps = mod.boundaryPins.join(', ');
    return `${mod.prompt}

【模块并行约束 — 必须遵守】
- 本模块 ID=${mod.id} 标题=${mod.title}
- 本模块对外边界脚(boundaryPins): ${bps}
- 只放置并连接本模块内部器件与内部连线；禁止绘制跨模块长线
- 不要依赖其它模块的器件；电源 VCC/GND 符号可保留供内部用，跨模块电源由合并阶段 POWER joints 用网络标号统一
- 边界脚必须存在且可被引用（与 boundaryPins 一致）
- RefDes 须与 boundaryPins 中的前缀一致（合并时会加 ${mod.id}_ 前缀）；禁止用 libDevId/型号当位号
- explicitModel 必须使用器件库 libDevId；禁止库外型号`;
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
        }
        else {
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
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] boundary_ref_align ${old}→${want} lib=${donor.libDevId}`);
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
