#!/usr/bin/env node
/**
 * ElecDraw MCP adapter — maps MCP tools to App Agent Bridge HTTP JSON-RPC.
 *
 * Env:
 *   ELECDRAW_AGENT_URL   default http://127.0.0.1:39281/rpc
 *   ELECDRAW_AGENT_TOKEN required (from App AI settings → Agent Bridge)
 *   ELECDRAW_DISCOVERY   optional path to agent-bridge.json
 */
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';

const PROTOCOL = '2024-11-05';

function loadConfig() {
  let url = process.env.ELECDRAW_AGENT_URL || '';
  let token = process.env.ELECDRAW_AGENT_TOKEN || '';
  const discovery = process.env.ELECDRAW_DISCOVERY || '';
  if (discovery && existsSync(discovery)) {
    try {
      const j = JSON.parse(readFileSync(discovery, 'utf8'));
      if (!url && j.rpcUrl) url = j.rpcUrl;
      if (!token && j.token) token = j.token;
    } catch {
      // ignore
    }
  }
  if (!url) url = 'http://127.0.0.1:39281/rpc';
  return { url, token };
}

const cfg = loadConfig();

/** @type {{ name: string, description: string, inputSchema: object, method: string }[]} */
const TOOLS = [
  { name: 'sys_ping', description: 'Ping Agent Bridge', inputSchema: { type: 'object', properties: {} }, method: 'sys.ping' },
  { name: 'sys_status', description: 'Schematic/PCB/library status summary', inputSchema: { type: 'object', properties: {} }, method: 'sys.status' },
  { name: 'sys_list_methods', description: 'List all JSON-RPC methods', inputSchema: { type: 'object', properties: {} }, method: 'sys.list_methods' },
  {
    name: 'sch_drawing_session_begin',
    description: 'Begin Agent drawing session: lock canvas (reuse AI overlay) and open AI log panel',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } }
    },
    method: 'sch.drawing_session_begin'
  },
  {
    name: 'sch_drawing_session_end',
    description: 'End Agent drawing session: unlock canvas; fit=true (default) centers schematic',
    inputSchema: {
      type: 'object',
      properties: { fit: { type: 'boolean' } }
    },
    method: 'sch.drawing_session_end'
  },
  {
    name: 'sch_fit_all_in_view',
    description: 'Fit/center entire schematic in canvas viewport',
    inputSchema: { type: 'object', properties: {} },
    method: 'sch.fit_all_in_view'
  },
  {
    name: 'sch_append_session_log',
    description: 'Append a line to AI panel session log (auto-prefixes [Agent])',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        message: { type: 'string' }
      }
    },
    method: 'sch.append_session_log'
  },
  {
    name: 'lib_search',
    description: 'Search schematic component library',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        page: { type: 'number' },
        pageSize: { type: 'number' }
      },
      required: ['keyword']
    },
    method: 'lib.search'
  },
  {
    name: 'lib_get',
    description: 'Get component by library id',
    inputSchema: { type: 'object', properties: { libraryId: { type: 'string' } }, required: ['libraryId'] },
    method: 'lib.get'
  },
  {
    name: 'lib_resolve_id',
    description: 'Resolve library id / Proteus alias',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    method: 'lib.resolve_id'
  },
  { name: 'sch_get_topology_summary', description: 'Summarize current schematic topology', inputSchema: { type: 'object', properties: {} }, method: 'sch.get_topology_summary' },
  {
    name: 'sch_place_device',
    description: 'Place a schematic device',
    inputSchema: {
      type: 'object',
      properties: {
        libraryId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        refName: { type: 'string' }
      },
      required: ['libraryId', 'x', 'y']
    },
    method: 'sch.place_device'
  },
  {
    name: 'sch_delete_device',
    description: 'Delete schematic device by uuid',
    inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] },
    method: 'sch.delete_device'
  },
  {
    name: 'sch_move_device',
    description: 'Move schematic device',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } },
      required: ['uuid', 'x', 'y']
    },
    method: 'sch.move_device'
  },
  {
    name: 'sch_rotate_device',
    description: 'Rotate schematic device (degrees)',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, angle: { type: 'number' } },
      required: ['uuid']
    },
    method: 'sch.rotate_device'
  },
  {
    name: 'sch_set_param',
    description: 'Set device parameter',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } },
      required: ['uuid', 'key', 'value']
    },
    method: 'sch.set_param'
  },
  {
    name: 'sch_add_wire_segment',
    description: 'Add a schematic wire segment',
    inputSchema: {
      type: 'object',
      properties: {
        x1: { type: 'number' }, y1: { type: 'number' },
        x2: { type: 'number' }, y2: { type: 'number' },
        netId: { type: 'string' }
      },
      required: ['x1', 'y1', 'x2', 'y2']
    },
    method: 'sch.add_wire_segment'
  },
  {
    name: 'sch_add_wire_points',
    description: 'Add schematic wire through waypoints',
    inputSchema: {
      type: 'object',
      properties: {
        points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } } },
        netId: { type: 'string' }
      },
      required: ['points']
    },
    method: 'sch.add_wire_points'
  },
  {
    name: 'sch_create_net_label',
    description: 'Create schematic net label',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, netName: { type: 'string' } },
      required: ['x', 'y', 'netName']
    },
    method: 'sch.create_net_label'
  },
  { name: 'sch_undo', description: 'Schematic undo', inputSchema: { type: 'object', properties: {} }, method: 'sch.undo' },
  { name: 'sch_redo', description: 'Schematic redo', inputSchema: { type: 'object', properties: {} }, method: 'sch.redo' },
  { name: 'pcb_get_summary', description: 'PCB summary including footprints and pad world positions/nets', inputSchema: { type: 'object', properties: {} }, method: 'pcb.get_summary' },
  {
    name: 'pcb_drawing_session_begin',
    description: 'Begin Agent PCB drawing session (reuse AI overlay + [Agent] logs; locks canvas)',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } }
    },
    method: 'pcb.drawing_session_begin'
  },
  {
    name: 'pcb_drawing_session_end',
    description: 'End Agent PCB drawing session (unlock; optional fit board)',
    inputSchema: {
      type: 'object',
      properties: { fit: { type: 'boolean' } }
    },
    method: 'pcb.drawing_session_end'
  },
  {
    name: 'pcb_append_session_log',
    description: 'Append [Agent] log line to AI panel',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, message: { type: 'string' } }
    },
    method: 'pcb.append_session_log'
  },
  {
    name: 'pcb_fit_board_in_view',
    description: 'Fit PCB board (and schematic) in view',
    inputSchema: { type: 'object', properties: {} },
    method: 'pcb.fit_board_in_view'
  },
  {
    name: 'pcb_move_footprint',
    description: 'Move footprint by ref or id to absolute x,y (optional rotation 0/90/180/270)',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' }, id: { type: 'string' },
        x: { type: 'number' }, y: { type: 'number' },
        rotation: { type: 'number' }, angle: { type: 'number' }
      },
      required: ['x', 'y']
    },
    method: 'pcb.move_footprint'
  },
  {
    name: 'pcb_clear_copper',
    description: 'Clear tracks and/or vias before re-routing',
    inputSchema: {
      type: 'object',
      properties: { tracks: { type: 'boolean' }, vias: { type: 'boolean' } }
    },
    method: 'pcb.clear_copper'
  },
  {
    name: 'pcb_set_copper_layer_count',
    description: 'Set PCB copper layer count (e.g. 2/4/6)',
    inputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
    method: 'pcb.set_copper_layer_count'
  },
  {
    name: 'pcb_set_active_layer',
    description: 'Set active PCB layer (e.g. F.Cu, B.Cu, In1.Cu)',
    inputSchema: { type: 'object', properties: { layer: { type: 'string' } }, required: ['layer'] },
    method: 'pcb.set_active_layer'
  },
  {
    name: 'pcb_place_footprint',
    description: 'Place footprint at position (optionally set defId first)',
    inputSchema: {
      type: 'object',
      properties: { defId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    },
    method: 'pcb.place_footprint'
  },
  {
    name: 'pcb_start_route',
    description: 'Start PCB route at point (prefer pad coords from pcb_get_summary.pads)',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    },
    method: 'pcb.start_route'
  },
  {
    name: 'pcb_preview_route',
    description: 'Preview PCB route to point (reports violating)',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    },
    method: 'pcb.preview_route'
  },
  {
    name: 'pcb_commit_route',
    description: 'Commit PCB route segment to end point (rich reject reason on failure)',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    },
    method: 'pcb.commit_route'
  },
  { name: 'pcb_cancel_route', description: 'Cancel active PCB route', inputSchema: { type: 'object', properties: {} }, method: 'pcb.cancel_route' },
  {
    name: 'pcb_switch_route_layer',
    description: 'During route: switch copper layer (places via when possible)',
    inputSchema: {
      type: 'object',
      properties: { layer: { type: 'string' } },
      required: ['layer']
    },
    method: 'pcb.switch_route_layer'
  },
  {
    name: 'pcb_add_track_segment',
    description: 'Add one track segment (start/commit path; optional netId/netName/layer)',
    inputSchema: {
      type: 'object',
      properties: {
        x1: { type: 'number' }, y1: { type: 'number' },
        x2: { type: 'number' }, y2: { type: 'number' },
        netId: { type: 'string' }, netName: { type: 'string' },
        layer: { type: 'string' }
      },
      required: ['x1', 'y1', 'x2', 'y2']
    },
    method: 'pcb.add_track_segment'
  },
  {
    name: 'pcb_add_via',
    description: 'Add PCB via',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, netId: { type: 'string' }, netName: { type: 'string' } },
      required: ['x', 'y']
    },
    method: 'pcb.add_via'
  },
  {
    name: 'pcb_move_selected',
    description: 'Move selected PCB objects',
    inputSchema: {
      type: 'object',
      properties: { dx: { type: 'number' }, dy: { type: 'number' } },
      required: ['dx', 'dy']
    },
    method: 'pcb.move_selected'
  },
  { name: 'pcb_delete_selected', description: 'Delete PCB selection', inputSchema: { type: 'object', properties: {} }, method: 'pcb.delete_selected' },
  { name: 'pcb_undo', description: 'PCB undo', inputSchema: { type: 'object', properties: {} }, method: 'pcb.undo' },
  { name: 'pcb_redo', description: 'PCB redo', inputSchema: { type: 'object', properties: {} }, method: 'pcb.redo' },
  { name: 'pcb_forward_annotate', description: 'Forward annotate footprints from schematic', inputSchema: { type: 'object', properties: {} }, method: 'pcb.forward_annotate' }
];

let rpcId = 1;

async function callRpc(method, params) {
  if (!cfg.token) {
    throw new Error('ELECDRAW_AGENT_TOKEN missing. Copy token from App → AI → Agent Bridge.');
  }
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: rpcId++,
    method,
    params: params || {}
  });
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`
    },
    body
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad response HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

function send(msg) {
  const payload = JSON.stringify(msg);
  const frame = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
  process.stdout.write(frame);
}

function toolResult(id, obj) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }]
    }
  });
}

function toolError(id, message) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    }
  });
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'elecdraw-mcp', version: '1.0.0' }
      }
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }
    });
    return;
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      toolError(id, `Unknown tool: ${name}`);
      return;
    }
    try {
      const result = await callRpc(tool.method, args);
      toolResult(id, result);
    } catch (e) {
      toolError(id, e instanceof Error ? e.message : String(e));
    }
    return;
  }

  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (id !== undefined && id !== null) {
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  }
}

// Content-Length framed stdin
let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd < 0) break;
    const header = buf.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buf = buf.slice(headerEnd + 4);
      continue;
    }
    const len = Number(match[1]);
    const total = headerEnd + 4 + len;
    if (buf.length < total) break;
    const body = buf.slice(headerEnd + 4, total).toString('utf8');
    buf = buf.slice(total);
    try {
      const msg = JSON.parse(body);
      void handleMessage(msg);
    } catch (e) {
      // ignore malformed
    }
  }
});

// Also accept newline-delimited JSON for manual testing
if (process.env.ELECDRAW_MCP_NDJSON === '1') {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    try {
      void handleMessage(JSON.parse(line));
    } catch {
      // ignore
    }
  });
}

process.stderr.write(
  `[elecdraw-mcp] rpc=${cfg.url} token=${cfg.token ? 'set' : 'MISSING'}\n`
);
