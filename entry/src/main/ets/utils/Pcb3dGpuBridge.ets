/**
 * GPU 3D 渲染桥接（预备）
 * 目标：XComponent + Native EGL/GLES PBR。
 * 当前阶段：场景打包与能力探测；无 so 时自动回退 Canvas/CPU PBR。
 */
import { PcbDocument } from 'common';
import { boardThicknessWorld } from './Pcb3dSceneUtil';
import { copperLayersFromStack, isCopperLayer } from 'common';

export interface Pcb3dGpuCapability {
  nativeReady: boolean;
  reason: string;
}

export interface Pcb3dGpuSceneHeader {
  boardThickness: number;
  footprintCount: number;
  trackCount: number;
  viaCount: number;
  copperLayers: number;
}

/**
 * 探测 Native GLES 模块是否可用。
 * 未链接 libpcb3d_gpu.so 时返回 false，渲染器继续走 CPU PBR。
 */
export class Pcb3dGpuBridge {
  private static probed: boolean = false;
  private static ready: boolean = false;
  private static reason: string = '尚未探测';

  static getCapability(): Pcb3dGpuCapability {
    if (!Pcb3dGpuBridge.probed) {
      Pcb3dGpuBridge.probed = true;
      try {
        // 预留：import nativeModule from 'libpcb3d_gpu.so'
        Pcb3dGpuBridge.ready = false;
        Pcb3dGpuBridge.reason = 'Native GLES 模块尚未接入；当前使用增强 CPU PBR（嘉立创风）';
      } catch (e) {
        Pcb3dGpuBridge.ready = false;
        Pcb3dGpuBridge.reason = `Native 加载失败: ${e}`;
      }
    }
    return { nativeReady: Pcb3dGpuBridge.ready, reason: Pcb3dGpuBridge.reason };
  }

  /** 将文档摘要为 GPU 上传元数据（后续 NAPI 用） */
  static buildSceneHeader(doc: PcbDocument): Pcb3dGpuSceneHeader {
    const copper = copperLayersFromStack(doc.layerStack);
    let tracks = 0;
    for (let i = 0; i < doc.tracks.length; i++) {
      if (isCopperLayer(doc.tracks[i].layer)) tracks++;
    }
    return {
      boardThickness: boardThicknessWorld(doc),
      footprintCount: doc.footprints.length,
      trackCount: tracks,
      viaCount: doc.vias.length,
      copperLayers: copper.length
    };
  }

  static isNativeReady(): boolean {
    return Pcb3dGpuBridge.getCapability().nativeReady;
  }
}
