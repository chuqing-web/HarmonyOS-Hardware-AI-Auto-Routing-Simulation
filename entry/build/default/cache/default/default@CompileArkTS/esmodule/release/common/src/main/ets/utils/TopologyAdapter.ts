import { NetType, WireStyle, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ComponentInstance, Net, SubcircuitRef, Port, Rotation, Wire } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchTopology, DeviceInst, NetInfo, SubCircuitBlock, SubCircuitPort } from '../types/TopologyTypes';
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { copyStringMap, makeNetNodeRef, makeRouteLine, normalizeRotation } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { parsePinRef, buildPinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { TopologyPatchApplier } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/TopologyPatch";
export class TopologyAdapter {
    static toTopology(t51: SchematicDocument): SchTopology {
        return {
            schUuid: t51.id,
            schName: t51.name,
            layerDepth: 0,
            deviceList: t51.components.map(TopologyAdapter.toDeviceInst),
            netList: t51.nets.map(TopologyAdapter.toNetInfo),
            busList: [],
            wireList: t51.wires.map(u51 => makeRouteLine(u51.netId, u51.points, false)),
            subCircuitList: t51.subcircuits.map(TopologyAdapter.toSubBlock),
            probeList: [],
            textAnnotate: [],
            ercErrorList: [],
            gridStep: t51.metadata.gridSize,
            bgColor: '#0a0a1a'
        };
    }
    static fromTopology(o51: SchTopology): SchematicDocument {
        const p51 = new Date().toISOString();
        return {
            id: o51.schUuid || IdUtil.generate('sch'),
            name: o51.schName,
            version: '2.0',
            components: o51.deviceList.map(TopologyAdapter.toComponent),
            wires: o51.wireList.map((q51, r51) => {
                const s51: Wire = {
                    id: IdUtil.generate('wire'),
                    netId: q51.netUuid,
                    points: q51.points,
                    style: WireStyle.ORTHOGONAL
                };
                return s51;
            }),
            nets: o51.netList.map(TopologyAdapter.toNet),
            netLabels: [],
            subcircuits: o51.subCircuitList.map(TopologyAdapter.toSubRef),
            metadata: {
                author: '',
                createdAt: p51,
                modifiedAt: p51,
                description: '',
                gridSize: o51.gridStep,
                units: 'mm',
                undoLimit: 1000
            }
        };
    }
    static toDeviceInst(n51: ComponentInstance): DeviceInst {
        return {
            instUuid: n51.id,
            libDevId: n51.libraryId,
            refName: n51.refDes,
            x: n51.position.x,
            y: n51.position.y,
            rotate: n51.rotation,
            mirrorH: n51.mirrored,
            mirrorV: false,
            params: copyStringMap(n51.parameters),
            pinVoltage: new Map<string, number>(),
            hidden: false,
            subCircuitRef: n51.subcircuitId ?? '',
            ercErrorMsg: ''
        };
    }
    static toComponent(k51: DeviceInst): ComponentInstance {
        const l51: Rotation = normalizeRotation(k51.rotate);
        const m51: ComponentInstance = {
            id: k51.instUuid,
            libraryId: k51.libDevId,
            refDes: k51.refName,
            position: { x: k51.x, y: k51.y },
            rotation: l51,
            mirrored: k51.mirrorH,
            parameters: copyStringMap(k51.params)
        };
        if (k51.subCircuitRef.length > 0) {
            m51.subcircuitId = k51.subCircuitRef;
        }
        return m51;
    }
    static toNetInfo(h51: Net): NetInfo {
        return {
            netUuid: h51.id,
            netName: h51.name,
            displayName: h51.name,
            nodeList: h51.pinIds.map((i51: string) => {
                const j51 = parsePinRef(i51);
                if (j51 !== null && j51.compId.length > 0 && j51.pinId.length > 0) {
                    return makeNetNodeRef(j51.compId, j51.pinId);
                }
                return makeNetNodeRef('', i51);
            }),
            isPower: h51.type === NetType.POWER || h51.type === NetType.GROUND,
            isAnalog: false,
            isBusMember: h51.type === NetType.BUS,
            busParentUuid: '',
            defaultVoltage: h51.type === NetType.POWER ? 5.0 : 0.0,
            ercWarning: false,
            connectedProbeIds: []
        };
    }
    static toNet(d51: NetInfo): Net {
        const e51 = d51.netName.toUpperCase();
        let f51 = NetType.SIGNAL;
        if (d51.isPower) {
            f51 = (e51 === 'GND' || e51 === 'VSS' || e51 === 'VEE' || e51 === '0') ?
                NetType.GROUND : NetType.POWER;
        }
        else if (d51.isBusMember) {
            f51 = NetType.BUS;
        }
        else if (e51 === 'GND' || e51 === 'VSS' || e51 === 'VEE') {
            f51 = NetType.GROUND;
        }
        else if (e51 === 'VCC' || e51 === 'VDD') {
            f51 = NetType.POWER;
        }
        return {
            id: d51.netUuid,
            name: d51.netName,
            type: f51,
            pinIds: d51.nodeList.map(g51 => {
                if (g51.devUuid.length > 0) {
                    return buildPinRef(g51.devUuid, g51.pinId, g51.pinId);
                }
                return g51.pinId;
            })
        };
    }
    private static toSubBlock(x50: SubcircuitRef): SubCircuitBlock {
        const y50 = x50.ports ?? [];
        const z50: SubCircuitPort[] = [];
        for (let a51 = 0; a51 < y50.length; a51++) {
            const b51 = y50[a51];
            let c51: 'in' | 'out' | 'inout' = 'inout';
            if (b51.direction === 'input') {
                c51 = 'in';
            }
            else if (b51.direction === 'output') {
                c51 = 'out';
            }
            z50.push({
                portId: b51.id,
                portName: b51.name,
                direction: c51,
                x: b51.position.x,
                y: b51.position.y
            });
        }
        return {
            subUuid: x50.id,
            name: x50.name,
            portList: z50,
            innerTopo: x50.embeddedDocument ? TopologyAdapter.toTopology(x50.embeddedDocument) : null
        };
    }
    private static toSubRef(r50: SubCircuitBlock): SubcircuitRef {
        const s50: Port[] = [];
        for (let u50 = 0; u50 < r50.portList.length; u50++) {
            const v50 = r50.portList[u50];
            let w50: 'input' | 'output' | 'bidirectional' = 'bidirectional';
            if (v50.direction === 'in') {
                w50 = 'input';
            }
            else if (v50.direction === 'out') {
                w50 = 'output';
            }
            s50.push({
                id: v50.portId,
                name: v50.portName,
                type: PinType.BIDIRECTIONAL,
                direction: w50,
                position: { x: v50.x, y: v50.y }
            });
        }
        const t50: SubcircuitRef = {
            id: r50.subUuid,
            name: r50.name,
            documentId: r50.subUuid,
            position: { x: 0, y: 0 },
            ports: s50
        };
        if (r50.innerTopo) {
            t50.embeddedDocument = TopologyAdapter.fromTopology(r50.innerTopo);
        }
        return t50;
    }
    static syncIncremental(p50: SchematicDocument, q50: SchTopology | null): SchTopology {
        return TopologyPatchApplier.syncTopologyIncremental(p50, q50);
    }
}
