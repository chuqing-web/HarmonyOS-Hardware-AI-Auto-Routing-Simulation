/**
 * 引脚世界坐标 — Kit pinOffset + 旋转/镜像（与 WireNetTopology 一致）
 *
 * 约定：调用方可能传入 DeviceLibrary 数字 pin_id 或 Builtin 语义脚；
 * 一律经 PinIdRegistry / Kit 规范化后再取局部坐标。
 */
import { Point2D, DeviceInst, ComponentInstance, Logger, INSTR_TRACE_TAG } from 'common';
import { TemplateSchematicKit } from './TemplateSchematicKit';
import { PinIdRegistry } from './PinIdRegistry';

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
    // 数字/别名 → Builtin pin.id；几何与 validate 都用规范脚
    const resolved = PinIdRegistry.resolve(libDevId, pinId, pinName);
    const known = TemplateSchematicKit.validatePinExists(libDevId, resolved)
      || TemplateSchematicKit.validatePinExists(libDevId, pinId)
      || (pinName.length > 0 && TemplateSchematicKit.validatePinExists(libDevId, pinName))
      || PinIdRegistry.canonicalize(libDevId, pinId, pinName).length > 0;
    const local = TemplateSchematicKit.pinOffset(libDevId, resolved, pinName);
    if (!known && local.x === 0 && local.y === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIN] unknown pin ${libDevId}.${pinId}/${pinName}` +
        ` (resolved=${resolved}) — world falls at device center`);
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
