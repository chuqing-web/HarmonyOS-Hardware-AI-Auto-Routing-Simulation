import {

  SchematicDocument, ComponentInstance, Net, NetType, SubcircuitRef, Port,

  WireStyle, PinType, Rotation, Wire

} from '../types/CommonTypes';

import {

  SchTopology, DeviceInst, NetInfo, SubCircuitBlock, SubCircuitPort

} from '../types/TopologyTypes';

import { IdUtil } from './IdUtil';

import { copyStringMap, makeNetNodeRef, makeRouteLine, normalizeRotation } from './MapHelpers';
import { parsePinRef, buildPinRef } from './PinRefUtil';
import { TopologyPatchApplier } from './TopologyPatch';



export class TopologyAdapter {

  static toTopology(doc: SchematicDocument): SchTopology {

    return {

      schUuid: doc.id,

      schName: doc.name,

      layerDepth: 0,

      deviceList: doc.components.map(TopologyAdapter.toDeviceInst),

      netList: doc.nets.map(TopologyAdapter.toNetInfo),

      busList: [],

      wireList: doc.wires.map(w => makeRouteLine(w.netId, w.points, false)),

      subCircuitList: doc.subcircuits.map(TopologyAdapter.toSubBlock),

      probeList: [],

      textAnnotate: [],

      ercErrorList: [],

      gridStep: doc.metadata.gridSize,

      bgColor: '#0a0a1a'

    };

  }



  static fromTopology(topo: SchTopology): SchematicDocument {

    const now = new Date().toISOString();

    return {

      id: topo.schUuid || IdUtil.generate('sch'),

      name: topo.schName,

      version: '2.0',

      components: topo.deviceList.map(TopologyAdapter.toComponent),

      wires: topo.wireList.map((w, _i) => {
        const wire: Wire = {
          id: IdUtil.generate('wire'),
          netId: w.netUuid,
          points: w.points,
          style: WireStyle.ORTHOGONAL
        };
        return wire;
      }),

      nets: topo.netList.map(TopologyAdapter.toNet),

      netLabels: [],

      subcircuits: topo.subCircuitList.map(TopologyAdapter.toSubRef),

      metadata: {

        author: '',

        createdAt: now,

        modifiedAt: now,

        description: '',

        gridSize: topo.gridStep,

        units: 'mm',

        undoLimit: 1000

      }

    };

  }



  static toDeviceInst(c: ComponentInstance): DeviceInst {

    return {

      instUuid: c.id,

      libDevId: c.libraryId,

      refName: c.refDes,

      x: c.position.x,

      y: c.position.y,

      rotate: c.rotation,

      mirrorH: c.mirrored,

      mirrorV: false,

      params: copyStringMap(c.parameters),

      pinVoltage: new Map<string, number>(),

      hidden: false,

      subCircuitRef: c.subcircuitId ?? '',

      ercErrorMsg: ''

    };

  }



  static toComponent(d: DeviceInst): ComponentInstance {

    const rotation: Rotation = normalizeRotation(d.rotate);

    const comp: ComponentInstance = {

      id: d.instUuid,

      libraryId: d.libDevId,

      refDes: d.refName,

      position: { x: d.x, y: d.y },

      rotation: rotation,

      mirrored: d.mirrorH,

      parameters: copyStringMap(d.params)

    };

    if (d.subCircuitRef.length > 0) {

      comp.subcircuitId = d.subCircuitRef;

    }

    return comp;

  }



  static toNetInfo(n: Net): NetInfo {

    return {

      netUuid: n.id,

      netName: n.name,

      displayName: n.name,

      nodeList: n.pinIds.map((pinRef: string) => {
        const parsed = parsePinRef(pinRef);
        if (parsed !== null && parsed.compId.length > 0 && parsed.pinId.length > 0) {
          return makeNetNodeRef(parsed.compId, parsed.pinId);
        }
        return makeNetNodeRef('', pinRef);
      }),

      isPower: n.type === NetType.POWER || n.type === NetType.GROUND,

      isAnalog: false,

      isBusMember: n.type === NetType.BUS,

      busParentUuid: '',

      defaultVoltage: n.type === NetType.POWER ? 5.0 : 0.0,

      ercWarning: false,

      connectedProbeIds: []

    };

  }



  static toNet(n: NetInfo): Net {

    const upper = n.netName.toUpperCase();
    let netType = NetType.SIGNAL;
    if (n.isPower) {
      netType = (upper === 'GND' || upper === 'VSS' || upper === 'VEE' || upper === '0') ?
        NetType.GROUND : NetType.POWER;
    } else if (n.isBusMember) {
      netType = NetType.BUS;
    } else if (upper === 'GND' || upper === 'VSS' || upper === 'VEE') {
      netType = NetType.GROUND;
    } else if (upper === 'VCC' || upper === 'VDD') {
      netType = NetType.POWER;
    }

    return {

      id: n.netUuid,

      name: n.netName,

      type: netType,

      pinIds: n.nodeList.map(node => {
        if (node.devUuid.length > 0) {
          return buildPinRef(node.devUuid, node.pinId, node.pinId);
        }
        return node.pinId;
      })

    };

  }



  private static toSubBlock(s: SubcircuitRef): SubCircuitBlock {

    const ports = s.ports ?? [];

    const portList: SubCircuitPort[] = [];

    for (let i = 0; i < ports.length; i++) {

      const p = ports[i];

      let direction: 'in' | 'out' | 'inout' = 'inout';

      if (p.direction === 'input') {

        direction = 'in';

      } else if (p.direction === 'output') {

        direction = 'out';

      }

      portList.push({

        portId: p.id,

        portName: p.name,

        direction: direction,

        x: p.position.x,

        y: p.position.y

      });

    }

    return {

      subUuid: s.id,

      name: s.name,

      portList: portList,

      innerTopo: s.embeddedDocument ? TopologyAdapter.toTopology(s.embeddedDocument) : null

    };

  }



  private static toSubRef(b: SubCircuitBlock): SubcircuitRef {

    const ports: Port[] = [];

    for (let i = 0; i < b.portList.length; i++) {

      const p = b.portList[i];

      let direction: 'input' | 'output' | 'bidirectional' = 'bidirectional';

      if (p.direction === 'in') {

        direction = 'input';

      } else if (p.direction === 'out') {

        direction = 'output';

      }

      ports.push({

        id: p.portId,

        name: p.portName,

        type: PinType.BIDIRECTIONAL,

        direction: direction,

        position: { x: p.x, y: p.y }

      });

    }

    const ref: SubcircuitRef = {

      id: b.subUuid,

      name: b.name,

      documentId: b.subUuid,

      position: { x: 0, y: 0 },

      ports: ports

    };

    if (b.innerTopo) {

      ref.embeddedDocument = TopologyAdapter.fromTopology(b.innerTopo);

    }

    return ref;

  }

  static syncIncremental(doc: SchematicDocument, cached: SchTopology | null): SchTopology {
    return TopologyPatchApplier.syncTopologyIncremental(doc, cached);
  }

}

