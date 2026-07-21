/**
 * 模块间事件总线 - 七大模块解耦通信
 */
import { ModuleEvent, ModuleEventHandler, ModuleEventPayload } from '../types/CommonTypes';
import { Logger } from './Logger';

export class EventBus {
  private static instance: EventBus;
  private handlers: Map<ModuleEvent, ModuleEventHandler[]> = new Map();
  private failedHandlers: Set<ModuleEventHandler> = new Set();

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe(event: ModuleEvent, handler: ModuleEventHandler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  unsubscribe(event: ModuleEvent, handler: ModuleEventHandler): void {
    const list = this.handlers.get(event);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
      if (list.length === 0) {
        this.handlers.delete(event);
      }
    }
    this.failedHandlers.delete(handler);
  }

  publish(payload: ModuleEventPayload): void {
    const list = this.handlers.get(payload.event);
    if (!list) {
      return;
    }
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const handler = snapshot[i];
      if (this.failedHandlers.has(handler)) {
        continue;
      }
      try {
        handler(payload);
      } catch (e) {
        Logger.error('EventBus', `Handler failed for ${payload.event}: ${e}`);
        this.failedHandlers.add(handler);
      }
    }
  }

  async publishAsync(payload: ModuleEventPayload): Promise<void> {
    const list = this.handlers.get(payload.event);
    if (!list) {
      return;
    }
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const handler = snapshot[i];
      if (this.failedHandlers.has(handler)) {
        continue;
      }
      try {
        handler(payload);
      } catch (e) {
        Logger.error('EventBus', `Async handler failed for ${payload.event}: ${e}`);
        this.failedHandlers.add(handler);
      }
    }
  }

  clearFailedHandlers(): void {
    this.failedHandlers.clear();
  }

  clear(): void {
    this.handlers.clear();
    this.failedHandlers.clear();
  }
}
