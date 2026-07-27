import { emptyRequirementSpec, emptySchTopology, mapAwareStringify, mapAwareParse } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceSelectResult, PlacementResult, RouteResult, RequirementSpec, ClarificationAnswer, ClarificationQuestion, MatchedDevice, LayoutLlmOutput, RoutingLlmOutput, DeviceSelectLlmOutput } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { canSkipStage, stageRank } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import type { AgentStageId } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
/** 可序列化快照（澄清后续跑 / Phase2 跳过已完成阶段） */
export interface BlackboardSnapshot {
    runId: string;
    userPrompt: string;
    stageCompleted: string;
    /** 已完成阶段列表（可表达部分完成） */
    completedStages: string[];
    clarificationAnswers: ClarificationAnswer[];
    clarificationQuestions: ClarificationQuestion[];
    requirementSpec: RequirementSpec;
    topologyJson: string;
    selectResultJson: string;
    selectLlmJson: string;
    selectLlmFromLlm: boolean;
    placementJson: string;
    layoutLlmJson: string;
    netPlanNotes: string;
    usedLlm: boolean;
    degradedMode: boolean;
    needsClarification: boolean;
    abortStage: string;
    abortReason: string;
    lastRequirementsError: string;
    trace: string[];
}
export class CircuitBlackboard {
    runId: string = '';
    userPrompt: string = '';
    clarificationAnswers: ClarificationAnswer[] = [];
    clarificationQuestions: ClarificationQuestion[] = [];
    requirementSpec: RequirementSpec = emptyRequirementSpec();
    selectResult: DeviceSelectResult | null = null;
    matchedDevices: MatchedDevice[] = [];
    selectLlmOutput: DeviceSelectLlmOutput | null = null;
    selectLlmFromLlm: boolean = false;
    layoutLlm: LayoutLlmOutput | null = null;
    placement: PlacementResult | null = null;
    routingLlm: RoutingLlmOutput | null = null;
    routeResult: RouteResult | null = null;
    topology: SchTopology = emptySchTopology();
    netPlanNotes: string = '';
    usedLlm: boolean = false;
    degradedMode: boolean = false;
    abortStage: string = '';
    abortReason: string = '';
    needsClarification: boolean = false;
    stageCompleted: string = '';
    completedStages: string[] = [];
    lastRequirementsError: string = '';
    trace: string[] = [];
    reset(runId: string, prompt: string, answers?: ClarificationAnswer[]): void {
        this.runId = runId;
        this.userPrompt = prompt;
        this.clarificationAnswers = answers ? answers.slice() : [];
        this.clarificationQuestions = [];
        this.requirementSpec = emptyRequirementSpec();
        this.selectResult = null;
        this.matchedDevices = [];
        this.selectLlmOutput = null;
        this.selectLlmFromLlm = false;
        this.layoutLlm = null;
        this.placement = null;
        this.routingLlm = null;
        this.routeResult = null;
        this.topology = emptySchTopology();
        this.netPlanNotes = '';
        this.usedLlm = false;
        this.degradedMode = false;
        this.abortStage = '';
        this.abortReason = '';
        this.needsClarification = false;
        this.stageCompleted = '';
        this.completedStages = [];
        this.lastRequirementsError = '';
        this.trace = [];
    }
    log(msg: string): void {
        this.trace.push(msg);
    }
    abort(stage: string, reason: string): void {
        this.abortStage = stage;
        this.abortReason = reason;
        this.log(`ABORT ${stage}: ${reason}`);
    }
    markStageDone(stage: string): void {
        this.stageCompleted = stage;
        if (this.completedStages.indexOf(stage) < 0) {
            this.completedStages.push(stage);
        }
        this.log(`stage_done=${stage}`);
    }
    /** skip 前：rank + 产物存在 */
    canSkip(target: AgentStageId): boolean {
        if (!canSkipStage(this.stageCompleted, target)) {
            return false;
        }
        if (target === 'requirements') {
            return this.requirementSpec.summary.length > 0 && !this.needsClarification;
        }
        if (target === 'select') {
            return !!this.selectResult && !!this.selectLlmOutput &&
                (this.selectResult.devices?.length ?? 0) > 0;
        }
        if (target === 'layout') {
            return !!this.placement && (this.placement.topology?.deviceList?.length ?? 0) > 0;
        }
        if (target === 'net') {
            return (this.topology?.netList?.length ?? 0) > 0 && !!this.placement;
        }
        if (target === 'route' || target === 'qa') {
            return (this.topology?.deviceList?.length ?? 0) > 0;
        }
        return stageRank(this.stageCompleted) >= stageRank(target);
    }
    toSnapshot(): BlackboardSnapshot {
        let selectResultJson = '';
        let selectLlmJson = '';
        let placementJson = '';
        let layoutLlmJson = '';
        try {
            if (this.selectResult) {
                selectResultJson = mapAwareStringify(this.selectResult);
            }
        }
        catch (_e) {
            selectResultJson = '';
        }
        try {
            if (this.selectLlmOutput) {
                selectLlmJson = mapAwareStringify(this.selectLlmOutput);
            }
        }
        catch (_e) {
            selectLlmJson = '';
        }
        try {
            if (this.placement) {
                placementJson = mapAwareStringify(this.placement);
            }
        }
        catch (_e) {
            placementJson = '';
        }
        try {
            if (this.layoutLlm) {
                layoutLlmJson = mapAwareStringify(this.layoutLlm);
            }
        }
        catch (_e) {
            layoutLlmJson = '';
        }
        const snap: BlackboardSnapshot = {
            runId: this.runId,
            userPrompt: this.userPrompt,
            stageCompleted: this.stageCompleted,
            completedStages: this.completedStages.slice(),
            clarificationAnswers: this.clarificationAnswers.slice(),
            clarificationQuestions: this.clarificationQuestions.slice(),
            requirementSpec: this.requirementSpec,
            topologyJson: mapAwareStringify(this.topology),
            selectResultJson: selectResultJson,
            selectLlmJson: selectLlmJson,
            selectLlmFromLlm: this.selectLlmFromLlm,
            placementJson: placementJson,
            layoutLlmJson: layoutLlmJson,
            netPlanNotes: this.netPlanNotes,
            usedLlm: this.usedLlm,
            degradedMode: this.degradedMode,
            needsClarification: this.needsClarification,
            abortStage: this.abortStage,
            abortReason: this.abortReason,
            lastRequirementsError: this.lastRequirementsError,
            trace: this.trace.slice()
        };
        return snap;
    }
    resumeFromSnapshot(snap: BlackboardSnapshot): string {
        this.runId = snap.runId;
        this.userPrompt = snap.userPrompt;
        this.stageCompleted = snap.stageCompleted;
        this.completedStages = snap.completedStages ? snap.completedStages.slice() : [];
        if (this.completedStages.length === 0 && snap.stageCompleted) {
            this.completedStages = [snap.stageCompleted];
        }
        this.clarificationAnswers = snap.clarificationAnswers.slice();
        this.clarificationQuestions = snap.clarificationQuestions.slice();
        this.requirementSpec = snap.requirementSpec;
        this.usedLlm = snap.usedLlm;
        this.degradedMode = !!snap.degradedMode;
        this.needsClarification = snap.needsClarification;
        this.abortStage = snap.abortStage ?? '';
        this.abortReason = snap.abortReason ?? '';
        this.lastRequirementsError = snap.lastRequirementsError ?? '';
        this.netPlanNotes = snap.netPlanNotes ?? '';
        this.trace = snap.trace.slice();
        this.selectLlmFromLlm = !!snap.selectLlmFromLlm;
        try {
            this.topology = mapAwareParse<SchTopology>(snap.topologyJson);
        }
        catch (_e) {
            this.topology = emptySchTopology();
        }
        if (snap.selectResultJson && snap.selectResultJson.length > 0) {
            try {
                this.selectResult = mapAwareParse<DeviceSelectResult>(snap.selectResultJson);
                this.matchedDevices = this.selectResult?.devices ?? [];
            }
            catch (_e) {
                this.selectResult = null;
                // parse 失败：回退 stage，禁止假 skip
                if (stageRank(this.stageCompleted) >= stageRank('select')) {
                    this.stageCompleted = 'requirements';
                    this.completedStages = this.completedStages.filter(s => stageRank(s) < stageRank('select'));
                }
            }
        }
        if (snap.selectLlmJson && snap.selectLlmJson.length > 0) {
            try {
                this.selectLlmOutput = mapAwareParse<DeviceSelectLlmOutput>(snap.selectLlmJson);
            }
            catch (_e) {
                this.selectLlmOutput = null;
            }
        }
        else {
            this.selectLlmOutput = null;
        }
        if (snap.placementJson && snap.placementJson.length > 0) {
            try {
                this.placement = mapAwareParse<PlacementResult>(snap.placementJson);
            }
            catch (_e) {
                this.placement = null;
            }
        }
        if (snap.layoutLlmJson && snap.layoutLlmJson.length > 0) {
            try {
                this.layoutLlm = mapAwareParse<LayoutLlmOutput>(snap.layoutLlmJson);
            }
            catch (_e) {
                this.layoutLlm = null;
            }
        }
        this.log(`resumeFromSnapshot stage=${snap.stageCompleted} hasSelectLlm=${!!this.selectLlmOutput}`);
        return snap.stageCompleted;
    }
}
