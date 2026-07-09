import { Point2D } from './CommonTypes';

export interface NetNodeRef {
  devUuid: string;
  pinId: string;
}

export interface NetInfo {
  netUuid: string;
  netName: string;
  displayName: string;
  nodeList: NetNodeRef[];
  isPower: boolean;
  isAnalog: boolean;
  isBusMember: boolean;
  busParentUuid: string;
  defaultVoltage: number;
  ercWarning: boolean;
  connectedProbeIds: string[];
}

export interface DeviceInst {
  instUuid: string;
  libDevId: string;
  refName: string;
  x: number;
  y: number;
  rotate: number;
  mirrorH: boolean;
  mirrorV: boolean;
  params: Map<string, string>;
  pinVoltage: Map<string, number>;
  hidden: boolean;
  subCircuitRef: string;
  ercErrorMsg: string;
}

export interface BusInfo {
  busUuid: string;
  name: string;
  bitCount: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branchNetUuids: string[];
}

export interface ProbeInfo {
  probeId: string;
  probeType: 'voltage' | 'current';
  netUuid: string;
  devPinUuid: string;
  x: number;
  y: number;
  oscChannel: number;
}

export interface TextAnnotate {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface ErcError {
  errType: string;
  targetUuid: string;
  desc: string;
  suggest: string;
  severity: 'error' | 'warning' | 'info' | 'critical';
}

export interface SubCircuitBlock {
  subUuid: string;
  name: string;
  portList: SubCircuitPort[];
  innerTopo: SchTopology | null;
}

export interface SubCircuitPort {
  portId: string;
  portName: string;
  direction: 'in' | 'out' | 'inout';
  x: number;
  y: number;
}

export interface SchTopology {
  schUuid: string;
  schName: string;
  layerDepth: number;
  deviceList: DeviceInst[];
  netList: NetInfo[];
  busList: BusInfo[];
  wireList: RouteLine[];
  subCircuitList: SubCircuitBlock[];
  probeList: ProbeInfo[];
  textAnnotate: TextAnnotate[];
  ercErrorList: ErcError[];
  gridStep: number;
  bgColor: string;
}

export interface RouteLine {
  netUuid: string;
  points: Point2D[];
  isBus: boolean;
}

export interface RouteResult {
  routeLines: RouteLine[];
  crossCount: number;
  totalLineLength: number;
  isolateAnalogDigital: boolean;
  xtalShortPath: boolean;
  diffLineEqualLength: boolean;
}
