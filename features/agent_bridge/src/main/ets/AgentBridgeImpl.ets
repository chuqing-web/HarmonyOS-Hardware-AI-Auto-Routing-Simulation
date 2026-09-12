/**
 * Agent Bridge 实现 — 启动本机 HTTP JSON-RPC 并写入发现文件
 */
import fs from '@ohos.file.fs';
import { IdUtil, Logger } from 'common';
import { ISchematicEditor } from 'schematic_editor';
import { IComponentLibrary } from 'component_library';
import { IPcbEditor } from 'pcb_editor';
import { AgentBridgeInfo, IAgentBridge } from './api/IAgentBridge';
import { IAgentDrawingHost } from './api/IAgentDrawingHost';
import { AgentCommandDispatcher } from './AgentCommandDispatcher';
import { AgentHttpServer } from './AgentHttpServer';

const TAG = 'AgentBridge';
const DISCOVERY_FILE = 'agent-bridge.json';

interface McpEnv {
  ELECDRAW_AGENT_URL: string;
  ELECDRAW_AGENT_TOKEN: string;
}

interface McpServerEntry {
  command: string;
  args: string[];
  env: McpEnv;
}

interface McpServersMap {
  elecdraw: McpServerEntry;
}

interface McpConfigRoot {
  mcpServers: McpServersMap;
}

interface DiscoveryFile {
  host: string;
  port: number;
  token: string;
  rpcUrl: string;
  healthUrl: string;
  startedAt: number;
  methodsHint: string;
}

export class AgentBridgeImpl implements IAgentBridge {
  private dispatcher: AgentCommandDispatcher = new AgentCommandDispatcher();
  private server: AgentHttpServer = new AgentHttpServer(this.dispatcher);
  private discoveryPath: string = '';
  private baseDir: string = '';

  bindEditors(sch: ISchematicEditor, pcb: IPcbEditor, lib: IComponentLibrary): void {
    this.dispatcher.bind(sch, pcb, lib);
  }

  bindDrawingHost(host: IAgentDrawingHost): void {
    this.dispatcher.bindHost(host);
  }

  async start(baseDir: string): Promise<AgentBridgeInfo> {
    this.baseDir = baseDir;
    this.discoveryPath = `${baseDir}/${DISCOVERY_FILE}`;
    if (this.server.isRunning()) {
      return this.getInfo();
    }
    const token = this.makeToken();
    const port = await this.server.start(token);
    this.writeDiscovery();
    Logger.info(TAG, `started port=${port} discovery=${this.discoveryPath}`);
    return this.getInfo();
  }

  async stop(): Promise<void> {
    await this.server.stop();
    Logger.info(TAG, 'stopped');
  }

  isRunning(): boolean {
    return this.server.isRunning();
  }

  getInfo(): AgentBridgeInfo {
    const info: AgentBridgeInfo = {
      running: this.server.isRunning(),
      host: this.server.getHost(),
      port: this.server.getPort(),
      token: this.server.getToken(),
      discoveryPath: this.discoveryPath
    };
    return info;
  }

  rotateToken(): string {
    const token = this.makeToken();
    this.server.setToken(token);
    this.writeDiscovery();
    return token;
  }

  getMcpConfigSnippet(): string {
    const info = this.getInfo();
    const url = `http://${info.host}:${info.port}/rpc`;
    const env: McpEnv = {
      ELECDRAW_AGENT_URL: url,
      ELECDRAW_AGENT_TOKEN: info.token
    };
    const entry: McpServerEntry = {
      command: 'node',
      args: ['tools/elecdraw-mcp/index.mjs'],
      env: env
    };
    const servers: McpServersMap = { elecdraw: entry };
    const root: McpConfigRoot = { mcpServers: servers };
    return JSON.stringify(root, null, 2);
  }

  private makeToken(): string {
    return IdUtil.generate('agt').replace(/[^a-zA-Z0-9_]/g, '') +
      `_${Date.now().toString(36)}`;
  }

  private writeDiscovery(): void {
    if (this.baseDir.length === 0) {
      return;
    }
    const info = this.getInfo();
    const discovery: DiscoveryFile = {
      host: info.host,
      port: info.port,
      token: info.token,
      rpcUrl: `http://${info.host}:${info.port}/rpc`,
      healthUrl: `http://${info.host}:${info.port}/health`,
      startedAt: Date.now(),
      methodsHint: 'POST /rpc JSON-RPC 2.0; Authorization: Bearer <token>'
    };
    const payload = JSON.stringify(discovery, null, 2);
    try {
      try {
        fs.accessSync(this.baseDir);
      } catch (_e) {
        try {
          fs.mkdirSync(this.baseDir);
        } catch (_e2) { /* ignore */ }
      }
      const file = fs.openSync(this.discoveryPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, payload);
      fs.closeSync(file);
    } catch (e) {
      Logger.warn(TAG, `write discovery failed: ${e}`);
    }
  }
}
