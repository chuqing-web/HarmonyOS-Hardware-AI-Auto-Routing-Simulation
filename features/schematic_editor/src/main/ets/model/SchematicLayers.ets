/**
 * 原理图图层数据结构
 */
export enum SchematicLayerId {
  COMPONENTS = 'components',
  WIRING = 'wiring',
  SILKSCREEN = 'silkscreen',
  ANNOTATIONS = 'annotations',
  ERC_MARKERS = 'erc_markers'
}

export interface SchematicLayer {
  layerId: SchematicLayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  itemIds: string[];
}

export function createDefaultLayers(): SchematicLayer[] {
  return [
    { layerId: SchematicLayerId.COMPONENTS, name: '器件层', visible: true, locked: false, opacity: 1.0, itemIds: [] },
    { layerId: SchematicLayerId.WIRING, name: '布线层', visible: true, locked: false, opacity: 1.0, itemIds: [] },
    { layerId: SchematicLayerId.SILKSCREEN, name: '丝印层', visible: true, locked: false, opacity: 1.0, itemIds: [] },
    { layerId: SchematicLayerId.ANNOTATIONS, name: '注释层', visible: true, locked: false, opacity: 1.0, itemIds: [] },
    { layerId: SchematicLayerId.ERC_MARKERS, name: 'ERC标记层', visible: true, locked: true, opacity: 0.8, itemIds: [] }
  ];
}
