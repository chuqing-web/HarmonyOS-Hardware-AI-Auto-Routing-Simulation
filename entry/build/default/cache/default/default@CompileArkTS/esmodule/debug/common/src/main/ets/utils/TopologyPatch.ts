import type { SchematicDocument, ComponentInstance, Wire } from '../types/CommonTypes';
import type { SchTopology, DeviceInst, NetInfo } from '../types/TopologyTypes';
import { TopologyAdapter } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/TopologyAdapter";
import { makeRouteLine } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
export enum TopologyPatchOp {
    UPSERT_DEVICE = "upsert_device",
    REMOVE_DEVICE = "remove_device",
    UPSERT_NET = "upsert_net",
    UPSERT_WIRE = "upsert_wire",
    REMOVE_WIRE = "remove_wire",
    FULL_SYNC = "full_sync"
}
export interface TopologyPatch {
    op: TopologyPatchOp;
    device?: DeviceInst;
    deviceId?: string;
    net?: NetInfo;
    wire?: Wire;
    wireId?: string;
}
export class TopologyPatchApplier {
    static applyToDoc(doc: SchematicDocument, patch: TopologyPatch): boolean {
        switch (patch.op) {
            case TopologyPatchOp.UPSERT_DEVICE:
                if (!patch.device) {
                    return false;
                }
                const comp = TopologyAdapter.toComponent(patch.device);
                const idx = doc.components.findIndex(c => c.id === comp.id);
                if (idx >= 0) {
                    doc.components[idx] = comp;
                }
                else {
                    doc.components.push(comp);
                }
                return true;
            case TopologyPatchOp.REMOVE_DEVICE:
                if (!patch.deviceId) {
                    return false;
                }
                TopologyPatchApplier.cascadeRemoveDevice(doc, patch.deviceId);
                return true;
            case TopologyPatchOp.UPSERT_NET:
                if (!patch.net) {
                    return false;
                }
                const net = TopologyAdapter.toNet(patch.net);
                const ni = doc.nets.findIndex(n => n.id === net.id);
                if (ni >= 0) {
                    doc.nets[ni] = net;
                }
                else {
                    doc.nets.push(net);
                }
                return true;
            case TopologyPatchOp.UPSERT_WIRE:
                if (!patch.wire) {
                    return false;
                }
                const wi = doc.wires.findIndex(w => w.id === patch.wire!.id);
                if (wi >= 0) {
                    doc.wires[wi] = patch.wire;
                }
                else {
                    doc.wires.push(patch.wire);
                }
                return true;
            case TopologyPatchOp.REMOVE_WIRE:
                if (!patch.wireId) {
                    return false;
                }
                doc.wires = doc.wires.filter(w => w.id !== patch.wireId);
                return true;
            case TopologyPatchOp.FULL_SYNC:
                // 全量同步由调用方用 TopologyAdapter.toTopology 重建；此处拒绝静默 no-op
                return false;
            default:
                return false;
        }
    }
    /** 删除器件并清理其脚入网 / 相关导线 */
    private static cascadeRemoveDevice(doc: SchematicDocument, deviceId: string): void {
        doc.components = doc.components.filter(c => c.id !== deviceId);
        const prefix = `${deviceId}:`;
        for (let ni = 0; ni < doc.nets.length; ni++) {
            const net = doc.nets[ni];
            net.pinIds = net.pinIds.filter(pr => pr.indexOf(prefix) !== 0);
        }
        doc.wires = doc.wires.filter(w => {
            // 无 pin 绑定的导线保留；仅靠 netId 关联，脚清理后由 prune 处理
            return true;
        });
    }
    static patchFromComponentChange(_oldDoc: SchematicDocument, newComp: ComponentInstance): TopologyPatch {
        return {
            op: TopologyPatchOp.UPSERT_DEVICE,
            device: TopologyAdapter.toDeviceInst(newComp)
        };
    }
    static syncTopologyIncremental(doc: SchematicDocument, cached: SchTopology | null): SchTopology {
        if (!cached) {
            return TopologyAdapter.toTopology(doc);
        }
        const topo = cached;
        // 仅保留文档中仍存在的器件，禁止缓存残留已删器件
        const devices: DeviceInst[] = [];
        for (let i = 0; i < doc.components.length; i++) {
            devices.push(TopologyAdapter.toDeviceInst(doc.components[i]));
        }
        topo.deviceList = devices;
        topo.netList = [];
        for (let i = 0; i < doc.nets.length; i++) {
            topo.netList.push(TopologyAdapter.toNetInfo(doc.nets[i]));
        }
        topo.wireList = [];
        for (let i = 0; i < doc.wires.length; i++) {
            const w = doc.wires[i];
            topo.wireList.push(makeRouteLine(w.netId, w.points, false, w.id));
        }
        topo.schName = doc.name;
        return topo;
    }
}
