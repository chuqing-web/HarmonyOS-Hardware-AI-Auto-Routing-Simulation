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
    static applyToDoc(m52: SchematicDocument, n52: TopologyPatch): void {
        switch (n52.op) {
            case TopologyPatchOp.UPSERT_DEVICE:
                if (!n52.device)
                    return;
                const o52 = TopologyAdapter.toComponent(n52.device);
                const p52 = m52.components.findIndex(x52 => x52.id === o52.id);
                if (p52 >= 0)
                    m52.components[p52] = o52;
                else
                    m52.components.push(o52);
                break;
            case TopologyPatchOp.REMOVE_DEVICE:
                if (!n52.deviceId)
                    return;
                m52.components = m52.components.filter(w52 => w52.id !== n52.deviceId);
                break;
            case TopologyPatchOp.UPSERT_NET:
                if (!n52.net)
                    return;
                const q52 = TopologyAdapter.toNet(n52.net);
                const r52 = m52.nets.findIndex(v52 => v52.id === q52.id);
                if (r52 >= 0)
                    m52.nets[r52] = q52;
                else
                    m52.nets.push(q52);
                break;
            case TopologyPatchOp.UPSERT_WIRE:
                if (!n52.wire)
                    return;
                const s52 = m52.wires.findIndex(u52 => u52.id === n52.wire!.id);
                if (s52 >= 0)
                    m52.wires[s52] = n52.wire;
                else
                    m52.wires.push(n52.wire);
                break;
            case TopologyPatchOp.REMOVE_WIRE:
                if (!n52.wireId)
                    return;
                m52.wires = m52.wires.filter(t52 => t52.id !== n52.wireId);
                break;
            default:
                break;
        }
    }
    static patchFromComponentChange(k52: SchematicDocument, l52: ComponentInstance): TopologyPatch {
        return {
            op: TopologyPatchOp.UPSERT_DEVICE,
            device: TopologyAdapter.toDeviceInst(l52)
        };
    }
    static syncTopologyIncremental(v51: SchematicDocument, w51: SchTopology | null): SchTopology {
        if (!w51)
            return TopologyAdapter.toTopology(v51);
        const x51 = w51;
        const y51 = v51.components.length;
        const z51 = new Map<string, DeviceInst>();
        for (let j52 = 0; j52 < x51.deviceList.length; j52++) {
            z51.set(x51.deviceList[j52].instUuid, x51.deviceList[j52]);
        }
        for (let h52 = 0; h52 < y51; h52++) {
            const i52 = TopologyAdapter.toDeviceInst(v51.components[h52]);
            z51.set(i52.instUuid, i52);
        }
        const a52: DeviceInst[] = [];
        z51.forEach((g52: DeviceInst) => a52.push(g52));
        x51.deviceList = a52;
        const b52 = v51.nets.length;
        x51.netList = [];
        for (let f52 = 0; f52 < b52; f52++) {
            x51.netList.push(TopologyAdapter.toNetInfo(v51.nets[f52]));
        }
        const c52 = v51.wires.length;
        x51.wireList = [];
        for (let d52 = 0; d52 < c52; d52++) {
            const e52 = v51.wires[d52];
            x51.wireList.push(makeRouteLine(e52.netId, e52.points, false));
        }
        x51.schName = v51.name;
        return x51;
    }
}
