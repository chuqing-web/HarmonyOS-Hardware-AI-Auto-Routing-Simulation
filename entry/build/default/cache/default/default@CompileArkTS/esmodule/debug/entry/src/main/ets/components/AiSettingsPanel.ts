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
    clarifyQuestions?: ClarificationQuestion[];
    clarifyChoiceById?: Map<string, string>;
    clarifyFreeById?: Map<string, string>;
    pendingClarifyPrompt?: string;
    pendingClarifyMode?: AiGenerateMode;
    pendingClarifyStrategy?: AiGenerateStrategy;
    enableReasoning?: boolean;
    newApiName?: string;
    newApiKey?: string;
    newApiModel?: string;
    newApiUrl?: string;
    newApiFormat?: string;
    newAuthField?: string;
    selectedProvider?: AiProviderType;
    apiFormatIdx?: number;
    editingApiId?: string;
    defaultApiId?: string;
    providerIdx?: number;
    selectedStratIdx?: number;
    apiListRev?: number;
    appService?: AppService;
    providers?: string[];
    providerTypes?: AiProviderType[];
    apiFormats?: ApiFormatOption[];
    loadBalanceLabels?: string[];
    loadBalanceModes?: LoadBalanceMode[];
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { AiGenLogEntry, AiGenerateMode, AiGenerateStrategy } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { AiProviderType, LoadBalanceMode, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, ClarificationQuestion, ClarificationAnswer, Result } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextArea, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
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
        this.__clarifyQuestions = new ObservedPropertyObjectPU([], this, "clarifyQuestions");
        this.__clarifyChoiceById = new ObservedPropertyObjectPU(new Map(), this, "clarifyChoiceById");
        this.__clarifyFreeById = new ObservedPropertyObjectPU(new Map(), this, "clarifyFreeById");
        this.__pendingClarifyPrompt = new ObservedPropertySimplePU('', this, "pendingClarifyPrompt");
        this.__pendingClarifyMode = new ObservedPropertySimplePU('replace', this, "pendingClarifyMode");
        this.__pendingClarifyStrategy = new ObservedPropertySimplePU('oneshot', this, "pendingClarifyStrategy");
        this.__enableReasoning = new ObservedPropertySimplePU(false, this, "enableReasoning");
        this.__newApiName = new ObservedPropertySimplePU('', this, "newApiName");
        this.__newApiKey = new ObservedPropertySimplePU('', this, "newApiKey");
        this.__newApiModel = new ObservedPropertySimplePU('', this, "newApiModel");
        this.__newApiUrl = new ObservedPropertySimplePU('', this, "newApiUrl");
        this.__newApiFormat = new ObservedPropertySimplePU('openai', this, "newApiFormat");
        this.__newAuthField = new ObservedPropertySimplePU('', this, "newAuthField");
        this.__selectedProvider = new ObservedPropertySimplePU(AiProviderType.DEEPSEEK, this, "selectedProvider");
        this.__apiFormatIdx = new ObservedPropertySimplePU(2, this, "apiFormatIdx");
        this.__editingApiId = new ObservedPropertySimplePU('', this, "editingApiId");
        this.__defaultApiId = new ObservedPropertySimplePU('', this, "defaultApiId");
        this.__providerIdx = new ObservedPropertySimplePU(0, this, "providerIdx");
        this.__selectedStratIdx = new ObservedPropertySimplePU(0, this, "selectedStratIdx");
        this.__apiListRev = new ObservedPropertySimplePU(0, this, "apiListRev");
        this.appService = AppService.getInstance();
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
        this.loadBalanceLabels = ['指定默认', '优先级', '轮询', '故障切换'];
        this.loadBalanceModes = [
            LoadBalanceMode.SINGLE_DEFAULT, LoadBalanceMode.PRIORITY,
            LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER
        ];
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
        if (params.clarifyQuestions !== undefined) {
            this.clarifyQuestions = params.clarifyQuestions;
        }
        if (params.clarifyChoiceById !== undefined) {
            this.clarifyChoiceById = params.clarifyChoiceById;
        }
        if (params.clarifyFreeById !== undefined) {
            this.clarifyFreeById = params.clarifyFreeById;
        }
        if (params.pendingClarifyPrompt !== undefined) {
            this.pendingClarifyPrompt = params.pendingClarifyPrompt;
        }
        if (params.pendingClarifyMode !== undefined) {
            this.pendingClarifyMode = params.pendingClarifyMode;
        }
        if (params.pendingClarifyStrategy !== undefined) {
            this.pendingClarifyStrategy = params.pendingClarifyStrategy;
        }
        if (params.enableReasoning !== undefined) {
            this.enableReasoning = params.enableReasoning;
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
        if (params.editingApiId !== undefined) {
            this.editingApiId = params.editingApiId;
        }
        if (params.defaultApiId !== undefined) {
            this.defaultApiId = params.defaultApiId;
        }
        if (params.providerIdx !== undefined) {
            this.providerIdx = params.providerIdx;
        }
        if (params.selectedStratIdx !== undefined) {
            this.selectedStratIdx = params.selectedStratIdx;
        }
        if (params.apiListRev !== undefined) {
            this.apiListRev = params.apiListRev;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
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
        if (params.loadBalanceModes !== undefined) {
            this.loadBalanceModes = params.loadBalanceModes;
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
        this.__clarifyQuestions.purgeDependencyOnElmtId(rmElmtId);
        this.__clarifyChoiceById.purgeDependencyOnElmtId(rmElmtId);
        this.__clarifyFreeById.purgeDependencyOnElmtId(rmElmtId);
        this.__pendingClarifyPrompt.purgeDependencyOnElmtId(rmElmtId);
        this.__pendingClarifyMode.purgeDependencyOnElmtId(rmElmtId);
        this.__pendingClarifyStrategy.purgeDependencyOnElmtId(rmElmtId);
        this.__enableReasoning.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiName.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiKey.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiModel.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiUrl.purgeDependencyOnElmtId(rmElmtId);
        this.__newApiFormat.purgeDependencyOnElmtId(rmElmtId);
        this.__newAuthField.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedProvider.purgeDependencyOnElmtId(rmElmtId);
        this.__apiFormatIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__editingApiId.purgeDependencyOnElmtId(rmElmtId);
        this.__defaultApiId.purgeDependencyOnElmtId(rmElmtId);
        this.__providerIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedStratIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__apiListRev.purgeDependencyOnElmtId(rmElmtId);
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
        this.__clarifyQuestions.aboutToBeDeleted();
        this.__clarifyChoiceById.aboutToBeDeleted();
        this.__clarifyFreeById.aboutToBeDeleted();
        this.__pendingClarifyPrompt.aboutToBeDeleted();
        this.__pendingClarifyMode.aboutToBeDeleted();
        this.__pendingClarifyStrategy.aboutToBeDeleted();
        this.__enableReasoning.aboutToBeDeleted();
        this.__newApiName.aboutToBeDeleted();
        this.__newApiKey.aboutToBeDeleted();
        this.__newApiModel.aboutToBeDeleted();
        this.__newApiUrl.aboutToBeDeleted();
        this.__newApiFormat.aboutToBeDeleted();
        this.__newAuthField.aboutToBeDeleted();
        this.__selectedProvider.aboutToBeDeleted();
        this.__apiFormatIdx.aboutToBeDeleted();
        this.__editingApiId.aboutToBeDeleted();
        this.__defaultApiId.aboutToBeDeleted();
        this.__providerIdx.aboutToBeDeleted();
        this.__selectedStratIdx.aboutToBeDeleted();
        this.__apiListRev.aboutToBeDeleted();
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
    private __clarifyQuestions: ObservedPropertyObjectPU<ClarificationQuestion[]>;
    get clarifyQuestions() {
        return this.__clarifyQuestions.get();
    }
    set clarifyQuestions(newValue: ClarificationQuestion[]) {
        this.__clarifyQuestions.set(newValue);
    }
    private __clarifyChoiceById: ObservedPropertyObjectPU<Map<string, string>>;
    get clarifyChoiceById() {
        return this.__clarifyChoiceById.get();
    }
    set clarifyChoiceById(newValue: Map<string, string>) {
        this.__clarifyChoiceById.set(newValue);
    }
    private __clarifyFreeById: ObservedPropertyObjectPU<Map<string, string>>;
    get clarifyFreeById() {
        return this.__clarifyFreeById.get();
    }
    set clarifyFreeById(newValue: Map<string, string>) {
        this.__clarifyFreeById.set(newValue);
    }
    private __pendingClarifyPrompt: ObservedPropertySimplePU<string>;
    get pendingClarifyPrompt() {
        return this.__pendingClarifyPrompt.get();
    }
    set pendingClarifyPrompt(newValue: string) {
        this.__pendingClarifyPrompt.set(newValue);
    }
    private __pendingClarifyMode: ObservedPropertySimplePU<AiGenerateMode>;
    get pendingClarifyMode() {
        return this.__pendingClarifyMode.get();
    }
    set pendingClarifyMode(newValue: AiGenerateMode) {
        this.__pendingClarifyMode.set(newValue);
    }
    private __pendingClarifyStrategy: ObservedPropertySimplePU<AiGenerateStrategy>;
    get pendingClarifyStrategy() {
        return this.__pendingClarifyStrategy.get();
    }
    set pendingClarifyStrategy(newValue: AiGenerateStrategy) {
        this.__pendingClarifyStrategy.set(newValue);
    }
    private __enableReasoning: ObservedPropertySimplePU<boolean>;
    get enableReasoning() {
        return this.__enableReasoning.get();
    }
    set enableReasoning(newValue: boolean) {
        this.__enableReasoning.set(newValue);
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
    /** 非空表示正在编辑已保存配置（保存走 updateApi） */
    private __editingApiId: ObservedPropertySimplePU<string>;
    get editingApiId() {
        return this.__editingApiId.get();
    }
    set editingApiId(newValue: string) {
        this.__editingApiId.set(newValue);
    }
    private __defaultApiId: ObservedPropertySimplePU<string>;
    get defaultApiId() {
        return this.__defaultApiId.get();
    }
    set defaultApiId(newValue: string) {
        this.__defaultApiId.set(newValue);
    }
    private __providerIdx: ObservedPropertySimplePU<number>;
    get providerIdx() {
        return this.__providerIdx.get();
    }
    set providerIdx(newValue: number) {
        this.__providerIdx.set(newValue);
    }
    private __selectedStratIdx: ObservedPropertySimplePU<number>;
    get selectedStratIdx() {
        return this.__selectedStratIdx.get();
    }
    set selectedStratIdx(newValue: number) {
        this.__selectedStratIdx.set(newValue);
    }
    /** ForEach 仅用 id 作 key 时，model/name 变更不会重建子项；递增以强制刷新 */
    private __apiListRev: ObservedPropertySimplePU<number>;
    get apiListRev() {
        return this.__apiListRev.get();
    }
    set apiListRev(newValue: number) {
        this.__apiListRev.set(newValue);
    }
    private appService: AppService;
    private providers: string[];
    private providerTypes: AiProviderType[];
    private apiFormats: ApiFormatOption[];
    private loadBalanceLabels: string[];
    private loadBalanceModes: LoadBalanceMode[];
    aboutToAppear(): void {
        this.refreshList();
        if (this.defaultApiId.length > 0) {
            this.appService.aiApiManager.setLoadBalanceStrategy(LoadBalanceMode.SINGLE_DEFAULT);
            this.selectedStratIdx = 0;
        }
        else {
            // 与 AiApiManagerImpl 默认 PRIORITY 对齐
            this.selectedStratIdx = 1;
        }
        this.logs = this.appService.getAiGenLogs();
        this.appService.onAiGenLogsChanged = (entries: AiGenLogEntry[]) => {
            this.logs = entries;
        };
        this.appService.onAiSelfCheckNeeded = (count: number, summary: string) => {
            this.selfCheckCount = count;
            this.selfCheckSummary = summary;
            this.showSelfCheckDialog = true;
        };
        this.appService.onAiClarificationNeeded = (questions, prompt, mode, strategy) => {
            this.clarifyQuestions = questions;
            this.clarifyChoiceById = new Map();
            this.clarifyFreeById = new Map();
            this.pendingClarifyPrompt = prompt;
            this.pendingClarifyMode = mode;
            this.pendingClarifyStrategy = strategy;
            Logger.info(INSTR_TRACE_TAG, `[AI_UI] clarify Ask cards n=${questions.length}`);
        };
        if (this.appService.isAiSelfCheckPromptPending()) {
            this.showSelfCheckDialog = true;
            this.selfCheckSummary = '检测到首次布局问题';
        }
        this.enableReasoning = this.appService.aiEnableReasoning;
    }
    refreshList(): void {
        this.apiList = this.appService.aiApiManager.listApis();
        const def = this.appService.aiApiManager.getDefaultApi();
        this.defaultApiId = (def.success && def.data) ? def.data.id : '';
        this.apiListRev++;
    }
    private resetApiForm(): void {
        this.editingApiId = '';
        this.newApiName = '';
        this.newApiKey = '';
        this.newApiUrl = '';
        this.newApiModel = '';
        this.newAuthField = this.selectedProvider === AiProviderType.CLAUDE ? 'x-api-key' : '';
    }
    private beginEditApi(api: AiApiConfig): void {
        // 从 manager 重取，避免 ForEach 闭包里的旧快照把表单冲回旧 model/name
        let src: AiApiConfig = api;
        const fresh = this.appService.aiApiManager.getApi(api.id);
        if (fresh.success && fresh.data) {
            src = fresh.data;
        }
        this.editingApiId = src.id;
        this.showAddForm = true;
        this.newApiName = src.name;
        this.newApiKey = '';
        this.newApiUrl = src.baseUrl;
        this.newApiModel = src.model;
        this.selectedProvider = src.provider;
        let pIdx = 0;
        for (let i = 0; i < this.providerTypes.length; i++) {
            if (this.providerTypes[i] === src.provider) {
                pIdx = i;
                break;
            }
        }
        this.providerIdx = pIdx;
        // remark: apiFormat=xxx
        let fmt = 'openai';
        const remark = src.remark ?? '';
        const marker = 'apiFormat=';
        const mi = remark.indexOf(marker);
        if (mi >= 0) {
            fmt = remark.substring(mi + marker.length).trim();
            const sp = fmt.indexOf(' ');
            if (sp >= 0) {
                fmt = fmt.substring(0, sp);
            }
        }
        else if (src.provider === AiProviderType.CLAUDE) {
            fmt = 'anthropic';
        }
        else if (src.provider === AiProviderType.DEEPSEEK) {
            fmt = 'deepseek';
        }
        else if (src.provider === AiProviderType.OLLAMA) {
            fmt = 'ollama';
        }
        this.newApiFormat = fmt;
        let fIdx = 1;
        for (let i = 0; i < this.apiFormats.length; i++) {
            if (this.apiFormats[i].value === fmt) {
                fIdx = i;
                break;
            }
        }
        this.apiFormatIdx = fIdx;
        this.newAuthField = '';
        const ch = src.customHeaders;
        if (ch) {
            // ArkTS：不用 Object.keys；按常见认证头探测
            if (ch['x-api-key'] !== undefined) {
                this.newAuthField = 'x-api-key';
            }
            else if (ch['Authorization'] !== undefined) {
                this.newAuthField = 'Authorization';
            }
            else if (ch['api-key'] !== undefined) {
                this.newAuthField = 'api-key';
            }
        }
        else if (src.provider === AiProviderType.CLAUDE) {
            this.newAuthField = 'x-api-key';
        }
        this.statusMessage = `正在编辑 ${src.name}（Key 留空则保留原值）`;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] UI edit begin id=${src.id} name=${src.name} model=${src.model}`);
    }
    private selectAsDefault(api: AiApiConfig): void {
        if (!api.enabled) {
            this.appService.aiApiManager.enableApi(api.id);
        }
        const setDef = this.appService.aiApiManager.setDefaultApi(api.id);
        if (!setDef.success) {
            this.statusMessage = setDef.error ?? '设为默认失败';
            return;
        }
        this.appService.aiApiManager.setLoadBalanceStrategy(LoadBalanceMode.SINGLE_DEFAULT);
        this.selectedStratIdx = 0;
        this.appService.syncAiApiConfigsToProject();
        this.refreshList();
        Logger.info(INSTR_TRACE_TAG, `[AI_API] UI select default id=${api.id} name=${api.name}`);
        this.statusMessage = `已选用 ${api.name}（指定默认）`;
    }
    private saveApiFromForm(): void {
        const isEdit = this.editingApiId.length > 0;
        if (isEdit) {
            const keyTrim = this.newApiKey.trim();
            // Key 留空：完全不传 apiKey，避免冲掉已存密钥
            const nameVal = this.newApiName.trim().length > 0 ? this.newApiName.trim() : this.newApiName;
            const urlVal = this.newApiUrl.trim().length > 0 ? this.newApiUrl.trim() : this.newApiUrl;
            const modelVal = this.newApiModel.trim().length > 0 ? this.newApiModel.trim() : this.newApiModel;
            const remarkVal = this.newApiFormat.length > 0 ? `apiFormat=${this.newApiFormat}` : '';
            let upd: Result<void> = { success: false, error: 'update not called' };
            if (keyTrim.length > 0 && keyTrim !== '***') {
                const headers: Record<string, string> = {};
                let useHeaders = false;
                if (this.newAuthField.length > 0) {
                    const lower = this.newAuthField.toLowerCase();
                    if (lower !== 'bearer' && lower !== 'authorization') {
                        headers[this.newAuthField] = keyTrim;
                        useHeaders = true;
                    }
                }
                if (useHeaders) {
                    upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
                        name: nameVal,
                        provider: this.selectedProvider,
                        baseUrl: urlVal,
                        model: modelVal,
                        apiKey: keyTrim,
                        customHeaders: headers,
                        remark: remarkVal
                    });
                }
                else {
                    upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
                        name: nameVal,
                        provider: this.selectedProvider,
                        baseUrl: urlVal,
                        model: modelVal,
                        apiKey: keyTrim,
                        remark: remarkVal
                    });
                }
            }
            else {
                upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
                    name: nameVal,
                    provider: this.selectedProvider,
                    baseUrl: urlVal,
                    model: modelVal,
                    remark: remarkVal
                });
            }
            if (!upd.success) {
                Logger.error(INSTR_TRACE_TAG, `[AI_API] update FAILED id=${this.editingApiId}: ${upd.error}`);
                this.statusMessage = upd.error ?? '更新 API 失败（未改动 Key）';
                return;
            }
            const synced = this.appService.syncAiApiConfigsToProject();
            if (!synced) {
                Logger.error(INSTR_TRACE_TAG, `[AI_API] update OK but vault sync FAIL id=${this.editingApiId}`);
                this.statusMessage = '配置已更新到内存，但金库保存失败（Key 仍保留，请重试）';
                this.refreshList();
                return;
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_API] updated id=${this.editingApiId} name=${this.newApiName}` +
                ` provider=${this.selectedProvider} model=${this.newApiModel}` +
                ` url=${this.newApiUrl} keyChanged=${keyTrim.length > 0}`);
            this.refreshList();
            this.showAddForm = false;
            this.resetApiForm();
            this.statusMessage = '已更新并同步 API 配置';
            return;
        }
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
            const lower = this.newAuthField.toLowerCase();
            if (lower !== 'bearer' && lower !== 'authorization') {
                const h: Record<string, string> = {};
                h[this.newAuthField] = this.newApiKey;
                config.customHeaders = h;
            }
        }
        if (this.newApiFormat.length > 0) {
            config.remark = `apiFormat=${this.newApiFormat}`;
        }
        const addResult = this.appService.aiApiManager.addApi(config);
        if (!addResult.success) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] save FAILED id=${config.id}: ${addResult.error}`);
            this.statusMessage = addResult.error ?? '保存 API 失败';
            return;
        }
        const syncedAdd = this.appService.syncAiApiConfigsToProject();
        Logger.info(INSTR_TRACE_TAG, `[AI_API] saved id=${config.id} name=${config.name}` +
            ` provider=${config.provider} model=${config.model}` +
            ` url=${config.baseUrl} keyLen=${config.apiKey.length} vault=${syncedAdd}`);
        this.refreshList();
        this.showAddForm = false;
        this.resetApiForm();
        this.statusMessage = syncedAdd
            ? `已添加并同步 ${config.name}`
            : `已添加 ${config.name}，但金库保存失败请重试`;
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
        this.showSelfCheckDialog = false;
    }
    private async submitClarification(): Promise<void> {
        const answers: ClarificationAnswer[] = [];
        for (let i = 0; i < this.clarifyQuestions.length; i++) {
            const q = this.clarifyQuestions[i];
            const free = (this.clarifyFreeById.get(q.id) ?? '').trim();
            const choiceRaw = this.clarifyChoiceById.get(q.id);
            if (free.length === 0 && (!choiceRaw || choiceRaw.length === 0)) {
                this.statusMessage = `请回答：${q.prompt}`;
                return;
            }
            const ans: ClarificationAnswer = { questionId: q.id };
            if (free.length > 0) {
                ans.freeText = free;
            }
            if (choiceRaw === 'A' || choiceRaw === 'B' || choiceRaw === 'C') {
                ans.choice = choiceRaw;
            }
            answers.push(ans);
        }
        const prompt = this.pendingClarifyPrompt.length > 0 ? this.pendingClarifyPrompt : this.promptText;
        const mode = this.pendingClarifyMode;
        const strategy = this.pendingClarifyStrategy;
        this.clarifyQuestions = [];
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP submit_clarification n=${answers.length}`);
        const ok = await this.appService.aiGenerateCircuitFromPrompt(prompt, mode, strategy, answers);
        if (!ok) {
            this.statusMessage = this.statusMessage.length > 0 ? this.statusMessage : '继续生成失败';
        }
    }
    /** 在现有图基础上修改：跳过策略/落图方式对话框，强制 oneshot + edit */
    private requestEditExisting(): void {
        if (this.aiGenerating) {
            this.statusMessage = '请等待当前任务结束';
            return;
        }
        const q = this.promptText.trim();
        if (q.length === 0) {
            this.statusMessage = '请输入提示词（说明要改什么）';
            Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP edit_blocked | empty prompt');
            return;
        }
        const n = this.appService.getSchematicComponentCount();
        if (n <= 0) {
            this.statusMessage = '画布为空，请先「生成整图」或放置器件后再修改';
            Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP edit_blocked | empty canvas');
            return;
        }
        this.showStrategyDialog = false;
        this.showModeDialog = false;
        this.showSelfCheckDialog = false;
        this.pendingStrategy = 'oneshot';
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP request_edit_existing | promptLen=${q.length} comps=${n}`);
        void this.runGenerate('edit');
    }
    private pickStrategy(strategy: AiGenerateStrategy): void {
        this.pendingStrategy = strategy;
        this.showStrategyDialog = false;
        // 模块并行始终从 create 起步（清多轮历史），避免被编辑模式强制改 oneshot
        if (strategy === 'modular') {
            this.appService.clearAiConversation();
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP modular_strategy | strategy=${strategy}`);
        this.showModeDialog = true;
    }
    private async runGenerate(mode: AiGenerateMode): Promise<void> {
        this.showModeDialog = false;
        const q = this.promptText.trim();
        // 编辑模式强制 oneshot（与 AppService 一致；避免 UI 仍显示模块并行文案）
        const strategy: AiGenerateStrategy = mode === 'edit' ? 'oneshot' : this.pendingStrategy;
        this.statusMessage = mode === 'edit'
            ? 'AI 正在基于现有电路增量修改（请耐心等待）…'
            : (strategy === 'modular'
                ? '模块并行：整体设计中（请耐心等待）…'
                : 'AI 生成中（复杂电路可能需较长时间，请耐心等待）…');
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_generate | mode=${mode} strategy=${strategy} promptLen=${q.length}`);
        const ok = await this.appService.aiGenerateCircuitFromPrompt(q, mode, strategy);
        Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_generate_done | mode=${mode} strategy=${strategy} ok=${ok}`);
        if (ok) {
            this.statusMessage = mode === 'edit'
                ? 'AI 已按提示词更新现有电路'
                : (strategy === 'modular' ? '模块并行生图完成' : 'AI 整图生成完成');
        }
        else {
            this.statusMessage = 'AI 生成失败，请检查 API 配置与 instr_trace 日志';
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
            // ---- Cline 顶栏：任务 / 进度 / API 齿轮 ----
            Row.create();
            // ---- Cline 顶栏：任务 / 进度 / API 齿轮 ----
            Row.width('100%');
            // ---- Cline 顶栏：任务 / 进度 / API 齿轮 ----
            Row.padding({ left: 10, right: 8, top: 8, bottom: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('AI 助手');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiGenerating) {
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
            Text.create(this.apiSectionExpanded ? '▾ API' : '⚙ API');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.padding({ left: 6, right: 6, top: 4, bottom: 4 });
            Text.onClick(() => {
                this.apiSectionExpanded = !this.apiSectionExpanded;
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiGenerating) {
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
        // ---- Cline 顶栏：任务 / 进度 / API 齿轮 ----
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiGenerating && this.aiStage.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.aiStage);
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
                    this.ApiConfigSection.bind(this)();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                    }, Divider);
                });
            }
            // ---- 中部对话时间线 ----
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 中部对话时间线 ----
            List.create({ space: 6 });
            // ---- 中部对话时间线 ----
            List.layoutWeight(1);
            // ---- 中部对话时间线 ----
            List.width('100%');
            // ---- 中部对话时间线 ----
            List.padding({ left: 6, right: 6, bottom: 4 });
            // ---- 中部对话时间线 ----
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // Ask 澄清卡片（嵌入时间线）
            if (this.clarifyQuestions.length > 0 && !this.aiGenerating) {
                this.ifElseBranchUpdateFunction(0, () => {
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
                                Column.create({ space: 10 });
                                Column.width('100%');
                                Column.padding(8);
                            }, Column);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('需要澄清后再生成');
                                Text.fontSize(ProteusFonts.PARAM_KEY);
                                Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                Text.fontWeight(FontWeight.Medium);
                                Text.width('100%');
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                ForEach.create();
                                const forEachItemGenFunction = _item => {
                                    const q = _item;
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Column.create({ space: 6 });
                                        Column.width('100%');
                                        Column.padding(8);
                                        Column.backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG);
                                    }, Column);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(q.prompt);
                                        Text.fontSize(10);
                                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                        Text.width('100%');
                                    }, Text);
                                    Text.pop();
                                    {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            if (isInitialRender) {
                                                let componentCall = new ProteusClassicBtn(this, {
                                                    label: `A. ${q.optionA}`,
                                                    widthVal: '100%',
                                                    onAction: () => {
                                                        this.clarifyChoiceById.set(q.id, 'A');
                                                        this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                    }
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 552, col: 19 });
                                                ViewPU.create(componentCall);
                                                let paramsLambda = () => {
                                                    return {
                                                        label: `A. ${q.optionA}`,
                                                        widthVal: '100%',
                                                        onAction: () => {
                                                            this.clarifyChoiceById.set(q.id, 'A');
                                                            this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                        }
                                                    };
                                                };
                                                componentCall.paramsGenerator_ = paramsLambda;
                                            }
                                            else {
                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                    label: `A. ${q.optionA}`,
                                                    widthVal: '100%'
                                                });
                                            }
                                        }, { name: "ProteusClassicBtn" });
                                    }
                                    {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            if (isInitialRender) {
                                                let componentCall = new ProteusClassicBtn(this, {
                                                    label: `B. ${q.optionB}`,
                                                    widthVal: '100%',
                                                    onAction: () => {
                                                        this.clarifyChoiceById.set(q.id, 'B');
                                                        this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                    }
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 560, col: 19 });
                                                ViewPU.create(componentCall);
                                                let paramsLambda = () => {
                                                    return {
                                                        label: `B. ${q.optionB}`,
                                                        widthVal: '100%',
                                                        onAction: () => {
                                                            this.clarifyChoiceById.set(q.id, 'B');
                                                            this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                        }
                                                    };
                                                };
                                                componentCall.paramsGenerator_ = paramsLambda;
                                            }
                                            else {
                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                    label: `B. ${q.optionB}`,
                                                    widthVal: '100%'
                                                });
                                            }
                                        }, { name: "ProteusClassicBtn" });
                                    }
                                    {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            if (isInitialRender) {
                                                let componentCall = new ProteusClassicBtn(this, {
                                                    label: `C. ${q.optionC}`,
                                                    widthVal: '100%',
                                                    onAction: () => {
                                                        this.clarifyChoiceById.set(q.id, 'C');
                                                        this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                    }
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 568, col: 19 });
                                                ViewPU.create(componentCall);
                                                let paramsLambda = () => {
                                                    return {
                                                        label: `C. ${q.optionC}`,
                                                        widthVal: '100%',
                                                        onAction: () => {
                                                            this.clarifyChoiceById.set(q.id, 'C');
                                                            this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                                                        }
                                                    };
                                                };
                                                componentCall.paramsGenerator_ = paramsLambda;
                                            }
                                            else {
                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                    label: `C. ${q.optionC}`,
                                                    widthVal: '100%'
                                                });
                                            }
                                        }, { name: "ProteusClassicBtn" });
                                    }
                                    {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            if (isInitialRender) {
                                                let componentCall = new ProteusTextArea(this, {
                                                    placeholder: 'D. 补充说明（可选，留空跳过）',
                                                    text: this.clarifyFreeById.get(q.id) ?? '',
                                                    areaHeight: 48,
                                                    isEnabled: true,
                                                    onChange: (v: string) => {
                                                        this.clarifyFreeById.set(q.id, v);
                                                        this.clarifyFreeById = new Map(this.clarifyFreeById);
                                                    }
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 576, col: 19 });
                                                ViewPU.create(componentCall);
                                                let paramsLambda = () => {
                                                    return {
                                                        placeholder: 'D. 补充说明（可选，留空跳过）',
                                                        text: this.clarifyFreeById.get(q.id) ?? '',
                                                        areaHeight: 48,
                                                        isEnabled: true,
                                                        onChange: (v: string) => {
                                                            this.clarifyFreeById.set(q.id, v);
                                                            this.clarifyFreeById = new Map(this.clarifyFreeById);
                                                        }
                                                    };
                                                };
                                                componentCall.paramsGenerator_ = paramsLambda;
                                            }
                                            else {
                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                    placeholder: 'D. 补充说明（可选，留空跳过）',
                                                    text: this.clarifyFreeById.get(q.id) ?? '',
                                                    areaHeight: 48,
                                                    isEnabled: true
                                                });
                                            }
                                        }, { name: "ProteusTextArea" });
                                    }
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(`已选: ${this.clarifyChoiceById.get(q.id) ?? '无'}`);
                                        Text.fontSize(9);
                                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                        Text.width('100%');
                                    }, Text);
                                    Text.pop();
                                    Column.pop();
                                };
                                this.forEachUpdateFunction(elmtId, this.clarifyQuestions, forEachItemGenFunction, (q: ClarificationQuestion) => q.id, false, false);
                            }, ForEach);
                            ForEach.pop();
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusClassicBtn(this, {
                                            label: '继续生成',
                                            widthVal: '100%',
                                            onAction: () => {
                                                void this.submitClarification();
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 595, col: 15 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                label: '继续生成',
                                                widthVal: '100%',
                                                onAction: () => {
                                                    void this.submitClarification();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            label: '继续生成',
                                            widthVal: '100%'
                                        });
                                    }
                                }, { name: "ProteusClassicBtn" });
                            }
                            Column.pop();
                            ListItem.pop();
                        };
                        this.observeComponentCreation2(itemCreation2, ListItem);
                        ListItem.pop();
                    }
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
            if (this.showSelfCheckDialog && !this.aiGenerating) {
                this.ifElseBranchUpdateFunction(0, () => {
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
                                Column.create({ space: 8 });
                                Column.width('100%');
                                Column.padding(10);
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 622, col: 15 });
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 630, col: 15 });
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
                            ListItem.pop();
                        };
                        this.observeComponentCreation2(itemCreation2, ListItem);
                        ListItem.pop();
                    }
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
            if (this.showStrategyDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
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
                                Column.create({ space: 8 });
                                Column.width('100%');
                                Column.padding(10);
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
                                    ? '复杂电路建议「模块并行」（将开启新一轮并行生图）。「整图一次」可继续多轮编辑。'
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 660, col: 15 });
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
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusClassicBtn(this, {
                                            label: '模块并行（先整体设计+边界）',
                                            widthVal: '100%',
                                            onAction: () => {
                                                this.pickStrategy('modular');
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 667, col: 15 });
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
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusClassicBtn(this, {
                                            label: '取消',
                                            widthVal: '100%',
                                            onAction: () => {
                                                this.showStrategyDialog = false;
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 674, col: 15 });
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
                            ListItem.pop();
                        };
                        this.observeComponentCreation2(itemCreation2, ListItem);
                        ListItem.pop();
                    }
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
            if (this.showModeDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
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
                                Column.create({ space: 8 });
                                Column.width('100%');
                                Column.padding(10);
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 698, col: 15 });
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 705, col: 15 });
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
                                            label: '在现有图上 AI 更改',
                                            widthVal: '100%',
                                            onAction: () => {
                                                void this.runGenerate('edit');
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 712, col: 15 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                label: '在现有图上 AI 更改',
                                                widthVal: '100%',
                                                onAction: () => {
                                                    void this.runGenerate('edit');
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            label: '在现有图上 AI 更改',
                                            widthVal: '100%'
                                        });
                                    }
                                }, { name: "ProteusClassicBtn" });
                            }
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('与底栏「修改现有图」相同：保留当前电路，按提示词增量修改（自动整图一次）');
                                Text.fontSize(9);
                                Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                Text.width('100%');
                            }, Text);
                            Text.pop();
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusClassicBtn(this, {
                                            label: '取消',
                                            widthVal: '100%',
                                            onAction: () => {
                                                this.showModeDialog = false;
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 723, col: 15 });
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
                            ListItem.pop();
                        };
                        this.observeComponentCreation2(itemCreation2, ListItem);
                        ListItem.pop();
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        // ---- 中部对话时间线 ----
        List.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- Cline 底栏：输入 + 操作 ----
            Column.create({ space: 4 });
            // ---- Cline 底栏：输入 + 操作 ----
            Column.width('100%');
            // ---- Cline 底栏：输入 + 操作 ----
            Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, top: 6 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextArea(this, {
                        placeholder: '描述电路需求… 例如：STM32F103 最小系统 + LED 闪烁',
                        text: this.promptText,
                        areaHeight: ProteusDimens.TEXTAREA_MIN_HEIGHT,
                        isEnabled: !this.aiGenerating,
                        onChange: (v: string) => { this.promptText = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 747, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: '描述电路需求… 例如：STM32F103 最小系统 + LED 闪烁',
                            text: this.promptText,
                            areaHeight: ProteusDimens.TEXTAREA_MIN_HEIGHT,
                            isEnabled: !this.aiGenerating,
                            onChange: (v: string) => { this.promptText = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: '描述电路需求… 例如：STM32F103 最小系统 + LED 闪烁',
                        text: this.promptText,
                        areaHeight: ProteusDimens.TEXTAREA_MIN_HEIGHT,
                        isEnabled: !this.aiGenerating
                    });
                }
            }, { name: "ProteusTextArea" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 4, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.enableReasoning ? '● 推理开' : '○ 推理关');
            Text.fontSize(10);
            Text.fontColor(this.enableReasoning ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, top: 4, bottom: 4 });
            Text.onClick(() => {
                this.enableReasoning = !this.enableReasoning;
                this.appService.aiEnableReasoning = this.enableReasoning;
                Logger.info(INSTR_TRACE_TAG, `[AI_UI] enableReasoning=${this.enableReasoning}`);
                this.statusMessage = this.enableReasoning
                    ? '已开启推理：选型/建网/布线允许 thinking，并隔离 JSON（较慢）'
                    : '已关闭推理（默认，利于纯 JSON）';
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
            Text.create('难需求可开推理');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.aiGenerating ? '取消' : '生成整图',
                        widthVal: '48%',
                        onAction: () => {
                            this.requestGenerate();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 783, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.aiGenerating ? '取消' : '生成整图',
                            widthVal: '48%',
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
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '修改现有图',
                        widthVal: '48%',
                        onAction: () => {
                            this.requestEditExisting();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 790, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '修改现有图',
                            widthVal: '48%',
                            onAction: () => {
                                this.requestEditExisting();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '修改现有图',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: 'AI自检修复',
                        widthVal: '70%',
                        onAction: () => {
                            if (this.aiGenerating) {
                                this.statusMessage = '请等待当前任务结束';
                                return;
                            }
                            this.showStrategyDialog = false;
                            this.showModeDialog = false;
                            void this.runSelfCheck();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 802, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AI自检修复',
                            widthVal: '70%',
                            onAction: () => {
                                if (this.aiGenerating) {
                                    this.statusMessage = '请等待当前任务结束';
                                    return;
                                }
                                this.showStrategyDialog = false;
                                this.showModeDialog = false;
                                void this.runSelfCheck();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AI自检修复',
                        widthVal: '70%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清空',
                        widthVal: '26%',
                        onAction: () => {
                            this.appService.clearAiGenLogs();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 815, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空',
                            widthVal: '26%',
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
                        widthVal: '26%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        // ---- Cline 底栏：输入 + 操作 ----
        Column.pop();
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
                        onAction: () => {
                            if (this.showAddForm) {
                                this.showAddForm = false;
                                this.resetApiForm();
                            }
                            else {
                                this.resetApiForm();
                                this.showAddForm = true;
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 844, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.showAddForm ? '收起' : '+ 添加',
                            widthVal: 64,
                            onAction: () => {
                                if (this.showAddForm) {
                                    this.showAddForm = false;
                                    this.resetApiForm();
                                }
                                else {
                                    this.resetApiForm();
                                    this.showAddForm = true;
                                }
                            }
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
                        Text.create(this.editingApiId.length > 0 ? '编辑已保存 API' : '选择平台');
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
                                        const nextProvider = this.providerTypes[idx];
                                        const providerChanged = nextProvider !== this.selectedProvider;
                                        this.providerIdx = idx;
                                        this.selectedProvider = nextProvider;
                                        // 编辑中复点同一平台勿覆盖已改的模型名；新建或真正切换厂商才套模板
                                        if (this.editingApiId.length === 0 || providerChanged) {
                                            const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                            if (tmpl.success && tmpl.data) {
                                                this.newApiModel = tmpl.data.model;
                                                this.newApiUrl = tmpl.data.baseUrl;
                                            }
                                        }
                                        // 按厂商同步协议与认证头，避免 DeepSeek 误带 ANTHROPIC_AUTH_TOKEN
                                        if (this.selectedProvider === AiProviderType.CLAUDE) {
                                            this.apiFormatIdx = 0;
                                            this.newApiFormat = 'anthropic';
                                            this.newAuthField = 'x-api-key';
                                        }
                                        else if (this.selectedProvider === AiProviderType.OLLAMA) {
                                            this.apiFormatIdx = 3;
                                            this.newApiFormat = 'ollama';
                                            this.newAuthField = '';
                                        }
                                        else if (this.selectedProvider === AiProviderType.DEEPSEEK) {
                                            this.apiFormatIdx = 2;
                                            this.newApiFormat = 'deepseek';
                                            this.newAuthField = '';
                                        }
                                        else {
                                            this.apiFormatIdx = 1;
                                            this.newApiFormat = 'openai';
                                            this.newAuthField = '';
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 868, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        labels: this.providers,
                                        selectedIdx: this.providerIdx,
                                        colsPerRow: 3,
                                        onSelect: (idx: number) => {
                                            const nextProvider = this.providerTypes[idx];
                                            const providerChanged = nextProvider !== this.selectedProvider;
                                            this.providerIdx = idx;
                                            this.selectedProvider = nextProvider;
                                            // 编辑中复点同一平台勿覆盖已改的模型名；新建或真正切换厂商才套模板
                                            if (this.editingApiId.length === 0 || providerChanged) {
                                                const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                                if (tmpl.success && tmpl.data) {
                                                    this.newApiModel = tmpl.data.model;
                                                    this.newApiUrl = tmpl.data.baseUrl;
                                                }
                                            }
                                            // 按厂商同步协议与认证头，避免 DeepSeek 误带 ANTHROPIC_AUTH_TOKEN
                                            if (this.selectedProvider === AiProviderType.CLAUDE) {
                                                this.apiFormatIdx = 0;
                                                this.newApiFormat = 'anthropic';
                                                this.newAuthField = 'x-api-key';
                                            }
                                            else if (this.selectedProvider === AiProviderType.OLLAMA) {
                                                this.apiFormatIdx = 3;
                                                this.newApiFormat = 'ollama';
                                                this.newAuthField = '';
                                            }
                                            else if (this.selectedProvider === AiProviderType.DEEPSEEK) {
                                                this.apiFormatIdx = 2;
                                                this.newApiFormat = 'deepseek';
                                                this.newAuthField = '';
                                            }
                                            else {
                                                this.apiFormatIdx = 1;
                                                this.newApiFormat = 'openai';
                                                this.newAuthField = '';
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
                        Row.margin({ bottom: 4 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('官网链接');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: 'https://example.com （可选）',
                                    text: this.newApiUrl,
                                    onChange: (v: string) => { this.newApiUrl = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 913, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: 'https://example.com （可选）',
                                        text: this.newApiUrl,
                                        onChange: (v: string) => { this.newApiUrl = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: 'https://example.com （可选）',
                                    text: this.newApiUrl
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                        Row.margin({ bottom: 4 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('API Key');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: this.editingApiId.length > 0 ? '留空则保留原 Key' : 'sk-...',
                                    text: this.newApiKey,
                                    password: true,
                                    onChange: (v: string) => { this.newApiKey = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 925, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: this.editingApiId.length > 0 ? '留空则保留原 Key' : 'sk-...',
                                        text: this.newApiKey,
                                        password: true,
                                        onChange: (v: string) => { this.newApiKey = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: this.editingApiId.length > 0 ? '留空则保留原 Key' : 'sk-...',
                                    text: this.newApiKey,
                                    password: true
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                        Row.margin({ bottom: 4 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('API 格式');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Select.create(this.buildApiFormatOptions());
                        Select.selected(this.apiFormatIdx);
                        Select.value(this.apiFormats[this.apiFormatIdx].label);
                        Select.font({ size: ProteusFonts.INPUT });
                        Select.fontColor(ProteusColors.TEXT_PRIMARY);
                        Select.backgroundColor(ProteusColors.CANVAS_BG);
                        Select.layoutWeight(1);
                        Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
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
                        Row.margin({ bottom: 4 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('认证字段');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: 'x-api-key（Claude）或留空用 Bearer',
                                    text: this.newAuthField,
                                    onChange: (v: string) => { this.newAuthField = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 954, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: 'x-api-key（Claude）或留空用 Bearer',
                                        text: this.newAuthField,
                                        onChange: (v: string) => { this.newAuthField = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: 'x-api-key（Claude）或留空用 Bearer',
                                    text: this.newAuthField
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                        Row.margin({ bottom: 4 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('模型名称');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.key(`api_model_input_${this.editingApiId}`);
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: 'claude-sonnet-4-6',
                                    text: this.newApiModel,
                                    onChange: (v: string) => { this.newApiModel = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 966, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: 'claude-sonnet-4-6',
                                        text: this.newApiModel,
                                        onChange: (v: string) => { this.newApiModel = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: 'claude-sonnet-4-6',
                                    text: this.newApiModel
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
                                    widthVal: '100%',
                                    onAction: () => {
                                        this.saveApiFromForm();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 975, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
                                        widthVal: '100%',
                                        onAction: () => {
                                            this.saveApiFromForm();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
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
                            this.appService.aiApiManager.setLoadBalanceStrategy(this.loadBalanceModes[idx]);
                            this.statusMessage = `负载均衡: ${this.loadBalanceLabels[idx]}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 995, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            labels: this.loadBalanceLabels,
                            selectedIdx: this.selectedStratIdx,
                            colsPerRow: 3,
                            onSelect: (idx: number) => {
                                this.selectedStratIdx = idx;
                                this.appService.aiApiManager.setLoadBalanceStrategy(this.loadBalanceModes[idx]);
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
                    If.create();
                    if (api.id === this.defaultApiId) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('当前');
                                Text.fontSize(8);
                                Text.fontColor(ProteusColors.ERC_OK);
                                Text.margin({ left: 4, right: 4 });
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
                                label: api.id === this.defaultApiId ? '已选' : '选用',
                                widthVal: 44,
                                onAction: () => {
                                    this.selectAsDefault(api);
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 1042, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: api.id === this.defaultApiId ? '已选' : '选用',
                                    widthVal: 44,
                                    onAction: () => {
                                        this.selectAsDefault(api);
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: api.id === this.defaultApiId ? '已选' : '选用',
                                widthVal: 44
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusClassicBtn(this, {
                                label: '编辑', widthVal: 44,
                                onAction: () => {
                                    this.beginEditApi(api);
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 1049, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '编辑',
                                    widthVal: 44,
                                    onAction: () => {
                                        this.beginEditApi(api);
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: '编辑', widthVal: 44
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 1055, col: 15 });
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 1072, col: 15 });
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
                                    if (this.editingApiId === api.id) {
                                        this.showAddForm = false;
                                        this.resetApiForm();
                                    }
                                    Logger.info(INSTR_TRACE_TAG, `[AI_API] removed id=${api.id}`);
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 1084, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '删',
                                    widthVal: 36,
                                    onAction: () => {
                                        this.appService.aiApiManager.removeApi(api.id);
                                        this.appService.syncAiApiConfigsToProject();
                                        if (this.editingApiId === api.id) {
                                            this.showAddForm = false;
                                            this.resetApiForm();
                                        }
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
            this.forEachUpdateFunction(elmtId, this.apiList, forEachItemGenFunction, (api: AiApiConfig) => `${api.id}_${api.model}_${api.name}_${api.enabled}_${this.apiListRev}`, false, false);
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
