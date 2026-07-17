if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface AiSettingsPanel_Params {
    statusMessage?: string;
    aiGenerating?: boolean;
    aiProgress?: number;
    aiStage?: string;
    apiList?: AiApiConfig[];
    showAddForm?: boolean;
    apiSectionExpanded?: boolean;
    promptText?: string;
    logs?: AiGenLogEntry[];
    showStrategyDialog?: boolean;
    showModeDialog?: boolean;
    pendingStrategy?: AiGenerateStrategy;
    showSelfCheckDialog?: boolean;
    selfCheckSummary?: string;
    selfCheckCount?: number;
    newApiName?: string;
    newApiKey?: string;
    newApiModel?: string;
    newApiUrl?: string;
    newApiFormat?: string;
    newAuthField?: string;
    selectedProvider?: AiProviderType;
    apiFormatIdx?: number;
    appService?: AppService;
    providerIdx?: number;
    selectedStratIdx?: number;
    providers?: string[];
    providerTypes?: AiProviderType[];
    apiFormats?: ApiFormatOption[];
    loadBalanceLabels?: string[];
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { AiGenLogEntry, AiGenerateMode, AiGenerateStrategy } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { AiProviderType, LoadBalanceMode, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
interface ApiFormatOption {
    label: string;
    value: string;
}
export class AiSettingsPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__aiGenerating = new SynchedPropertySimpleTwoWayPU(params.aiGenerating, this, "aiGenerating");
        this.__aiProgress = new SynchedPropertySimpleTwoWayPU(params.aiProgress, this, "aiProgress");
        this.__aiStage = new SynchedPropertySimpleTwoWayPU(params.aiStage, this, "aiStage");
        this.__apiList = new ObservedPropertyObjectPU([], this, "apiList");
        this.__showAddForm = new ObservedPropertySimplePU(false, this, "showAddForm");
        this.__apiSectionExpanded = new ObservedPropertySimplePU(false, this, "apiSectionExpanded");
        this.__promptText = new ObservedPropertySimplePU('', this, "promptText");
        this.__logs = new ObservedPropertyObjectPU([], this, "logs");
        this.__showStrategyDialog = new ObservedPropertySimplePU(false, this, "showStrategyDialog");
        this.__showModeDialog = new ObservedPropertySimplePU(false, this, "showModeDialog");
        this.__pendingStrategy = new ObservedPropertySimplePU('oneshot', this, "pendingStrategy");
        this.__showSelfCheckDialog = new ObservedPropertySimplePU(false, this, "showSelfCheckDialog");
        this.__selfCheckSummary = new ObservedPropertySimplePU('', this, "selfCheckSummary");
        this.__selfCheckCount = new ObservedPropertySimplePU(0, this, "selfCheckCount");
        this.__newApiName = new ObservedPropertySimplePU('', this, "newApiName");
        this.__newApiKey = new ObservedPropertySimplePU('', this, "newApiKey");
        this.__newApiModel = new ObservedPropertySimplePU('', this, "newApiModel");
        this.__newApiUrl = new ObservedPropertySimplePU('', this, "newApiUrl");
        this.__newApiFormat = new ObservedPropertySimplePU('anthropic', this, "newApiFormat");
        this.__newAuthField = new ObservedPropertySimplePU('ANTHROPIC_AUTH_TOKEN', this, "newAuthField");
        this.__selectedProvider = new ObservedPropertySimplePU(AiProviderType.DEEPSEEK, this, "selectedProvider");
        this.__apiFormatIdx = new ObservedPropertySimplePU(0, this, "apiFormatIdx");
        this.appService = AppService.getInstance();
        this.providerIdx = 0;
        this.selectedStratIdx = 0;
        this.providers = ['DeepSeek', '通义千问', '豆包', 'OpenAI', 'Ollama', 'Claude', 'Gemini', '自定义'];
        this.providerTypes = [
            AiProviderType.DEEPSEEK, AiProviderType.QWEN, AiProviderType.DOUBAO,
            AiProviderType.OPENAI, AiProviderType.OLLAMA,
            AiProviderType.CLAUDE, AiProviderType.GEMINI, AiProviderType.CUSTOM
        ];
        this.apiFormats = [
            { label: 'Anthropic Messages (原生)', value: 'anthropic' },
            { label: 'OpenAI Chat Completions', value: 'openai' },
            { label: 'DeepSeek Chat', value: 'deepseek' },
            { label: 'Ollama (原生)', value: 'ollama' }
        ];
        this.loadBalanceLabels = ['优先级', '轮询', '故障切换'];
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: AiSettingsPanel_Params) {
        if (params.apiList !== undefined) {
            this.apiList = params.apiList;
        }
        if (params.showAddForm !== undefined) {
            this.showAddForm = params.showAddForm;
        }
        if (params.apiSectionExpanded !== undefined) {
            this.apiSectionExpanded = params.apiSectionExpanded;
        }
        if (params.promptText !== undefined) {
            this.promptText = params.promptText;
        }
        if (params.logs !== undefined) {
            this.logs = params.logs;
        }
        if (params.showStrategyDialog !== undefined) {
            this.showStrategyDialog = params.showStrategyDialog;
        }
        if (params.showModeDialog !== undefined) {
            this.showModeDialog = params.showModeDialog;
        }
        if (params.pendingStrategy !== undefined) {
            this.pendingStrategy = params.pendingStrategy;
        }
        if (params.showSelfCheckDialog !== undefined) {
            this.showSelfCheckDialog = params.showSelfCheckDialog;
        }
        if (params.selfCheckSummary !== undefined) {
            this.selfCheckSummary = params.selfCheckSummary;
        }
        if (params.selfCheckCount !== undefined) {
            this.selfCheckCount = params.selfCheckCount;
        }
        if (params.newApiName !== undefined) {
            this.newApiName = params.newApiName;
        }
        if (params.newApiKey !== undefined) {
            this.newApiKey = params.newApiKey;
        }
        if (params.newApiModel !== undefined) {
            this.newApiModel = params.newApiModel;
        }
        if (params.newApiUrl !== undefined) {
            this.newApiUrl = params.newApiUrl;
        }
        if (params.newApiFormat !== undefined) {
            this.newApiFormat = params.newApiFormat;
        }
        if (params.newAuthField !== undefined) {
            this.newAuthField = params.newAuthField;
        }
        if (params.selectedProvider !== undefined) {
            this.selectedProvider = params.selectedProvider;
        }
        if (params.apiFormatIdx !== undefined) {
            this.apiFormatIdx = params.apiFormatIdx;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.providerIdx !== undefined) {
            this.providerIdx = params.providerIdx;
        }
        if (params.selectedStratIdx !== undefined) {
            this.selectedStratIdx = params.selectedStratIdx;
        }
        if (params.providers !== undefined) {
            this.providers = params.providers;
        }
        if (params.providerTypes !== undefined) {
            this.providerTypes = params.providerTypes;
        }
        if (params.apiFormats !== undefined) {
            this.apiFormats = params.apiFormats;
        }
        if (params.loadBalanceLabels !== undefined) {
            this.loadBalanceLabels = params.loadBalanceLabels;
        }
    }
    updateStateVars(params: AiSettingsPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__aiGenerating.purgeDependencyOnElmtId(rmElmtId);
        this.__aiProgress.purgeDependencyOnElmtId(rmElmtId);
        this.__aiStage.purgeDependencyOnElmtId(rmElmtId);
        this.__apiList.purgeDependencyOnElmtId(rmElmtId);
        this.__showAddForm.purgeDependencyOnElmtId(rmElmtId);
        this.__apiSectionExpanded.purgeDependencyOnElmtId(rmElmtId);
        this.__promptText.purgeDependencyOnElmtId(rmElmtId);
        this.__logs.purgeDependencyOnElmtId(rmElmtId);
        this.__showStrategyDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__showModeDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__pendingStrategy.purgeDependencyOnElmtId(rmElmtId);
        this.__showSelfCheckDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__selfCheckSummary.purgeDependencyOnElmtId(rmElmtId);
        this.__selfCheckCount.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiName.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiKey.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiModel.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiUrl.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiFormat.purgeDependencyOnElmtId(rmElmtId);
        this.__newAuthField.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedProvider.purgeDependencyOnElmtId(rmElmtId);
        this.__apiFormatIdx.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__aiGenerating.aboutToBeDeleted();
        this.__aiProgress.aboutToBeDeleted();
        this.__aiStage.aboutToBeDeleted();
        this.__apiList.aboutToBeDeleted();
        this.__showAddForm.aboutToBeDeleted();
        this.__apiSectionExpanded.aboutToBeDeleted();
        this.__promptText.aboutToBeDeleted();
        this.__logs.aboutToBeDeleted();
        this.__showStrategyDialog.aboutToBeDeleted();
        this.__showModeDialog.aboutToBeDeleted();
        this.__pendingStrategy.aboutToBeDeleted();
        this.__showSelfCheckDialog.aboutToBeDeleted();
        this.__selfCheckSummary.aboutToBeDeleted();
        this.__selfCheckCount.aboutToBeDeleted();
        this.__newApiName.aboutToBeDeleted();
        this.__newApiKey.aboutToBeDeleted();
        this.__newApiModel.aboutToBeDeleted();
        this.__newApiUrl.aboutToBeDeleted();
        this.__newApiFormat.aboutToBeDeleted();
        this.__newAuthField.aboutToBeDeleted();
        this.__selectedProvider.aboutToBeDeleted();
        this.__apiFormatIdx.aboutToBeDeleted();
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
    private __aiGenerating: SynchedPropertySimpleTwoWayPU<boolean>;
    get aiGenerating() {
        return this.__aiGenerating.get();
    }
    set aiGenerating(newValue: boolean) {
        this.__aiGenerating.set(newValue);
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
    private __apiList: ObservedPropertyObjectPU<AiApiConfig[]>;
    get apiList() {
        return this.__apiList.get();
    }
    set apiList(newValue: AiApiConfig[]) {
        this.__apiList.set(newValue);
    }
    private __showAddForm: ObservedPropertySimplePU<boolean>;
    get showAddForm() {
        return this.__showAddForm.get();
    }
    set showAddForm(newValue: boolean) {
        this.__showAddForm.set(newValue);
    }
    private __apiSectionExpanded: ObservedPropertySimplePU<boolean>;
    get apiSectionExpanded() {
        return this.__apiSectionExpanded.get();
    }
    set apiSectionExpanded(newValue: boolean) {
        this.__apiSectionExpanded.set(newValue);
    }
    private __promptText: ObservedPropertySimplePU<string>;
    get promptText() {
        return this.__promptText.get();
    }
    set promptText(newValue: string) {
        this.__promptText.set(newValue);
    }
    private __logs: ObservedPropertyObjectPU<AiGenLogEntry[]>;
    get logs() {
        return this.__logs.get();
    }
    set logs(newValue: AiGenLogEntry[]) {
        this.__logs.set(newValue);
    }
    private __showStrategyDialog: ObservedPropertySimplePU<boolean>;
    get showStrategyDialog() {
        return this.__showStrategyDialog.get();
    }
    set showStrategyDialog(newValue: boolean) {
        this.__showStrategyDialog.set(newValue);
    }
    private __showModeDialog: ObservedPropertySimplePU<boolean>;
    get showModeDialog() {
        return this.__showModeDialog.get();
    }
    set showModeDialog(newValue: boolean) {
        this.__showModeDialog.set(newValue);
    }
    private __pendingStrategy: ObservedPropertySimplePU<AiGenerateStrategy>;
    get pendingStrategy() {
        return this.__pendingStrategy.get();
    }
    set pendingStrategy(newValue: AiGenerateStrategy) {
        this.__pendingStrategy.set(newValue);
    }
    private __showSelfCheckDialog: ObservedPropertySimplePU<boolean>;
    get showSelfCheckDialog() {
        return this.__showSelfCheckDialog.get();
    }
    set showSelfCheckDialog(newValue: boolean) {
        this.__showSelfCheckDialog.set(newValue);
    }
    private __selfCheckSummary: ObservedPropertySimplePU<string>;
    get selfCheckSummary() {
        return this.__selfCheckSummary.get();
    }
    set selfCheckSummary(newValue: string) {
        this.__selfCheckSummary.set(newValue);
    }
    private __selfCheckCount: ObservedPropertySimplePU<number>;
    get selfCheckCount() {
        return this.__selfCheckCount.get();
    }
    set selfCheckCount(newValue: number) {
        this.__selfCheckCount.set(newValue);
    }
    private __newApiName: ObservedPropertySimplePU<string>;
    get newApiName() {
        return this.__newApiName.get();
    }
    set newApiName(newValue: string) {
        this.__newApiName.set(newValue);
    }
    private __newApiKey: ObservedPropertySimplePU<string>;
    get newApiKey() {
        return this.__newApiKey.get();
    }
    set newApiKey(newValue: string) {
        this.__newApiKey.set(newValue);
    }
    private __newApiModel: ObservedPropertySimplePU<string>;
    get newApiModel() {
        return this.__newApiModel.get();
    }
    set newApiModel(newValue: string) {
        this.__newApiModel.set(newValue);
    }
    private __newApiUrl: ObservedPropertySimplePU<string>;
    get newApiUrl() {
        return this.__newApiUrl.get();
    }
    set newApiUrl(newValue: string) {
        this.__newApiUrl.set(newValue);
    }
    private __newApiFormat: ObservedPropertySimplePU<string>;
    get newApiFormat() {
        return this.__newApiFormat.get();
    }
    set newApiFormat(newValue: string) {
        this.__newApiFormat.set(newValue);
    }
    private __newAuthField: ObservedPropertySimplePU<string>;
    get newAuthField() {
        return this.__newAuthField.get();
    }
    set newAuthField(newValue: string) {
        this.__newAuthField.set(newValue);
    }
    private __selectedProvider: ObservedPropertySimplePU<AiProviderType>;
    get selectedProvider() {
        return this.__selectedProvider.get();
    }
    set selectedProvider(newValue: AiProviderType) {
        this.__selectedProvider.set(newValue);
    }
    private __apiFormatIdx: ObservedPropertySimplePU<number>;
    get apiFormatIdx() {
        return this.__apiFormatIdx.get();
    }
    set apiFormatIdx(newValue: number) {
        this.__apiFormatIdx.set(newValue);
    }
    private appService: AppService;
    private providerIdx: number;
    private selectedStratIdx: number;
    private providers: string[];
    private providerTypes: AiProviderType[];
    private apiFormats: ApiFormatOption[];
    private loadBalanceLabels: string[];
    aboutToAppear(): void {
        this.refreshList();
        this.logs = this.appService.getAiGenLogs();
        this.appService.onAiGenLogsChanged = (entries: AiGenLogEntry[]) => {
            this.logs = entries;
        };
        this.appService.onAiSelfCheckNeeded = (count: number, summary: string) => {
            this.selfCheckCount = count;
            this.selfCheckSummary = summary;
            this.showSelfCheckDialog = true;
        };
        if (this.appService.isAiSelfCheckPromptPending()) {
            this.showSelfCheckDialog = true;
            this.selfCheckSummary = '检测到首次布局问题';
        }
    }
    refreshList(): void {
        this.apiList = this.appService.aiApiManager.listApis();
    }
    private requestGenerate(): void {
        if (this.aiGenerating) {
            Logger.info(INSTR_TRACE_TAG, '[AI_UI] OP cancel_generate | user click');
            this.appService.cancelAiGenerate();
            return;
        }
        const q = this.promptText.trim();
        if (q.length === 0) {
            this.statusMessage = '请输入提示词';
            Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP generate_blocked | empty prompt');
            return;
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP request_generate | promptLen=${q.length}`);
        this.showStrategyDialog = true;
        this.showModeDialog = false;
    }
    private pickStrategy(strategy: AiGenerateStrategy): void {
        this.pendingStrategy = strategy;
        this.showStrategyDialog = false;
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP modular_strategy | strategy=${strategy}`);
        this.showModeDialog = true;
    }
    private async runGenerate(mode: AiGenerateMode): Promise<void> {
        this.showModeDialog = false;
        const q = this.promptText.trim();
        const strategy = this.pendingStrategy;
        this.statusMessage = strategy === 'modular'
            ? '模块并行：整体设计中（请耐心等待）…'
            : 'AI 生成中（复杂电路可能需较长时间，请耐心等待）…';
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_generate | mode=${mode} strategy=${strategy} promptLen=${q.length}`);
        const ok = await this.appService.aiGenerateCircuitFromPrompt(q, mode, strategy);
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_generate_done | mode=${mode} strategy=${strategy} ok=${ok}`);
        if (ok) {
            this.statusMessage = strategy === 'modular' ? '模块并行生图完成' : 'AI 整图生成完成';
        }
    }
    private async runSelfCheck(): Promise<void> {
        this.statusMessage = 'AI 自检修复中…';
        Logger.info(INSTR_TRACE_TAG, '[AI_UI] OP run_self_check | start');
        const ok = await this.appService.aiSelfCheckAndFix();
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_self_check_done | ok=${ok}`);
        this.statusMessage = ok ? '自检修复完成' : '自检完成（仍有问题或已跳过）';
    }
    private bubbleBg(role: string): string {
        if (role === 'user') {
            return ProteusColors.SELECTED;
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- API 配置（默认折叠） ----
            Row.create();
            // ---- API 配置（默认折叠） ----
            Row.width('100%');
            // ---- API 配置（默认折叠） ----
            Row.padding({ left: 8, right: 8, top: 8, bottom: 6 });
            // ---- API 配置（默认折叠） ----
            Row.onClick(() => {
                this.apiSectionExpanded = !this.apiSectionExpanded;
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.apiSectionExpanded ? '▾ API 配置' : '▸ API 配置');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.apiList.length} 个`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        // ---- API 配置（默认折叠） ----
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.apiSectionExpanded) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.ApiConfigSection.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new 
                    // ---- 生成区 ----
                    ProteusSectionTitle(this, { title: 'AI 生成整图' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 171, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'AI 生成整图'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'AI 生成整图'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('输入提示词后一键选型、摆放并连线');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
            Text.padding({ left: 8, right: 8, bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextArea.create({
                placeholder: '例如：STM32F103 最小系统 + LED 闪烁，含示波器观察',
                text: this.promptText
            });
            TextArea.height(72);
            TextArea.width('100%');
            TextArea.fontSize(ProteusFonts.PARAM_KEY);
            TextArea.fontColor(ProteusColors.TEXT_PRIMARY);
            TextArea.backgroundColor(ProteusColors.CANVAS_BG);
            TextArea.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextArea.borderRadius(0);
            TextArea.padding(6);
            TextArea.margin({ left: 8, right: 8 });
            TextArea.enabled(!this.aiGenerating);
            TextArea.onChange((v: string) => {
                this.promptText = v;
            });
        }, TextArea);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.aiGenerating ? '取消' : '生成整图',
                        widthVal: '46%',
                        onAction: () => {
                            this.requestGenerate();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 198, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.aiGenerating ? '取消' : '生成整图',
                            widthVal: '46%',
                            onAction: () => {
                                this.requestGenerate();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.aiGenerating ? '取消' : '生成整图',
                        widthVal: '46%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: 'AI自检修复',
                        widthVal: '28%',
                        onAction: () => {
                            if (this.aiGenerating) {
                                this.statusMessage = '请等待当前任务结束';
                                return;
                            }
                            void this.runSelfCheck();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 205, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AI自检修复',
                            widthVal: '28%',
                            onAction: () => {
                                if (this.aiGenerating) {
                                    this.statusMessage = '请等待当前任务结束';
                                    return;
                                }
                                void this.runSelfCheck();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AI自检修复',
                        widthVal: '28%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清空',
                        widthVal: '20%',
                        onAction: () => {
                            this.appService.clearAiGenLogs();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 216, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空',
                            widthVal: '20%',
                            onAction: () => {
                                this.appService.clearAiGenLogs();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清空',
                        widthVal: '20%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiGenerating) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.aiStage.length > 0 ? this.aiStage : 'AI 生成中'} · ${this.aiProgress}%`);
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width('100%');
                        Text.padding({ left: 8, right: 8, bottom: 4 });
                    }, Text);
                    Text.pop();
                });
            }
            // 首次布局问题 → 询问自检
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 首次布局问题 → 询问自检
            if (this.showSelfCheckDialog && !this.aiGenerating) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 8 });
                        Column.width('100%');
                        Column.padding(10);
                        Column.margin({ left: 8, right: 8, bottom: 6 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.ERC_WARN });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('首次布局检测到问题');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Medium);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.selfCheckSummary.length > 0
                            ? this.selfCheckSummary
                            : '是否根据自检日志与错误进行修复？');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '自检修复',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.showSelfCheckDialog = false;
                                        void this.runSelfCheck();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 249, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '自检修复',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.showSelfCheckDialog = false;
                                            void this.runSelfCheck();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '自检修复',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '暂不',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.showSelfCheckDialog = false;
                                        this.appService.dismissAiSelfCheckPrompt();
                                        this.statusMessage = '已跳过自检修复';
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 257, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '暂不',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.showSelfCheckDialog = false;
                                            this.appService.dismissAiSelfCheckPrompt();
                                            this.statusMessage = '已跳过自检修复';
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '暂不',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Column.pop();
                });
            }
            // 生成策略：整图一次 / 模块并行
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 生成策略：整图一次 / 模块并行
            if (this.showStrategyDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 8 });
                        Column.width('100%');
                        Column.padding(10);
                        Column.margin({ left: 8, right: 8, bottom: 6 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.SELECTED });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('请选择生成方式：');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.appService.getAiConversationRound() > 0
                            ? '当前为多轮编辑：仅支持「整图一次」（模块并行二期）。'
                            : '复杂电路建议「模块并行」：先整体设计连接边界，再多路并行生图后合并。');
                        Text.fontSize(9);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '整图一次',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.pickStrategy('oneshot');
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 287, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '整图一次',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.pickStrategy('oneshot');
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '整图一次',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.appService.getAiConversationRound() === 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusClassicBtn(this, {
                                                label: '模块并行（先整体设计+边界）',
                                                widthVal: '100%',
                                                onAction: () => {
                                                    this.pickStrategy('modular');
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 295, col: 13 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: '模块并行（先整体设计+边界）',
                                                    widthVal: '100%',
                                                    onAction: () => {
                                                        this.pickStrategy('modular');
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: '模块并行（先整体设计+边界）',
                                                widthVal: '100%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '取消',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.showStrategyDialog = false;
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 303, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '取消',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.showStrategyDialog = false;
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '取消',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Column.pop();
                });
            }
            // 替换 / 追加 选择
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 替换 / 追加 选择
            if (this.showModeDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 8 });
                        Column.width('100%');
                        Column.padding(10);
                        Column.margin({ left: 8, right: 8, bottom: 6 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.SELECTED });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.pendingStrategy === 'modular'
                            ? '模块并行 · 画布处理方式：'
                            : '画布上已有电路时，请选择：');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '替换整图',
                                    widthVal: '100%',
                                    onAction: () => {
                                        void this.runGenerate('replace');
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 327, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '替换整图',
                                        widthVal: '100%',
                                        onAction: () => {
                                            void this.runGenerate('replace');
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '替换整图',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '追加到空白区',
                                    widthVal: '100%',
                                    onAction: () => {
                                        void this.runGenerate('append');
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 334, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '追加到空白区',
                                        widthVal: '100%',
                                        onAction: () => {
                                            void this.runGenerate('append');
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '追加到空白区',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '取消',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.showModeDialog = false;
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 341, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '取消',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.showModeDialog = false;
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '取消',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 流式日志 ----
            Row.create();
            // ---- 流式日志 ----
            Row.width('100%');
            // ---- 流式日志 ----
            Row.padding({ left: 8, right: 8, top: 6, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('生成日志');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.logs.length}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        // ---- 流式日志 ----
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create({ space: 6 });
            List.layoutWeight(1);
            List.width('100%');
            List.padding({ left: 6, right: 6, bottom: 6 });
            List.scrollBar(BarState.Auto);
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
        Column.pop();
    }
    ApiConfigSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ right: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('AI API 管理');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
            Text.padding({ left: 8, top: 4, bottom: 4 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.showAddForm ? '收起' : '+ 添加',
                        widthVal: 64,
                        onAction: () => { this.showAddForm = !this.showAddForm; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 418, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.showAddForm ? '收起' : '+ 添加',
                            widthVal: 64,
                            onAction: () => { this.showAddForm = !this.showAddForm; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.showAddForm ? '收起' : '+ 添加',
                        widthVal: 64
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showAddForm) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 4 });
                        Column.padding({ left: 6, right: 6, top: 4, bottom: 4 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.margin({ left: 4, right: 4, top: 2 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('选择平台');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.padding({ left: 8, right: 8, top: 2, bottom: 4 });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusChipGrid(this, {
                                    labels: this.providers,
                                    selectedIdx: this.providerIdx,
                                    colsPerRow: 3,
                                    onSelect: (idx: number) => {
                                        this.providerIdx = idx;
                                        this.selectedProvider = this.providerTypes[idx];
                                        const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                        if (tmpl.success && tmpl.data) {
                                            this.newApiModel = tmpl.data.model;
                                            this.newApiUrl = tmpl.data.baseUrl;
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 434, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        labels: this.providers,
                                        selectedIdx: this.providerIdx,
                                        colsPerRow: 3,
                                        onSelect: (idx: number) => {
                                            this.providerIdx = idx;
                                            this.selectedProvider = this.providerTypes[idx];
                                            const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                            if (tmpl.success && tmpl.data) {
                                                this.newApiModel = tmpl.data.model;
                                                this.newApiUrl = tmpl.data.baseUrl;
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    labels: this.providers,
                                    selectedIdx: this.providerIdx,
                                    colsPerRow: 3
                                });
                            }
                        }, { name: "ProteusChipGrid" });
                    }
                    __Common__.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 2 });
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('官网链接');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ placeholder: 'https://example.com （可选）', text: this.newApiUrl });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((v: string) => { this.newApiUrl = v; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('API Key');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ placeholder: 'sk-...', text: this.newApiKey });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.type(InputType.Password);
                        TextInput.onChange((v: string) => { this.newApiKey = v; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('API 格式');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Select.create(this.buildApiFormatOptions());
                        Select.selected(this.apiFormatIdx);
                        Select.value(this.apiFormats[this.apiFormatIdx].label);
                        Select.font({ size: 10 });
                        Select.fontColor(ProteusColors.TEXT_PRIMARY);
                        Select.backgroundColor(ProteusColors.CANVAS_BG);
                        Select.layoutWeight(1);
                        Select.height(26);
                        Select.onSelect((idx: number) => {
                            this.apiFormatIdx = idx;
                            this.newApiFormat = this.apiFormats[idx].value;
                        });
                    }, Select);
                    Select.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('认证字段');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ placeholder: 'ANTHROPIC_AUTH_TOKEN（默认）', text: this.newAuthField });
                        TextInput.layoutWeight(1);
                        TextInput.height(26);
                        TextInput.fontSize(10);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((v: string) => { this.newAuthField = v; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('模型名称');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ placeholder: 'claude-sonnet-4-6', text: this.newApiModel });
                        TextInput.layoutWeight(1);
                        TextInput.height(26);
                        TextInput.fontSize(10);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((v: string) => { this.newApiModel = v; });
                    }, TextInput);
                    Row.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '保存 API',
                                    widthVal: '100%',
                                    onAction: () => {
                                        const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                        if (!tmpl.success || !tmpl.data) {
                                            Logger.error(INSTR_TRACE_TAG, '[AI_API] save: createFromTemplate failed');
                                            this.statusMessage = '创建 API 配置失败';
                                            return;
                                        }
                                        const config = tmpl.data;
                                        config.apiKey = this.newApiKey;
                                        config.model = this.newApiModel || config.model;
                                        config.name = this.newApiName || config.name || 'New API';
                                        config.baseUrl = this.newApiUrl || config.baseUrl;
                                        if (this.newAuthField.length > 0 && this.newApiKey.length > 0) {
                                            const headers: Record<string, string> = {};
                                            headers[this.newAuthField] = this.newApiKey;
                                            config.customHeaders = headers;
                                        }
                                        const addResult = this.appService.aiApiManager.addApi(config);
                                        if (!addResult.success) {
                                            Logger.error(INSTR_TRACE_TAG, `[AI_API] save FAILED id=${config.id}: ${addResult.error}`);
                                            this.statusMessage = addResult.error ?? '保存 API 失败';
                                            return;
                                        }
                                        this.appService.syncAiApiConfigsToProject();
                                        Logger.info(INSTR_TRACE_TAG, `[AI_API] saved id=${config.id} name=${config.name}` +
                                            ` provider=${config.provider} model=${config.model}` +
                                            ` url=${config.baseUrl} keyLen=${config.apiKey.length}`);
                                        this.refreshList();
                                        this.showAddForm = false;
                                        this.newApiKey = '';
                                        this.newApiUrl = '';
                                        this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                        this.statusMessage = `已添加并同步 ${config.name}`;
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 514, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '保存 API',
                                        widthVal: '100%',
                                        onAction: () => {
                                            const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                            if (!tmpl.success || !tmpl.data) {
                                                Logger.error(INSTR_TRACE_TAG, '[AI_API] save: createFromTemplate failed');
                                                this.statusMessage = '创建 API 配置失败';
                                                return;
                                            }
                                            const config = tmpl.data;
                                            config.apiKey = this.newApiKey;
                                            config.model = this.newApiModel || config.model;
                                            config.name = this.newApiName || config.name || 'New API';
                                            config.baseUrl = this.newApiUrl || config.baseUrl;
                                            if (this.newAuthField.length > 0 && this.newApiKey.length > 0) {
                                                const headers: Record<string, string> = {};
                                                headers[this.newAuthField] = this.newApiKey;
                                                config.customHeaders = headers;
                                            }
                                            const addResult = this.appService.aiApiManager.addApi(config);
                                            if (!addResult.success) {
                                                Logger.error(INSTR_TRACE_TAG, `[AI_API] save FAILED id=${config.id}: ${addResult.error}`);
                                                this.statusMessage = addResult.error ?? '保存 API 失败';
                                                return;
                                            }
                                            this.appService.syncAiApiConfigsToProject();
                                            Logger.info(INSTR_TRACE_TAG, `[AI_API] saved id=${config.id} name=${config.name}` +
                                                ` provider=${config.provider} model=${config.model}` +
                                                ` url=${config.baseUrl} keyLen=${config.apiKey.length}`);
                                            this.refreshList();
                                            this.showAddForm = false;
                                            this.newApiKey = '';
                                            this.newApiUrl = '';
                                            this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                            this.statusMessage = `已添加并同步 ${config.name}`;
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '保存 API',
                                    widthVal: '100%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('负载均衡策略');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.margin({ left: 6, top: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.width('100%');
            __Common__.padding({ left: 8, right: 8, top: 2, bottom: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipGrid(this, {
                        labels: this.loadBalanceLabels,
                        selectedIdx: this.selectedStratIdx,
                        colsPerRow: 3,
                        onSelect: (idx: number) => {
                            this.selectedStratIdx = idx;
                            const modes = [LoadBalanceMode.PRIORITY, LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER];
                            this.appService.aiApiManager.setLoadBalanceStrategy(modes[idx]);
                            this.statusMessage = `负载均衡: ${this.loadBalanceLabels[idx]}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 568, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            labels: this.loadBalanceLabels,
                            selectedIdx: this.selectedStratIdx,
                            colsPerRow: 3,
                            onSelect: (idx: number) => {
                                this.selectedStratIdx = idx;
                                const modes = [LoadBalanceMode.PRIORITY, LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER];
                                this.appService.aiApiManager.setLoadBalanceStrategy(modes[idx]);
                                this.statusMessage = `负载均衡: ${this.loadBalanceLabels[idx]}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        labels: this.loadBalanceLabels,
                        selectedIdx: this.selectedStratIdx,
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 6, right: 6, top: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('已配置 API');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.apiList.length} 个`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ left: 4, right: 4, top: 2, bottom: 6 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const api = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Column.create();
                    Column.width('100%');
                    Column.padding({ left: 6, right: 6, top: 4, bottom: 4 });
                    Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                    Column.border({ width: 1, color: ProteusColors.DIVIDER });
                }, Column);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create();
                    Row.width('100%');
                }, Row);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(api.name);
                    Text.fontSize(10);
                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    Text.fontWeight(FontWeight.Medium);
                    Text.maxLines(1);
                    Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                    Text.layoutWeight(1);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(api.enabled ? '●' : '○');
                    Text.fontSize(8);
                    Text.fontColor(api.enabled ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
                    Text.margin({ left: 4 });
                }, Text);
                Text.pop();
                Row.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(`${api.model}`);
                    Text.fontSize(9);
                    Text.fontColor(ProteusColors.TEXT_LABEL);
                    Text.width('100%');
                    Text.maxLines(1);
                    Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create({ space: 3 });
                    Row.width('100%');
                }, Row);
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusClassicBtn(this, {
                                label: '测试', widthVal: 44,
                                onAction: async () => {
                                    this.statusMessage = `测试 ${api.name}...`;
                                    Logger.info(INSTR_TRACE_TAG, `[AI_API] UI test click id=${api.id} name=${api.name}`);
                                    const result = await this.appService.aiApiManager.testConnection(api.id);
                                    Logger.info(INSTR_TRACE_TAG, `[AI_API] UI test done id=${api.id} ok=${result.success}` +
                                        ` err=${result.error ?? ''}`);
                                    this.statusMessage = result.success
                                        ? `${api.name} 连接成功`
                                        : `${api.name} 失败: ${result.error ?? ''}`;
                                    this.appService.syncAiApiConfigsToProject();
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 610, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '测试',
                                    widthVal: 44,
                                    onAction: async () => {
                                        this.statusMessage = `测试 ${api.name}...`;
                                        Logger.info(INSTR_TRACE_TAG, `[AI_API] UI test click id=${api.id} name=${api.name}`);
                                        const result = await this.appService.aiApiManager.testConnection(api.id);
                                        Logger.info(INSTR_TRACE_TAG, `[AI_API] UI test done id=${api.id} ok=${result.success}` +
                                            ` err=${result.error ?? ''}`);
                                        this.statusMessage = result.success
                                            ? `${api.name} 连接成功`
                                            : `${api.name} 失败: ${result.error ?? ''}`;
                                        this.appService.syncAiApiConfigsToProject();
                                        this.refreshList();
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: '测试', widthVal: 44
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusClassicBtn(this, {
                                label: api.enabled ? '禁用' : '启用', widthVal: 44,
                                onAction: () => {
                                    if (api.enabled) {
                                        this.appService.aiApiManager.disableApi(api.id);
                                    }
                                    else {
                                        this.appService.aiApiManager.enableApi(api.id);
                                    }
                                    this.appService.syncAiApiConfigsToProject();
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 627, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: api.enabled ? '禁用' : '启用',
                                    widthVal: 44,
                                    onAction: () => {
                                        if (api.enabled) {
                                            this.appService.aiApiManager.disableApi(api.id);
                                        }
                                        else {
                                            this.appService.aiApiManager.enableApi(api.id);
                                        }
                                        this.appService.syncAiApiConfigsToProject();
                                        this.refreshList();
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: api.enabled ? '禁用' : '启用', widthVal: 44
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusClassicBtn(this, {
                                label: '删', widthVal: 36,
                                onAction: () => {
                                    this.appService.aiApiManager.removeApi(api.id);
                                    this.appService.syncAiApiConfigsToProject();
                                    Logger.info(INSTR_TRACE_TAG, `[AI_API] removed id=${api.id}`);
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 639, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '删',
                                    widthVal: 36,
                                    onAction: () => {
                                        this.appService.aiApiManager.removeApi(api.id);
                                        this.appService.syncAiApiConfigsToProject();
                                        Logger.info(INSTR_TRACE_TAG, `[AI_API] removed id=${api.id}`);
                                        this.refreshList();
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: '删', widthVal: 36
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                Row.pop();
                Column.pop();
            };
            this.forEachUpdateFunction(elmtId, this.apiList, forEachItemGenFunction, (api: AiApiConfig) => api.id, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
        Column.pop();
    }
    private buildApiFormatOptions(): SelectValueOption[] {
        const opts: SelectValueOption[] = [];
        for (let i = 0; i < this.apiFormats.length; i++) {
            const opt: SelectValueOption = { value: this.apiFormats[i].label };
            opts.push(opt);
        }
        return opts;
    }
    rerender() {
        this.updateDirtyElements();
    }
}
interface SelectValueOption {
    value: string;
}
