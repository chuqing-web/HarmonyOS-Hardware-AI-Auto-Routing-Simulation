/**
 * 引脚世界坐标 — Kit pinOffset + 旋转/镜像（与 WireNetTopology 一致）
 */
import { Point2D, DeviceInst, ComponentInstance, Logger, INSTR_TRACE_TAG } from 'common';
import { TemplateSchematicKit } from './TemplateSchematicKit';

export class PinWorldResolver {
  static transformLocal(local: Point2D, rotation: number, mirrored: boolean): Point2D {
    let x = local.x;
    let y = local.y;
    if (mirrored) {
      x = -x;
    }
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90) {
      return { x: -y, y: x };
    }
    if (rot === 180) {
      return { x: -x, y: -y };
    }
    if (rot === 270) {
      return { x: y, y: -x };
    }
    return { x: x, y: y };
  }

  static forDevice(libDevId: string, x: number, y: number, rotate: number,
    mirrorH: boolean, pinId: string, pinName: string): Point2D {
    const known = TemplateSchematicKit.validatePinExists(libDevId, pinId)
      || (pinName.length > 0 && TemplateSchematicKit.validatePinExists(libDevId, pinName));
    const local = TemplateSchematicKit.pinOffset(libDevId, pinId, pinName);
    if (!known && local.x === 0 && local.y === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIN] unknown pin ${libDevId}.${pinId}/${pinName} — world falls at device center`);
    }
    const t = PinWorldResolver.transformLocal(local, rotate, mirrorH);
    return { x: x + t.x, y: y + t.y };
  }

  static forDeviceInst(dev: DeviceInst, pinId: string, pinName: string): Point2D {
    return PinWorldResolver.forDevice(
      dev.libDevId, dev.x, dev.y, dev.rotate, dev.mirrorH, pinId, pinName);
  }

  static forComponent(comp: ComponentInstance, pinId: string, pinName: string): Point2D {
    return PinWorldResolver.forDevice(
      comp.libraryId, comp.position.x, comp.position.y,
      comp.rotation, comp.mirrored, pinId, pinName);
  }
}
