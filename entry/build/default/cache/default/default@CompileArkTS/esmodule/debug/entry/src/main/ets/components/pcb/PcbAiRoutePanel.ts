if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbAiRoutePanel_Params {
    statusMessage?: string;
    aiBusy?: boolean;
    aiProgress?: number;
    aiStage?: string;
    onRouteDone?: () => void;
    /** 确认层数时同步层栈 UI（与层栈 Tab 的 onSetCopperCount 同源） */
    onSetCopperCount?: (n: number) => void;
    apiSectionExpanded?: boolean;
    apiRefreshTick?: number;
    logs?: AiGenLogEntry[];
    logSeq?: number;
    enableReasoning?: boolean;
    showLayerConfirm?: boolean;
    boardCopperCount?: number;
    confirmCopperCount?: number;
    appService?: AppService;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { AiGenLogEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, ProgressInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { AiApiConfigSection } from "@bundle:com.elecdraw.aischsim/entry/ets/components/AiApiConfigSection";
import { ProteusClassicBtn, ProteusChipGrid } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
const COPPER_OPTIONS: number[] = [2, 4, 6, 8];
const COPPER_LABELS: string[] = ['2', '4', '6', '8'];
export class PcbAiRoutePanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__aiBusy = new SynchedPropertySimpleTwoWayPU(params.aiBusy, this, "aiBusy");
        this.__aiProgress = new SynchedPropertySimpleTwoWayPU(params.aiProgress, this, "aiProgress");
        this.__aiStage = new SynchedPropertySimpleTwoWayPU(params.aiStage, this, "aiStage");
        this.onRouteDone = () => { };
        this.onSetCopperCount = (_n: number) => { };
        this.__apiSectionExpanded = new ObservedPropertySimplePU(false, this, "apiSectionExpanded");
        this.__apiRefreshTick = new ObservedPropertySimplePU(0, this, "apiRefreshTick");
        this.__logs = new ObservedPropertyObjectPU([], this, "logs");
        this.__logSeq = new ObservedPropertySimplePU(0, this, "logSeq");
        this.__enableReasoning = new ObservedPropertySimplePU(false, this, "enableReasoning");
        this.__showLayerConfirm = new ObservedPropertySimplePU(false, this, "showLayerConfirm");
        this.__boardCopperCount = new ObservedPropertySimplePU(2, this, "boardCopperCount");
        this.__confirmCopperCount = new ObservedPropertySimplePU(2, this, "confirmCopperCount");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbAiRoutePanel_Params) {
        if (params.onRouteDone !== undefined) {
            this.onRouteDone = params.onRouteDone;
        }
        if (params.onSetCopperCount !== undefined) {
            this.onSetCopperCount = params.onSetCopperCount;
        }
        if (params.apiSectionExpanded !== undefined) {
            this.apiSectionExpanded = params.apiSectionExpanded;
        }
        if (params.apiRefreshTick !== undefined) {
            this.apiRefreshTick = params.apiRefreshTick;
        }
        if (params.logs !== undefined) {
            this.logs = params.logs;
        }
        if (params.logSeq !== undefined) {
            this.logSeq = params.logSeq;
        }
        if (params.enableReasoning !== undefined) {
            this.enableReasoning = params.enableReasoning;
        }
        if (params.showLayerConfirm !== undefined) {
            this.showLayerConfirm = params.showLayerConfirm;
        }
        if (params.boardCopperCount !== undefined) {
            this.boardCopperCount = params.boardCopperCount;
        }
        if (params.confirmCopperCount !== undefined) {
            this.confirmCopperCount = params.confirmCopperCount;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
    }
    updateStateVars(params: PcbAiRoutePanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__aiBusy.purgeDependencyOnElmtId(rmElmtId);
        this.__aiProgress.purgeDependencyOnElmtId(rmElmtId);
        this.__aiStage.purgeDependencyOnElmtId(rmElmtId);
        this.__apiSectionExpanded.purgeDependencyOnElmtId(rmElmtId);
        this.__apiRefreshTick.purgeDependencyOnElmtId(rmElmtId);
        this.__logs.purgeDependencyOnElmtId(rmElmtId);
        this.__logSeq.purgeDependencyOnElmtId(rmElmtId);
        this.__enableReasoning.purgeDependencyOnElmtId(rmElmtId);
        this.__showLayerConfirm.purgeDependencyOnElmtId(rmElmtId);
        this.__boardCopperCount.purgeDependencyOnElmtId(rmElmtId);
        this.__confirmCopperCount.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__aiBusy.aboutToBeDeleted();
        this.__aiProgress.aboutToBeDeleted();
        this.__aiStage.aboutToBeDeleted();
        this.__apiSectionExpanded.aboutToBeDeleted();
        this.__apiRefreshTick.aboutToBeDeleted();
        this.__logs.aboutToBeDeleted();
        this.__logSeq.aboutToBeDeleted();
        this.__enableReasoning.aboutToBeDeleted();
        this.__showLayerConfirm.aboutToBeDeleted();
        this.__boardCopperCount.aboutToBeDeleted();
        this.__confirmCopperCount.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __aiBusy: SynchedPropertySimpleTwoWayPU<boolean>;
    get aiBusy() {
        return this.__aiBusy.get();
    }
    set aiBusy(newValue: boolean) {
        this.__aiBusy.set(newValue);
    }
    private __aiProgress: SynchedPropertySimpleTwoWayPU<number>;
    get aiProgress() {
        return this.__aiProgress.get();
    }
    set aiProgress(newValue: number) {
        this.__aiProgress.set(newValue);
    }
    private __aiStage: SynchedPropertySimpleTwoWayPU<string>;
    get aiStage() {
        return this.__aiStage.get();
    }
    set aiStage(newValue: string) {
        this.__aiStage.set(newValue);
    }
    private onRouteDone: () => void;
    /** 确认层数时同步层栈 UI（与层栈 Tab 的 onSetCopperCount 同源） */
    private onSetCopperCount: (n: number) => void;
    private __apiSectionExpanded: ObservedPropertySimplePU<boolean>;
    get apiSectionExpanded() {
        return this.__apiSectionExpanded.get();
    }
    set apiSectionExpanded(newValue: boolean) {
        this.__apiSectionExpanded.set(newValue);
    }
    private __apiRefreshTick: ObservedPropertySimplePU<number>;
    get apiRefreshTick() {
        return this.__apiRefreshTick.get();
    }
    set apiRefreshTick(newValue: number) {
        this.__apiRefreshTick.set(newValue);
    }
    private __logs: ObservedPropertyObjectPU<AiGenLogEntry[]>;
    get logs() {
        return this.__logs.get();
    }
    set logs(newValue: AiGenLogEntry[]) {
        this.__logs.set(newValue);
    }
    private __logSeq: ObservedPropertySimplePU<number>;
    get logSeq() {
        return this.__logSeq.get();
    }
    set logSeq(newValue: number) {
        this.__logSeq.set(newValue);
    }
    /** 与原理图 AiSettingsPanel 共用 AppService.aiEnableReasoning */
    private __enableReasoning: ObservedPropertySimplePU<boolean>;
    get enableReasoning() {
        return this.__enableReasoning.get();
    }
    set enableReasoning(newValue: boolean) {
        this.__enableReasoning.set(newValue);
    }
    private __showLayerConfirm: ObservedPropertySimplePU<boolean>;
    get showLayerConfirm() {
        return this.__showLayerConfirm.get();
    }
    set showLayerConfirm(newValue: boolean) {
        this.__showLayerConfirm.set(newValue);
    }
    /** 弹窗内当前板铜层（展示用） */
    private __boardCopperCount: ObservedPropertySimplePU<number>;
    get boardCopperCount() {
        return this.__boardCopperCount.get();
    }
    set boardCopperCount(newValue: number) {
        this.__boardCopperCount.set(newValue);
    }
    /** 弹窗内用户选择的目标铜层 */
    private __confirmCopperCount: ObservedPropertySimplePU<number>;
    get confirmCopperCount() {
        return this.__confirmCopperCount.get();
    }
    set confirmCopperCount(newValue: number) {
        this.__confirmCopperCount.set(newValue);
    }
    private appService: AppService;
    aboutToAppear(): void {
        this.apiRefreshTick++;
        this.enableReasoning = this.appService.aiEnableReasoning;
        this.appendLog('system', 'PCB AI route: place → net → layer → geometry → QA（与原理图共用 API / 推理开关）');
    }
    private appendLog(role: 'user' | 'assistant' | 'system', text: string): void {
        this.logSeq++;
        const entry: AiGenLogEntry = {
            id: `pcbai_${this.logSeq}_${Date.now()}`,
            role: role,
            text: text,
            ts: Date.now()
        };
        const next: AiGenLogEntry[] = this.logs.slice();
        next.push(entry);
        if (next.length > 80) {
            this.logs = next.slice(next.length - 80);
        }
        else {
            this.logs = next;
        }
    }
    /** 对齐原理图 handleAiGenProgress：阶段进度写入气泡，同阶段只更新百分比 */
    private appendProgressLog(p: ProgressInfo): void {
        if (p.stage.length === 0) {
            return;
        }
        const s = p.stage.trim();
        if (s === 'init' || s === 'done' || s.indexOf('Starting task') >= 0 || s.indexOf('Task complete') >= 0) {
            return;
        }
        const line = `[${p.progress}%] ${s}`;
        if (this.logs.length > 0) {
            const last = this.logs[this.logs.length - 1];
            if (last.role === 'assistant' && last.text.indexOf(`] ${s}`) >= 0) {
                const updated: AiGenLogEntry = {
                    id: last.id,
                    role: last.role,
                    text: line,
                    ts: Date.now()
                };
                const next = this.logs.slice(0, this.logs.length - 1);
                next.push(updated);
                this.logs = next;
                return;
            }
        }
        this.appendLog('assistant', line);
    }
    private bubbleBg(role: string): string {
        if (role === 'user') {
            return '#2B6CB0';
        }
        if (role === 'system') {
            return ProteusColors.INPUT_READONLY_BG;
        }
        return ProteusColors.CANVAS_BG;
    }
    private bubbleFg(role: string): string {
        if (role === 'user') {
            return '#FFFFFF';
        }
        return ProteusColors.TEXT_PRIMARY;
    }
    private toggleReasoning(): void {
        this.enableReasoning = !this.enableReasoning;
        this.appService.aiEnableReasoning = this.enableReasoning;
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] enableReasoning=${this.enableReasoning}`);
        this.statusMessage = this.enableReasoning
            ? '已开启推理：布局/网络/层角色/几何/QA 允许 thinking，并隔离 JSON（较慢）'
            : '已关闭推理（默认，利于纯 JSON）';
        this.appendLog('system', this.enableReasoning
            ? '推理开 · 深度思考模式（与原理图 AI 共用）'
            : '推理关 · 纯 JSON 模式');
    }
    private normalizeCopperChoice(n: number): number {
        if (n === 4 || n === 6 || n === 8) {
            return n;
        }
        return 2;
    }
    private copperSelectedIdx(): number {
        for (let i = 0; i < COPPER_OPTIONS.length; i++) {
            if (COPPER_OPTIONS[i] === this.confirmCopperCount) {
                return i;
            }
        }
        return 0;
    }
    /** 点「开始」：先弹层数确认；busy 时走取消 */
    private onStartClicked(): void {
        if (this.aiBusy) {
            void this.runAiRoute();
            return;
        }
        this.openLayerConfirm();
    }
    private openLayerConfirm(): void {
        const cur = this.appService.pcbEditor.getLayerStackCopperCount();
        this.boardCopperCount = cur;
        this.confirmCopperCount = this.normalizeCopperChoice(cur);
        this.showLayerConfirm = true;
        this.appendLog('system', `确认布线铜层（当前 ${cur}）…`);
    }
    private cancelLayerConfirm(): void {
        this.showLayerConfirm = false;
        this.appendLog('system', '已取消：未启动 AI 布线');
        this.statusMessage = '已取消 AI 布线';
    }
    private confirmLayerAndStart(): void {
        const target = this.normalizeCopperChoice(this.confirmCopperCount);
        const prev = this.boardCopperCount;
        this.showLayerConfirm = false;
        if (target !== prev) {
            this.onSetCopperCount(target);
            this.appendLog('system', `铜层确认：${prev}→${target}`);
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] copper confirm ${prev}→${target}`);
        }
        else {
            this.appendLog('system', `铜层确认：保持 ${target} 层`);
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] copper confirm keep ${target}`);
        }
        this.statusMessage = `AI 布线铜层：${target}`;
        void this.runAiRoute(target);
    }
    private async runAiRoute(confirmedCopper?: number): Promise<void> {
        if (this.aiBusy) {
            this.appService.cancelAiGenerate();
            this.appendLog('system', 'cancel requested');
            return;
        }
        const apis: AiApiConfig[] = this.appService.aiApiManager.listApis();
        if (apis.length === 0) {
            this.statusMessage = 'Please configure AI API first';
            this.apiSectionExpanded = true;
            this.appendLog('system', 'No API config — expand API section');
            return;
        }
        this.enableReasoning = this.appService.aiEnableReasoning;
        const cu = confirmedCopper !== undefined
            ? confirmedCopper
            : this.appService.pcbEditor.getLayerStackCopperCount();
        this.aiBusy = true;
        this.aiProgress = 0;
        this.aiStage = 'placement';
        this.appendLog('user', `Start PCB AI route · Cu=${cu} · ${this.enableReasoning ? '推理开' : '推理关'}`);
        this.appendLog('system', `开始 PCB AI 布线 · Cu=${cu} · 画布已锁定（place→net→layer→geometry→QA）` +
            ` · ${this.enableReasoning ? '深度思考' : '无 thinking'} · QA 仍可自动加层`);
        this.appendLog('assistant', '正在准备布局与布线…');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] run start Cu=${cu} reasoning=${this.enableReasoning}`);
        const prevProgress: (p: ProgressInfo) => void = this.appService.onAiProgress;
        this.appService.onAiProgress = (p: ProgressInfo): void => {
            this.aiProgress = p.progress;
            this.aiStage = p.stage;
            this.appendProgressLog(p);
            prevProgress(p);
        };
        try {
            const ok: boolean = await this.appService.aiPcbAutoRoute();
            const detail = this.statusMessage.trim();
            if (ok) {
                this.appendLog('assistant', detail.length > 0 ? detail : 'Done: placement + multilayer tracks/vias applied');
                this.appendLog('system', '画布已解锁 · 板铜已写回');
                if (detail.length === 0) {
                    this.statusMessage = 'PCB AI route done';
                }
                this.onRouteDone();
            }
            else {
                this.appendLog('system', detail.length > 0
                    ? `Failed: ${detail}（board unchanged）`
                    : 'Failed: board unchanged (see [AI_PCB] logs)');
                this.appendLog('system', '画布已解锁 · 板未改动');
                if (detail.length === 0) {
                    this.statusMessage = 'PCB AI route failed (board unchanged)';
                }
            }
        }
        finally {
            this.appService.onAiProgress = prevProgress;
            this.aiBusy = this.appService.isAiGenerating();
            if (!this.aiBusy) {
                this.aiProgress = 100;
                this.aiStage = '';
            }
            this.apiRefreshTick++;
        }
    }
    private layerConfirmDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#99000000');
            Column.hitTestBehavior(HitTestMode.Default);
            Column.onClick(() => {
                // 点击遮罩不关闭，避免误触；仅按钮可取消
            });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 10 });
            Column.width('88%');
            Column.padding({ left: 14, right: 14, top: 14, bottom: 14 });
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#44000000', offsetX: 0, offsetY: 2 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('确认布线铜层数');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`当前板：${this.boardCopperCount} 层铜`);
            Text.fontSize(11);
            Text.fontColor(ProteusColors.SELECTED);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('请选择本次 AI 布线使用的铜层数：');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipGrid(this, {
                        labels: COPPER_LABELS,
                        selectedIdx: this.copperSelectedIdx(),
                        colsPerRow: 4,
                        onSelect: (idx: number) => {
                            if (idx >= 0 && idx < COPPER_OPTIONS.length) {
                                this.confirmCopperCount = COPPER_OPTIONS[idx];
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 264, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            labels: COPPER_LABELS,
                            selectedIdx: this.copperSelectedIdx(),
                            colsPerRow: 4,
                            onSelect: (idx: number) => {
                                if (idx >= 0 && idx < COPPER_OPTIONS.length) {
                                    this.confirmCopperCount = COPPER_OPTIONS[idx];
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        labels: COPPER_LABELS,
                        selectedIdx: this.copperSelectedIdx(),
                        colsPerRow: 4
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('失败时 QA 仍可能自动加层（如 2→4）。');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => { this.cancelLayerConfirm(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 281, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => { this.cancelLayerConfirm(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '取消',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '确认并开始',
                        widthVal: '48%',
                        onAction: () => { this.confirmLayerAndStart(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 286, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '确认并开始',
                            widthVal: '48%',
                            onAction: () => { this.confirmLayerAndStart(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '确认并开始',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 10, right: 8, top: 8, bottom: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('AI 布线');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiBusy) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.aiProgress}%`);
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.margin({ right: 8 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.apiSectionExpanded ? 'API' : 'API');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.padding({ left: 6, right: 6, top: 4, bottom: 4 });
            Text.onClick(() => {
                this.apiSectionExpanded = !this.apiSectionExpanded;
                if (this.apiSectionExpanded) {
                    this.apiRefreshTick++;
                }
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiBusy) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('取消');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.ERC_ERR);
                        Text.padding({ left: 8, right: 4, top: 4, bottom: 4 });
                        Text.onClick(() => {
                            this.appService.cancelAiGenerate();
                        });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiBusy) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.aiStage.length > 0
                            ? `${this.aiStage} · 画布已锁定` +
                                (this.enableReasoning ? ' · 深度思考中' : '')
                            : '画布已锁定，禁止手动编辑');
                        Text.fontSize(9);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                        Text.padding({ left: 10, right: 8, bottom: 4 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.apiSectionExpanded) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new AiApiConfigSection(this, {
                                    statusMessage: this.__statusMessage,
                                    refreshTick: this.apiRefreshTick
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 362, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        statusMessage: this.statusMessage,
                                        refreshTick: this.apiRefreshTick
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    refreshTick: this.apiRefreshTick
                                });
                            }
                        }, { name: "AiApiConfigSection" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                    }, Divider);
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create({ space: 6 });
            List.layoutWeight(1);
            List.width('100%');
            List.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const entry = _item;
                {
                    const itemCreation = (elmtId, isInitialRender) => {
                        ViewStackProcessor.StartGetAccessRecordingFor(elmtId);
                        ListItem.create(deepRenderFunction, true);
                        if (!isInitialRender) {
                            ListItem.pop();
                        }
                        ViewStackProcessor.StopGetAccessRecording();
                    };
                    const itemCreation2 = (elmtId, isInitialRender) => {
                        ListItem.create(deepRenderFunction, true);
                    };
                    const deepRenderFunction = (elmtId, isInitialRender) => {
                        itemCreation(elmtId, isInitialRender);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Column.create();
                            Column.width(entry.role === 'user' ? '88%' : '100%');
                            Column.padding({ left: 8, right: 8, top: 6, bottom: 6 });
                            Column.backgroundColor(this.bubbleBg(entry.role));
                            Column.border({
                                width: 1,
                                color: entry.role === 'assistant' ? ProteusColors.DIVIDER : 'transparent'
                            });
                            Column.alignSelf(entry.role === 'user' ? ItemAlign.End : ItemAlign.Start);
                        }, Column);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(entry.role === 'user' ? '你' : (entry.role === 'system' ? '系统' : 'AI'));
                            Text.fontSize(9);
                            Text.fontColor(ProteusColors.TEXT_SECONDARY);
                            Text.width('100%');
                            Text.textAlign(entry.role === 'user' ? TextAlign.End : TextAlign.Start);
                        }, Text);
                        Text.pop();
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(entry.text);
                            Text.fontSize(10);
                            Text.fontColor(this.bubbleFg(entry.role));
                            Text.fontFamily('monospace');
                            Text.width('100%');
                        }, Text);
                        Text.pop();
                        Column.pop();
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.logs, forEachItemGenFunction, (entry: AiGenLogEntry) => entry.id, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 6, bottom: 10 });
            Column.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('当前 PCB：AI 布局封装后多层布线与过孔。失败不改板。');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.enableReasoning ? '● 推理开' : '○ 推理关');
            Text.fontSize(10);
            Text.fontColor(this.enableReasoning ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 4, right: 8, top: 4, bottom: 4 });
            Text.enabled(!this.aiBusy);
            Text.onClick(() => {
                if (!this.aiBusy) {
                    this.toggleReasoning();
                }
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('严格质量 · 禁残留交付');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.ERC_OK);
            Text.padding({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.enableReasoning ? '深度思考中（较慢）' : '难板可开推理');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        Row.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.aiBusy ? '布线中…' : '开始 AI 布线',
                        widthVal: '100%',
                        onAction: () => { this.onStartClicked(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 427, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.aiBusy ? '布线中…' : '开始 AI 布线',
                            widthVal: '100%',
                            onAction: () => { this.onStartClicked(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.aiBusy ? '布线中…' : '开始 AI 布线',
                        widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清空日志',
                        widthVal: '100%',
                        onAction: () => {
                            this.logs = [];
                            this.appendLog('system', '日志已清空');
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbAiRoutePanel.ets", line: 432, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空日志',
                            widthVal: '100%',
                            onAction: () => {
                                this.logs = [];
                                this.appendLog('system', '日志已清空');
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清空日志',
                        widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Column.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showLayerConfirm) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.layerConfirmDialog.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
