import { copperLayersFromStack, padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbGeoFailDetail, PcbGeometryResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class PcbDocSummarizer {
    static boardOutline(doc: PcbDocument): string {
        const pts = doc.boardOutline?.points ?? [];
        return pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
    }
    static copperLayers(doc: PcbDocument): string {
        return copperLayersFromStack(doc.layerStack).join(',');
    }
    static footprintList(doc: PcbDocument): string {
        const lines: string[] = [];
        for (const fp of doc.footprints) {
            lines.push(`${fp.id}|${fp.refDes}|${fp.defId}|pos=${Math.round(fp.position.x)},${Math.round(fp.position.y)}|rot=${fp.rotation}|locked=${fp.locked}`);
        }
        return lines.join('\n');
    }
    static netList(doc: PcbDocument): string {
        const lines: string[] = [];
        for (const n of doc.nets) {
            let pads = 0;
            let mounts = 0;
            for (const fp of doc.footprints) {
                const isMount = fp.defId === 'FP_MOUNT' ||
                    (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H');
                for (const pad of fp.pads) {
                    if ((pad.netId ?? '') === n.id) {
                        pads++;
                        if (isMount) {
                            mounts++;
                        }
                    }
                }
            }
            const mountNote = mounts > 0 ? `|mountPads=${mounts}(几何不强制连通)` : '';
            lines.push(`${n.id}|${n.name}|pads=${pads}${mountNote}`);
        }
        return lines.join('\n');
    }
    static padSummary(doc: PcbDocument): string {
        const lines: string[] = [];
        let count = 0;
        for (const fp of doc.footprints) {
            for (const pad of fp.pads) {
                if (!pad.netId) {
                    continue;
                }
                const w = padWorldPosition(fp, pad);
                lines.push(`${fp.refDes}.${pad.number}->${pad.netName}@${Math.round(w.x)},${Math.round(w.y)}`);
                count++;
                if (count >= 80) {
                    lines.push('...(truncated)');
                    return lines.join('; ');
                }
            }
        }
        return lines.join('; ');
    }
    /**
     * 焊盘详表：层/类型/尺寸/世界坐标 — placement / net_plan / qa 共用
     */
    static padDetailSummary(doc: PcbDocument, maxPads: number = 60): string {
        const lines: string[] = [];
        let count = 0;
        for (const fp of doc.footprints) {
            const isMount = fp.defId === 'FP_MOUNT' ||
                (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H');
            for (const pad of fp.pads) {
                if (!pad.netId) {
                    continue;
                }
                const w = padWorldPosition(fp, pad);
                const ly = (pad.layers ?? []).map(l => l as string).join('+') || 'all';
                const typ = pad.type ?? '?';
                lines.push(`${fp.refDes}.${pad.number}|net=${pad.netName}|xy=${Math.round(w.x)},${Math.round(w.y)}` +
                    `|sz=${Math.round(pad.size.x)}x${Math.round(pad.size.y)}|type=${typ}|layers=${ly}` +
                    `${isMount ? '|MOUNT' : ''}`);
                count++;
                if (count >= maxPads) {
                    lines.push('...(truncated)');
                    return lines.join('\n');
                }
            }
        }
        return lines.join('\n');
    }
    /**
     * 焊盘禁区（区域级视图）：每器件焊盘包围盒 — LLM 逐焊盘点推理不可靠，
     * bbox 让模型把 DIP/排阻等看成「一块禁区」，沿边界外侧绕行
     */
    static padBlockSummary(doc: PcbDocument): string {
        const lines: string[] = [];
        for (const fp of doc.footprints) {
            const isMount = fp.defId === 'FP_MOUNT' ||
                (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H');
            if (isMount) {
                continue;
            }
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            let hasPad = false;
            for (const pad of fp.pads) {
                const w = padWorldPosition(fp, pad);
                const hw = Math.max(pad.size.x, pad.size.y) / 2;
                if (w.x - hw < minX) {
                    minX = w.x - hw;
                }
                if (w.x + hw > maxX) {
                    maxX = w.x + hw;
                }
                if (w.y - hw < minY) {
                    minY = w.y - hw;
                }
                if (w.y + hw > maxY) {
                    maxY = w.y + hw;
                }
                hasPad = true;
            }
            if (!hasPad) {
                continue;
            }
            lines.push(`${fp.refDes}|${fp.defId}|bbox=${Math.round(minX)},${Math.round(minY)}` +
                `→${Math.round(maxX)},${Math.round(maxY)}`);
        }
        return lines.join('\n');
    }
    /** 当前铜使用：每层 track 数 + 网名 */
    static copperUsageSummary(doc: PcbDocument): string {
        const byLayer: Map<string, number> = new Map();
        const netsOnLayer: Map<string, Set<string>> = new Map();
        for (const t of doc.tracks) {
            const lid = t.layer as string;
            byLayer.set(lid, (byLayer.get(lid) ?? 0) + 1);
            let set = netsOnLayer.get(lid);
            if (!set) {
                set = new Set();
                netsOnLayer.set(lid, set);
            }
            if (t.netName) {
                set.add(t.netName);
            }
        }
        const copper = copperLayersFromStack(doc.layerStack);
        const parts: string[] = [];
        for (let i = 0; i < copper.length; i++) {
            const lid = copper[i] as string;
            const n = byLayer.get(lid) ?? 0;
            const nets = netsOnLayer.get(lid);
            const netStr = nets && nets.size > 0 ? Array.from(nets).slice(0, 6).join('+') : '-';
            parts.push(`${lid}:trk=${n} nets=${netStr}`);
        }
        parts.push(`vias=${doc.vias.length}`);
        return parts.join('; ');
    }
    static geoFailReport(geo: PcbGeometryResult | null | undefined): string {
        if (!geo) {
            return '(no geometry)';
        }
        if (geo.ok) {
            return 'ok';
        }
        const parts: string[] = [geo.reason];
        const details = geo.failDetails ?? [];
        for (let i = 0; i < details.length && i < 12; i++) {
            const d = details[i];
            parts.push(`${d.netName} ${d.cause}` +
                ` (${Math.round(d.from.x)},${Math.round(d.from.y)})→` +
                `(${Math.round(d.to.x)},${Math.round(d.to.y)})` +
                (d.blocker ? ` <<${d.blocker}>>` : ''));
        }
        if (details.length > 12) {
            parts.push(`...+${details.length - 12} more`);
        }
        return parts.join(' | ');
    }
    /** 板态快照：供 QA / route_policy 注入 */
    static boardDiagSnapshot(doc: PcbDocument, geo?: PcbGeometryResult | null): string {
        const lines: string[] = [];
        lines.push(`board=${PcbDocSummarizer.boardSummary(doc)}`);
        lines.push(`outline=${PcbDocSummarizer.boardOutline(doc)}`);
        lines.push(`copper=${PcbDocSummarizer.copperLayers(doc)}`);
        lines.push(`usage=${PcbDocSummarizer.copperUsageSummary(doc)}`);
        lines.push(`geo=${PcbDocSummarizer.geoFailReport(geo)}`);
        lines.push('pads:');
        lines.push(PcbDocSummarizer.padDetailSummary(doc, 24));
        return lines.join('\n');
    }
    static boardSummary(doc: PcbDocument): string {
        return `name=${doc.name} fp=${doc.footprints.length} nets=${doc.nets.length} cu=${doc.layerStack.copperCount}`;
    }
    static formatFailDetails(details: PcbGeoFailDetail[] | undefined): string {
        if (!details || details.length === 0) {
            return '';
        }
        return details.slice(0, 16).map(d => `${d.netId}|${d.netName}|${d.cause}|` +
            `${Math.round(d.from.x)},${Math.round(d.from.y)}→${Math.round(d.to.x)},${Math.round(d.to.y)}|` +
            `${d.blocker ?? ''}`).join('\n');
    }
}
