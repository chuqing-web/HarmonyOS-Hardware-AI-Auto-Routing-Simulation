/**
 * App 侧宿主：Agent 绘制会话（锁画布 / 居中 / AI 面板日志）
 * Bridge 不直接依赖 UI，经此回调复用 AI 生成 UX。
 */
export interface AgentDrawingSessionResult {
  ok: boolean;
  error: string;
  active: boolean;
  fitted: boolean;
}

export interface IAgentDrawingHost {
  beginDrawingSession(reason: string): AgentDrawingSessionResult;
  endDrawingSession(fit: boolean): AgentDrawingSessionResult;
  fitAllInView(): AgentDrawingSessionResult;
  appendSessionLog(text: string): AgentDrawingSessionResult;
  isAgentDrawingSession(): boolean;
}
