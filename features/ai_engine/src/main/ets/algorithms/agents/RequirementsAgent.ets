/**
 * RequirementsAgent — 需求理解 + 必要时澄清 + 答案门禁
 */
import {
  AiCapability, ClarificationAnswer, ClarificationQuestion, RequirementSpec,
  emptyRequirementSpec, Logger, INSTR_TRACE_TAG, ErrCode
} from 'common';
import { IAiApiManager, ChatOptions } from 'ai_api_manager';
import { IComponentLibrary } from 'component_library';
import { PromptLoader } from '../../prompts/PromptLoader';
import { CircuitBlackboard } from './CircuitBlackboard';

export interface RequirementsAgentResult {
  ok: boolean;
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  spec: RequirementSpec;
  usedLlm: boolean;
  error?: string;
}

interface RequirementParseResult {
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  spec: RequirementSpec;
}

interface EnforceAnswersResult {
  ok: boolean;
  spec: RequirementSpec;
  reason: string;
}

export class RequirementsAgent {
  private apiManager: IAiApiManager;
  private library: IComponentLibrary;

  constructor(apiManager: IAiApiManager, library: IComponentLibrary) {
    this.apiManager = apiManager;
    this.library = library;
  }

  async run(bb: CircuitBlackboard, isCancel?: () => boolean): Promise<RequirementsAgentResult> {
    const digest = this.buildLibraryDigest();
    const answersText = this.formatAnswers(bb.clarificationAnswers, bb.clarificationQuestions);
    const hasAnswers = (bb.clarificationAnswers?.length ?? 0) > 0;
    const tpl = PromptLoader.load('requirement');
    const prompt = PromptLoader.render(tpl, [
      { key: 'user_prompt', value: bb.userPrompt },
      { key: 'clarification_answers', value: answersText },
      { key: 'library_digest', value: digest }
    ]);

    if (isCancel && isCancel()) {
      const cancelled: RequirementsAgentResult = {
        ok: false, needsClarification: false, questions: [],
        spec: emptyRequirementSpec(), usedLlm: false, error: 'cancelled'
      };
      return cancelled;
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] stage=requirements from LLM promptLen=${prompt.length} hasAnswers=${hasAnswers}`);
    // JSON 契约阶段强制关 thinking，避免污染正文
    const chatOpts: ChatOptions = {
      capability: AiCapability.COMPONENT_RECOMMEND,
      temperature: 0.15,
      maxTokens: 4096,
      disableThinking: true
    };
    const api = await this.apiManager.chat(prompt, chatOpts);
    if (!api.success || !api.data) {
      const fail: RequirementsAgentResult = {
        ok: false, needsClarification: false, questions: [],
        spec: emptyRequirementSpec(), usedLlm: false,
        error: api.error ?? `LLM fail code=${api.errCode ?? ErrCode.ERR_API_TIMEOUT}`
      };
      return fail;
    }

    bb.usedLlm = true;
    const parsed = RequirementsAgent.parseResponse(api.data, bb.userPrompt, hasAnswers);
    if (!parsed) {
      const parseFail: RequirementsAgentResult = {
        ok: false, needsClarification: false, questions: [],
        spec: emptyRequirementSpec(), usedLlm: true,
        error: 'requirement JSON 无法解析或门禁拒绝'
      };
      return parseFail;
    }
    if (parsed.needsClarification) {
      if (hasAnswers) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_AGENT] requirements rejected re-Ask after answers');
        const reAskFail: RequirementsAgentResult = {
          ok: false, needsClarification: false, questions: [],
          spec: emptyRequirementSpec(), usedLlm: true,
          error: '已有澄清答案时禁止再次追问'
        };
        return reAskFail;
      }
      bb.needsClarification = true;
      bb.clarificationQuestions = parsed.questions;
      const clarify: RequirementsAgentResult = {
        ok: true, needsClarification: true, questions: parsed.questions,
        spec: emptyRequirementSpec(), usedLlm: true
      };
      return clarify;
    }

    // 答案门禁：强制电源等与 choice 一致
    const gated = RequirementsAgent.enforceAnswersOnSpec(
      parsed.spec, bb.clarificationAnswers, bb.clarificationQuestions);
    if (!gated.ok) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_AGENT] requirements answer gate FAIL | ${gated.reason}`);
      const gateFail: RequirementsAgentResult = {
        ok: false, needsClarification: false, questions: [],
        spec: emptyRequirementSpec(), usedLlm: true,
        error: gated.reason
      };
      return gateFail;
    }

    bb.needsClarification = false;
    bb.requirementSpec = gated.spec;
    bb.log(`requirements ok modules=${gated.spec.modules.length}` +
      ` rails=${gated.spec.power.rails.join('/')}` +
      ` hint=${gated.spec.power.voltageHint ?? '-'}`);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] requirements ok rails=${gated.spec.power.rails.join(',')}` +
      ` hint=${gated.spec.power.voltageHint ?? '-'} instruments=${gated.spec.instruments.join(',')}`);
    const ok: RequirementsAgentResult = {
      ok: true, needsClarification: false, questions: [],
      spec: gated.spec, usedLlm: true
    };
    return ok;
  }

  private buildLibraryDigest(): string {
    const cats = this.library.getCategories();
    const lines: string[] = [];
    for (let i = 0; i < cats.length && i < 24; i++) {
      const page = this.library.listByCategory(cats[i], 1, 8);
      const ids = page.items.map(it => it.id).slice(0, 8).join(',');
      lines.push(`${cats[i]}: n≈${page.total ?? page.items.length} sample=[${ids}]`);
    }
    lines.push('instruments: VOLTMETER_DC,AMMETER_DC,OSCILLOSCOPE,VIRTUAL_METER,SIGNAL_GEN,LOGIC_ANALYZER,POWER_METER');
    return lines.join('\n');
  }

  /** 展开 choice 为选项原文，避免 LLM 只看到 A 却不知含义 */
  private formatAnswers(answers: ClarificationAnswer[],
    questions: ClarificationQuestion[]): string {
    if (!answers || answers.length === 0) {
      return '(无)';
    }
    const parts: string[] = [];
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      const free = (a.freeText ?? '').trim();
      let choiceText = '';
      if (a.choice) {
        const q = RequirementsAgent.findQuestion(questions, a.questionId);
        if (q) {
          if (a.choice === 'A') {
            choiceText = q.optionA;
          } else if (a.choice === 'B') {
            choiceText = q.optionB;
          } else if (a.choice === 'C') {
            choiceText = q.optionC;
          }
        }
        choiceText = choiceText.length > 0
          ? `choice=${a.choice}「${choiceText}」`
          : `choice=${a.choice}`;
      }
      const body = free.length > 0
        ? (choiceText.length > 0 ? `${choiceText}; free=${free}` : free)
        : choiceText;
      parts.push(`${a.questionId}:${body}`);
    }
    return parts.join('\n');
  }

  static parseResponse(raw: string, userPrompt: string = '',
    hasAnswers: boolean = false): RequirementParseResult | null {
    let text = raw.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return null;
    }
    text = text.substring(start, end + 1);
    try {
      const obj = JSON.parse(text) as Record<string, Object>;
      const status = String(obj['status'] ?? '');
      if (status === 'need_clarification') {
        if (hasAnswers) {
          return null;
        }
        const qsRaw = obj['questions'];
        const questions: ClarificationQuestion[] = [];
        if (qsRaw instanceof Array) {
          for (let i = 0; i < qsRaw.length && i < 3; i++) {
            const q = qsRaw[i] as Record<string, Object>;
            const cq: ClarificationQuestion = {
              id: String(q['id'] ?? `q${i + 1}`),
              prompt: String(q['prompt'] ?? ''),
              optionA: String(q['optionA'] ?? q['option_a'] ?? ''),
              optionB: String(q['optionB'] ?? q['option_b'] ?? ''),
              optionC: String(q['optionC'] ?? q['option_c'] ?? '')
            };
            if (cq.prompt.length > 0 &&
              (cq.optionA.length > 0 || cq.optionB.length > 0 || cq.optionC.length > 0) &&
              RequirementsAgent.isAllowedClarification(cq, userPrompt)) {
              questions.push(cq);
            } else if (cq.prompt.length > 0) {
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_AGENT] requirements drop frivolous Ask | ${cq.prompt.substring(0, 40)}`);
            }
          }
        }
        if (questions.length === 0) {
          // 全是没事找事 → 当作解析失败，逼重试 ok
          Logger.warn(INSTR_TRACE_TAG,
            '[AI_AGENT] requirements Ask emptied by gate — force retry for status=ok');
          return null;
        }
        const clarifyOut: RequirementParseResult = {
          needsClarification: true,
          questions: questions,
          spec: emptyRequirementSpec()
        };
        return clarifyOut;
      }
      const req = obj['requirement'] as Record<string, Object> | undefined;
      if (!req) {
        return null;
      }
      const power = (req['power'] as Record<string, Object>) ?? {};
      const railsRaw = power['rails'];
      const rails: string[] = [];
      if (railsRaw instanceof Array) {
        for (let i = 0; i < railsRaw.length; i++) {
          rails.push(String(railsRaw[i]).toUpperCase());
        }
      }
      const voltageHint = power['voltageHint'] !== undefined
        ? String(power['voltageHint']) : undefined;
      const spec: RequirementSpec = emptyRequirementSpec();
      spec.summary = String(req['summary'] ?? '');
      spec.modules = RequirementsAgent.strArr(req['modules']);
      spec.power.rails = rails;
      if (voltageHint !== undefined) {
        spec.power.voltageHint = voltageHint;
      }
      spec.needsMcu = !!req['needsMcu'];
      spec.instruments = RequirementsAgent.strArr(req['instruments']);
      spec.measureGoals = RequirementsAgent.strArr(req['measureGoals']);
      spec.constraints = RequirementsAgent.strArr(req['constraints']);
      spec.oodHints = RequirementsAgent.strArr(req['oodHints']);
      spec.openQuestions = RequirementsAgent.strArr(req['openQuestions']);
      if (spec.summary.length === 0 && spec.modules.length === 0) {
        return null;
      }
      const okOut: RequirementParseResult = {
        needsClarification: false,
        questions: [],
        spec: spec
      };
      return okOut;
    } catch (_e) {
      return null;
    }
  }

  /**
   * 允许的追问：电源形态；用户原文含糊的 MCU。
   * 禁止：型号选型、空泛保护/滤波。
   */
  static isAllowedClarification(q: ClarificationQuestion, userPrompt: string): boolean {
    const p = `${q.prompt}${q.optionA}${q.optionB}${q.optionC}`.toLowerCase();
    if (/型号|explicitmodel|libdevid|lm358|tl082|ua741|选哪/.test(p)) {
      return false;
    }
    if (/保护|滤波|限流/.test(p) && !/保护|滤波|限流/.test(userPrompt)) {
      return false;
    }
    // 电源相关保留
    if (/电源|电压|单电源|双电源|vee|±|5v|12v/.test(p)) {
      return true;
    }
    // MCU 仅当用户完全未提 MCU/单片机/stm/8051
    if (/mcu|单片机|微控/.test(p)) {
      return !/mcu|单片机|stm32|8051|arduino/.test(userPrompt.toLowerCase());
    }
    // 其它一律视为没事找事
    return false;
  }

  /**
   * 按澄清答案强制改写 power / constraints；冲突则失败。
   */
  static enforceAnswersOnSpec(specIn: RequirementSpec, answers: ClarificationAnswer[],
    questions: ClarificationQuestion[]): EnforceAnswersResult {
    const spec: RequirementSpec = emptyRequirementSpec();
    spec.summary = specIn.summary;
    spec.modules = specIn.modules.slice();
    spec.power.rails = specIn.power.rails.slice();
    if (specIn.power.voltageHint !== undefined) {
      spec.power.voltageHint = specIn.power.voltageHint;
    }
    spec.needsMcu = specIn.needsMcu;
    spec.instruments = specIn.instruments.slice();
    spec.measureGoals = specIn.measureGoals.slice();
    spec.constraints = specIn.constraints.slice();
    spec.oodHints = specIn.oodHints.slice();
    spec.openQuestions = [];

    if (!answers || answers.length === 0) {
      const outOk: EnforceAnswersResult = {
        ok: true, spec: spec, reason: ''
      };
      return outOk;
    }

    let singleSupply = false;
    let dualSupply = false;
    let voltageFromAnswer = '';
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      const q = RequirementsAgent.findQuestion(questions, a.questionId);
      let text = (a.freeText ?? '').trim();
      if (a.choice && q) {
        const opt = a.choice === 'A' ? q.optionA
          : (a.choice === 'B' ? q.optionB : q.optionC);
        text = `${text} ${opt}`.trim();
      }
      const low = text.toLowerCase();
      if (/双电源|±\s*12|±12|\+\/\-12|vee/.test(low) || /±/.test(text)) {
        dualSupply = true;
        if (/12/.test(low)) {
          voltageFromAnswer = '±12V';
        } else if (/5/.test(low)) {
          voltageFromAnswer = '±5V';
        } else {
          voltageFromAnswer = '±12V';
        }
      } else if (/单电源/.test(low) ||
        (low.indexOf('5v') >= 0 && low.indexOf('±') < 0 && low.indexOf('12') < 0)) {
        singleSupply = true;
        voltageFromAnswer = '5V';
      } else if (/3\.3\s*v|3\.3v/.test(low) && low.indexOf('±') < 0) {
        singleSupply = true;
        voltageFromAnswer = '3.3V';
      }
      // 型号答案 → 约束（非 lib 强制，给 Select 提示）
      if (/lm358|tl082|ua741/.test(low)) {
        const m = low.match(/lm358|tl082|ua741/);
        if (m) {
          const pref = `preferOpAmp=${m[0].toUpperCase()}`;
          if (spec.constraints.indexOf(pref) < 0) {
            spec.constraints.push(pref);
          }
        }
      }
      if (/需要/.test(text) && /保护|滤波|限流/.test(text)) {
        if (spec.constraints.indexOf('needProtection') < 0) {
          spec.constraints.push('needProtection');
        }
      }
    }

    if (singleSupply && dualSupply) {
      const conflict: EnforceAnswersResult = {
        ok: false, spec: emptyRequirementSpec(),
        reason: '澄清答案电源形态冲突（单/双同时命中）'
      };
      return conflict;
    }

    if (singleSupply) {
      spec.power.rails = ['VCC', 'GND'];
      spec.power.voltageHint = voltageFromAnswer || '5V';
      if (spec.constraints.indexOf('singleSupply') < 0) {
        spec.constraints.push('singleSupply');
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] requirements enforce singleSupply hint=${spec.power.voltageHint}`);
    } else if (dualSupply) {
      spec.power.rails = ['VCC', 'GND', 'VEE'];
      spec.power.voltageHint = voltageFromAnswer || '±12V';
      if (spec.constraints.indexOf('dualSupply') < 0) {
        spec.constraints.push('dualSupply');
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] requirements enforce dualSupply hint=${spec.power.voltageHint}`);
    }

    const out: EnforceAnswersResult = {
      ok: true, spec: spec, reason: ''
    };
    return out;
  }

  private static findQuestion(questions: ClarificationQuestion[],
    id: string): ClarificationQuestion | null {
    for (let i = 0; i < questions.length; i++) {
      if (questions[i].id === id) {
        return questions[i];
      }
    }
    return null;
  }

  private static strArr(v: Object | undefined): string[] {
    const out: string[] = [];
    if (v instanceof Array) {
      for (let i = 0; i < v.length; i++) {
        out.push(String(v[i]));
      }
    }
    return out;
  }
}
