/**
 * 基于 TCPSocketServer 的轻量 HTTP JSON-RPC（仅 127.0.0.1）
 */
import socket from '@ohos.net.socket';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { Logger } from 'common';
import { AgentCommandDispatcher, JsonRpcRequest, JsonRpcResponse } from './AgentCommandDispatcher';

const TAG = 'AgentHttp';
const DEFAULT_PORT = 39281;
const MAX_PORT_TRIES = 20;

interface HttpHandleResult {
  done: boolean;
  rest: string;
  status: number;
  body: string;
  contentType: string;
}

interface HealthBody {
  ok: boolean;
  service: string;
}

interface ErrorBody {
  error: string;
}

interface ParseErrorInner {
  code: number;
  message: string;
}

interface ParseErrorBody {
  jsonrpc: string;
  id: null;
  error: ParseErrorInner;
}

interface TcpSendOpts {
  data: string;
  encoding: string;
}

export class AgentHttpServer {
  private server: socket.TCPSocketServer | null = null;
  private dispatcher: AgentCommandDispatcher;
  private token: string = '';
  private port: number = DEFAULT_PORT;
  private running: boolean = false;
  private host: string = '127.0.0.1';

  constructor(dispatcher: AgentCommandDispatcher) {
    this.dispatcher = dispatcher;
  }

  getPort(): number {
    return this.port;
  }

  getHost(): string {
    return this.host;
  }

  getToken(): string {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(token: string, preferredPort: number = DEFAULT_PORT): Promise<number> {
    if (this.running) {
      return this.port;
    }
    this.token = token;
    let lastErr: string = '';
    for (let i = 0; i < MAX_PORT_TRIES; i++) {
      const tryPort = preferredPort + i;
      try {
        await this.listenOn(tryPort);
        this.port = tryPort;
        this.running = true;
        Logger.info(TAG, `Agent bridge listening on ${this.host}:${this.port}`);
        return this.port;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : `${e}`;
        Logger.warn(TAG, `listen ${tryPort} failed: ${lastErr}`);
        this.teardownServer();
      }
    }
    throw new Error(`Failed to bind agent bridge port: ${lastErr}`);
  }

  async stop(): Promise<void> {
    this.teardownServer();
    this.running = false;
  }

  private teardownServer(): void {
    if (this.server) {
      try {
        this.server.off('connect');
      } catch (_e) { /* ignore */ }
      try {
        this.server.close();
      } catch (_e2) { /* ignore */ }
      this.server = null;
    }
  }

  private listenOn(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const srv: socket.TCPSocketServer = socket.constructTCPSocketServerInstance();
      this.server = srv;
      const addr: socket.NetAddress = {
        address: this.host,
        port: port,
        family: 1
      };
      srv.on('connect', (client: socket.TCPSocketConnection) => {
        this.wireClient(client);
      });
      srv.listen(addr, (err: BusinessError) => {
        if (err) {
          reject(new Error(`listen fail code=${err.code} ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  private wireClient(client: socket.TCPSocketConnection): void {
    let buffer: string = '';
    client.on('message', (msgInfo: socket.SocketMessageInfo) => {
      try {
        buffer += this.bufferToString(msgInfo.message);
        const handled = this.tryHandleHttp(buffer);
        if (handled.done) {
          buffer = handled.rest;
          void this.respond(client, handled.status, handled.body, handled.contentType);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`;
        Logger.error(TAG, `client message error: ${msg}`);
        const errBody: ErrorBody = { error: msg };
        void this.respond(client, 500, JSON.stringify(errBody), 'application/json');
      }
    });
    client.on('close', () => {
      buffer = '';
    });
    client.on('error', (err: BusinessError) => {
      Logger.warn(TAG, `client error: ${err.message}`);
    });
  }

  private bufferToString(message: ArrayBuffer | string): string {
    if (typeof message === 'string') {
      return message;
    }
    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    return decoder.decode(new Uint8Array(message));
  }

  private pending(rest: string): HttpHandleResult {
    const r: HttpHandleResult = {
      done: false,
      rest: rest,
      status: 0,
      body: '',
      contentType: ''
    };
    return r;
  }

  private done(rest: string, status: number, body: string, contentType: string): HttpHandleResult {
    const r: HttpHandleResult = {
      done: true,
      rest: rest,
      status: status,
      body: body,
      contentType: contentType
    };
    return r;
  }

  private tryHandleHttp(raw: string): HttpHandleResult {
    const sep = raw.indexOf('\r\n\r\n');
    if (sep < 0) {
      return this.pending(raw);
    }
    const headerText = raw.substring(0, sep);
    const bodyStart = sep + 4;
    const headerLines = headerText.split('\r\n');
    if (headerLines.length === 0) {
      return this.done('', 400, 'Bad Request', 'text/plain');
    }
    const requestLine = headerLines[0];
    const parts = requestLine.split(' ');
    const method = parts.length > 0 ? parts[0].toUpperCase() : '';
    const path = parts.length > 1 ? parts[1] : '/';
    let contentLength = 0;
    let authHeader = '';
    for (let i = 1; i < headerLines.length; i++) {
      const line = headerLines[i];
      const colon = line.indexOf(':');
      if (colon < 0) {
        continue;
      }
      const key = line.substring(0, colon).trim().toLowerCase();
      const val = line.substring(colon + 1).trim();
      if (key === 'content-length') {
        contentLength = Number(val);
        if (Number.isNaN(contentLength)) {
          contentLength = 0;
        }
      } else if (key === 'authorization') {
        authHeader = val;
      }
    }
    if (raw.length < bodyStart + contentLength) {
      return this.pending(raw);
    }
    const body = raw.substring(bodyStart, bodyStart + contentLength);
    const rest = raw.substring(bodyStart + contentLength);

    if (method === 'GET' && (path === '/health' || path.indexOf('/health') === 0)) {
      const health: HealthBody = { ok: true, service: 'elecdraw-agent-bridge' };
      return this.done(rest, 200, JSON.stringify(health), 'application/json');
    }

    if (method !== 'POST' || path.indexOf('/rpc') !== 0) {
      const err404: ErrorBody = { error: 'Not Found. Use POST /rpc' };
      return this.done(rest, 404, JSON.stringify(err404), 'application/json');
    }

    if (!this.authorize(authHeader)) {
      const err401: ErrorBody = { error: 'Unauthorized' };
      return this.done(rest, 401, JSON.stringify(err401), 'application/json');
    }

    let parsed: Object;
    try {
      parsed = JSON.parse(body) as Object;
    } catch (_e) {
      const inner: ParseErrorInner = { code: -32700, message: 'Parse error' };
      const parseErr: ParseErrorBody = { jsonrpc: '2.0', id: null, error: inner };
      return this.done(rest, 400, JSON.stringify(parseErr), 'application/json');
    }

    const reqObj = parsed as Record<string, Object>;
    let params: Record<string, Object> = {};
    if (reqObj['params'] !== undefined && reqObj['params'] !== null) {
      params = reqObj['params'] as Record<string, Object>;
    }
    const rpcReq: JsonRpcRequest = {
      jsonrpc: asString(reqObj['jsonrpc'], '2.0'),
      id: reqObj['id'] as number | string | null,
      method: asString(reqObj['method']),
      params: params
    };
    const resp: JsonRpcResponse = this.dispatcher.dispatch(rpcReq);
    return this.done(rest, 200, JSON.stringify(resp), 'application/json');
  }

  private authorize(authHeader: string): boolean {
    if (this.token.length === 0) {
      return false;
    }
    const prefix = 'Bearer ';
    if (authHeader.length >= prefix.length &&
      authHeader.substring(0, prefix.length).toLowerCase() === 'bearer ') {
      const got = authHeader.substring(prefix.length).trim();
      return got === this.token;
    }
    return authHeader.trim() === this.token;
  }

  private async respond(client: socket.TCPSocketConnection, status: number, body: string,
    contentType: string): Promise<void> {
    const reason = status === 200 ? 'OK' : (status === 401 ? 'Unauthorized' :
      (status === 404 ? 'Not Found' : (status === 400 ? 'Bad Request' : 'Error')));
    const encoder = new util.TextEncoder();
    const bodyBytes = encoder.encodeInto(body);
    const header =
      `HTTP/1.1 ${status} ${reason}\r\n` +
      `Content-Type: ${contentType}; charset=utf-8\r\n` +
      `Content-Length: ${bodyBytes.length}\r\n` +
      `Connection: close\r\n` +
      `Access-Control-Allow-Origin: *\r\n` +
      `\r\n`;
    const payload = header + body;
    try {
      const opts: TcpSendOpts = { data: payload, encoding: 'utf-8' };
      await client.send(opts);
    } catch (e) {
      Logger.warn(TAG, `send failed: ${e}`);
    }
    try {
      await client.close();
    } catch (_e2) { /* ignore */ }
  }
}

function asString(v: Object | undefined, fallback: string = ''): string {
  if (v === undefined || v === null) {
    return fallback;
  }
  if (typeof v === 'string') {
    return v as string;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return `${v}`;
  }
  return fallback;
}
