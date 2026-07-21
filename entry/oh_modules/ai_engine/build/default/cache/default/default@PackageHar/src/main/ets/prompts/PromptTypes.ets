/**
 * Prompt 模板类型 — 与 skill/prompts 权威源对应
 */
export interface PromptTemplate {
  id: string;
  version: string;
  system: string;
  userTemplate: string;
}
