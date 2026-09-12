/**
 * 外部 AI Agent 本机桥接 API
 */
import { ISchematicEditor } from 'schematic_editor';
import { IComponentLibrary } from 'component_library';
import { IPcbEditor } from 'pcb_editor';
import { IAgentDrawingHost } from './IAgentDrawingHost';

export interface AgentBridgeInfo {
  running: boolean;
  host: string;
  port: number;
  token: string;
  discoveryPath: string;
}

export interface IAgentBridge {
  /** 绑定编辑器并启动 127.0.0.1 HTTP JSON-RPC */
  start(baseDir: string): Promise<AgentBridgeInfo>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getInfo(): AgentBridgeInfo;
  /** 重新生成 token（不断开监听） */
  rotateToken(): string;
  /** 供设置页复制的 Cursor MCP 配置片段 */
  getMcpConfigSnippet(): string;
  /** 绑定原理图/PCB/器件库（启动前调用） */
  bindEditors(sch: ISchematicEditor, pcb: IPcbEditor, lib: IComponentLibrary): void;
  /** 绑定绘制会话宿主（锁画布 / 居中 / AI 日志） */
  bindDrawingHost(host: IAgentDrawingHost): void;
}
