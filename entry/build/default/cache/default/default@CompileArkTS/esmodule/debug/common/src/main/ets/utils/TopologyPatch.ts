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
    static applyToDoc(doc: SchematicDocument, patch: TopologyPatch): void {
        switch (patch.op) {
            case TopologyPatchOp.UPSERT_DEVICE:
                if (!patch.device)
                    return;
                const comp = TopologyAdapter.toComponent(patch.device);
                const idx = doc.components.findIndex(c => c.id === comp.id);
                if (idx >= 0)
                    doc.components[idx] = comp;
                else
                    doc.components.push(comp);
                break;
            case TopologyPatchOp.REMOVE_DEVICE:
                if (!patch.deviceId)
                    return;
                doc.components = doc.components.filter(c => c.id !== patch.deviceId);
                break;
            case TopologyPatchOp.UPSERT_NET:
                if (!patch.net)
                    return;
                const net = TopologyAdapter.toNet(patch.net);
                const ni = doc.nets.findIndex(n => n.id === net.id);
                if (ni >= 0)
                    doc.nets[ni] = net;
                else
                    doc.nets.push(net);
                break;
            case TopologyPatchOp.UPSERT_WIRE:
                if (!patch.wire)
                    return;
                const wi = doc.wires.findIndex(w => w.id === patch.wire!.id);
                if (wi >= 0)
                    doc.wires[wi] = patch.wire;
                else
                    doc.wires.push(patch.wire);
                break;
            case TopologyPatchOp.REMOVE_WIRE:
                if (!patch.wireId)
                    return;
                doc.wires = doc.wires.filter(w => w.id !== patch.wireId);
                break;
            default:
                break;
        }
    }
    static patchFromComponentChange(oldDoc: SchematicDocument, newComp: ComponentInstance): TopologyPatch {
        return {
            op: TopologyPatchOp.UPSERT_DEVICE,
            device: TopologyAdapter.toDeviceInst(newComp)
        };
    }
    static syncTopologyIncremental(doc: SchematicDocument, cached: SchTopology | null): SchTopology {
        if (!cached)
            return TopologyAdapter.toTopology(doc);
        const topo = cached;
        const compCount = doc.components.length;
        // Merge device changes: preserve existing DeviceInsts, only convert new/modified
        const devMap = new Map<string, DeviceInst>();
        for (let i = 0; i < topo.deviceList.length; i++) {
            devMap.set(topo.deviceList[i].instUuid, topo.deviceList[i]);
        }
        for (let i = 0; i < compCount; i++) {
            const inst = TopologyAdapter.toDeviceInst(doc.components[i]);
            devMap.set(inst.instUuid, inst);
        }
        const devices: DeviceInst[] = [];
        devMap.forEach((d: DeviceInst) => devices.push(d));
        topo.deviceList = devices;
        // Nets and wires are lightweight — always rebuild for correctness
        const netCount = doc.nets.length;
        topo.netList = [];
        for (let i = 0; i < netCount; i++) {
            topo.netList.push(TopologyAdapter.toNetInfo(doc.nets[i]));
        }
        const wireCount = doc.wires.length;
        topo.wireList = [];
        for (let i = 0; i < wireCount; i++) {
            const w = doc.wires[i];
            topo.wireList.push(makeRouteLine(w.netId, w.points, false));
        }
        topo.schName = doc.name;
        return topo;
    }
}
