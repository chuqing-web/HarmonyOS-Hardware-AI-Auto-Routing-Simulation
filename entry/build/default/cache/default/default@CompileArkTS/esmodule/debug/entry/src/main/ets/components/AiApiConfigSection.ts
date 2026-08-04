if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface AiApiConfigSection_Params {
    statusMessage?: string;
    refreshTick?: number;
    apiList?: AiApiConfig[];
    showAddForm?: boolean;
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
import { AiProviderType, LoadBalanceMode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, Result } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
interface ApiFormatOption {
    label: string;
    value: string;
}
interface SelectValueOption {
    value: string;
}
export class AiApiConfigSection extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__refreshTick = new SynchedPropertySimpleOneWayPU(params.refreshTick, this, "refreshTick");
        this.__apiList = new ObservedPropertyObjectPU([], this, "apiList");
        this.__showAddForm = new ObservedPropertySimplePU(false, this, "showAddForm");
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
        this.declareWatch("refreshTick", this.onRefreshTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: AiApiConfigSection_Params) {
        if (params.refreshTick === undefined) {
            this.__refreshTick.set(0);
        }
        if (params.apiList !== undefined) {
            this.apiList = params.apiList;
        }
        if (params.showAddForm !== undefined) {
            this.showAddForm = params.showAddForm;
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
    updateStateVars(params: AiApiConfigSection_Params) {
        this.__refreshTick.reset(params.refreshTick);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__refreshTick.purgeDependencyOnElmtId(rmElmtId);
        this.__apiList.purgeDependencyOnElmtId(rmElmtId);
        this.__showAddForm.purgeDependencyOnElmtId(rmElmtId);
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
        this.__refreshTick.aboutToBeDeleted();
        this.__apiList.aboutToBeDeleted();
        this.__showAddForm.aboutToBeDeleted();
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
    /** 外部递增时刷新列表（例如面板 aboutToAppear） */
    private __refreshTick: SynchedPropertySimpleOneWayPU<number>;
    get refreshTick() {
        return this.__refreshTick.get();
    }
    set refreshTick(newValue: number) {
        this.__refreshTick.set(newValue);
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
            this.selectedStratIdx = 1;
        }
    }
    private onRefreshTick(): void {
        this.refreshList();
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
        this.statusMessage = `已选用 ${api.name}（指定默认）`;
    }
    private saveApiFromForm(): void {
        const isEdit = this.editingApiId.length > 0;
        if (isEdit) {
            const keyTrim = this.newApiKey.trim();
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
                        name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
                        model: modelVal, apiKey: keyTrim, customHeaders: headers, remark: remarkVal
                    });
                }
                else {
                    upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
                        name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
                        model: modelVal, apiKey: keyTrim, remark: remarkVal
                    });
                }
            }
            else {
                upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
                    name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
                    model: modelVal, remark: remarkVal
                });
            }
            if (!upd.success) {
                this.statusMessage = upd.error ?? '更新 API 失败';
                return;
            }
            const synced = this.appService.syncAiApiConfigsToProject();
            this.refreshList();
            this.showAddForm = false;
            this.resetApiForm();
            this.statusMessage = synced ? '已更新并同步 API 配置' : '已更新到内存，金库保存失败请重试';
            return;
        }
        const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
        if (!tmpl.success || !tmpl.data) {
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
            this.statusMessage = addResult.error ?? '保存 API 失败';
            return;
        }
        const syncedAdd = this.appService.syncAiApiConfigsToProject();
        this.refreshList();
        this.showAddForm = false;
        this.resetApiForm();
        this.statusMessage = syncedAdd
            ? `已添加并同步 ${config.name}`
            : `已添加 ${config.name}，但金库保存失败请重试`;
    }
    private buildApiFormatOptions(): SelectValueOption[] {
        const opts: SelectValueOption[] = [];
        for (let i = 0; i < this.apiFormats.length; i++) {
            opts.push({ value: this.apiFormats[i].label });
        }
        return opts;
    }
    initialRender() {
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 270, col: 9 });
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
                                        if (this.editingApiId.length === 0 || providerChanged) {
                                            const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                            if (tmpl.success && tmpl.data) {
                                                this.newApiModel = tmpl.data.model;
                                                this.newApiUrl = tmpl.data.baseUrl;
                                            }
                                        }
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 294, col: 11 });
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
                                            if (this.editingApiId.length === 0 || providerChanged) {
                                                const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                                if (tmpl.success && tmpl.data) {
                                                    this.newApiModel = tmpl.data.model;
                                                    this.newApiUrl = tmpl.data.baseUrl;
                                                }
                                            }
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 337, col: 13 });
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 348, col: 13 });
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 376, col: 13 });
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
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: 'claude-sonnet-4-6',
                                    text: this.newApiModel,
                                    onChange: (v: string) => { this.newApiModel = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 387, col: 13 });
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
                                    onAction: () => { this.saveApiFromForm(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 394, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
                                        widthVal: '100%',
                                        onAction: () => { this.saveApiFromForm(); }
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 412, col: 7 });
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
                                onAction: () => { this.selectAsDefault(api); }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 457, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: api.id === this.defaultApiId ? '已选' : '选用',
                                    widthVal: 44,
                                    onAction: () => { this.selectAsDefault(api); }
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
                                onAction: () => { this.beginEditApi(api); }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 462, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '编辑',
                                    widthVal: 44,
                                    onAction: () => { this.beginEditApi(api); }
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
                                    const result = await this.appService.aiApiManager.testConnection(api.id);
                                    this.statusMessage = result.success
                                        ? `${api.name} 连接成功`
                                        : `${api.name} 失败: ${result.error ?? ''}`;
                                    this.appService.syncAiApiConfigsToProject();
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 466, col: 15 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '测试',
                                    widthVal: 44,
                                    onAction: async () => {
                                        this.statusMessage = `测试 ${api.name}...`;
                                        const result = await this.appService.aiApiManager.testConnection(api.id);
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 478, col: 15 });
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
                                    this.refreshList();
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiApiConfigSection.ets", line: 490, col: 15 });
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
    rerender() {
        this.updateDirtyElements();
    }
}
