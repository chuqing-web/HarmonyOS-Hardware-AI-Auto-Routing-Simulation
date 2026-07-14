if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface AiSettingsPanel_Params {
    statusMessage?: string;
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
    appService?: AppService;
    providerIdx?: number;
    selectedStratIdx?: number;
    providers?: string[];
    providerTypes?: AiProviderType[];
    apiFormats?: ApiFormatOption[];
    loadBalanceLabels?: string[];
    authFieldOptions?: string[];
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { AiProviderType, LoadBalanceMode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
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
        this.__apiList = new ObservedPropertyObjectPU([], this, "apiList");
        this.__showAddForm = new ObservedPropertySimplePU(false, this, "showAddForm");
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
        this.authFieldOptions = [
            'ANTHROPIC_AUTH_TOKEN', 'x-api-key', 'Authorization', 'Bearer', 'X-API-Key'
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
        if (params.authFieldOptions !== undefined) {
            this.authFieldOptions = params.authFieldOptions;
        }
    }
    updateStateVars(params: AiSettingsPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
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
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
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
    private appService: AppService;
    private providerIdx: number;
    private selectedStratIdx: number;
    private providers: string[];
    private providerTypes: AiProviderType[];
    private apiFormats: ApiFormatOption[];
    private loadBalanceLabels: string[];
    private authFieldOptions: string[];
    aboutToAppear(): void {
        this.refreshList();
    }
    refreshList(): void {
        this.apiList = this.appService.aiApiManager.listApis();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
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
            Text.padding({ left: 8, top: 8, bottom: 4 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.showAddForm ? '收起' : '+ 添加',
                        widthVal: 64,
                        onAction: () => { this.showAddForm = !this.showAddForm; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 65, col: 9 });
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
                        // Provider chips
                        Text.create('选择平台');
                        // Provider chips
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        // Provider chips
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        // Provider chips
                        Text.width('100%');
                    }, Text);
                    // Provider chips
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 82, col: 11 });
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
                        // Endpoint URL
                        Row.create();
                        // Endpoint URL
                        Row.width('100%');
                        // Endpoint URL
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
                    // Endpoint URL
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // API Key
                        Row.create();
                        // API Key
                        Row.width('100%');
                        // API Key
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
                    // API Key
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // API Format
                        Row.create();
                        // API Format
                        Row.width('100%');
                        // API Format
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
                    // API Format
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('选择供应商 API 的输入格式');
                        Text.fontSize(8);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                        Text.padding({ left: 56 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // Auth field
                        Row.create();
                        // Auth field
                        Row.width('100%');
                        // Auth field
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
                    // Auth field
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // Model name
                        Row.create();
                        // Model name
                        Row.width('100%');
                        // Model name
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
                    // Model name
                    Row.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '保存 API',
                                    widthVal: '100%',
                                    onAction: () => {
                                        const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                        if (!tmpl.success || !tmpl.data)
                                            return;
                                        const config = tmpl.data;
                                        config.apiKey = this.newApiKey;
                                        config.model = this.newApiModel || config.model;
                                        config.name = this.newApiName || config.name;
                                        config.baseUrl = this.newApiUrl || config.baseUrl;
                                        if (this.newAuthField.length > 0) {
                                            const headers: Record<string, string> = {};
                                            headers[this.newAuthField] = this.newApiKey;
                                            config.customHeaders = headers;
                                        }
                                        this.appService.aiApiManager.addApi(config);
                                        this.refreshList();
                                        this.showAddForm = false;
                                        this.newApiKey = '';
                                        this.newApiUrl = '';
                                        this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                        this.statusMessage = `已添加 ${config.name}`;
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 171, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '保存 API',
                                        widthVal: '100%',
                                        onAction: () => {
                                            const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                            if (!tmpl.success || !tmpl.data)
                                                return;
                                            const config = tmpl.data;
                                            config.apiKey = this.newApiKey;
                                            config.model = this.newApiModel || config.model;
                                            config.name = this.newApiName || config.name;
                                            config.baseUrl = this.newApiUrl || config.baseUrl;
                                            if (this.newAuthField.length > 0) {
                                                const headers: Record<string, string> = {};
                                                headers[this.newAuthField] = this.newApiKey;
                                                config.customHeaders = headers;
                                            }
                                            this.appService.aiApiManager.addApi(config);
                                            this.refreshList();
                                            this.showAddForm = false;
                                            this.newApiKey = '';
                                            this.newApiUrl = '';
                                            this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                            this.statusMessage = `已添加 ${config.name}`;
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
            // Load balance
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Load balance
            Text.create('负载均衡策略');
            // Load balance
            Text.fontSize(ProteusFonts.PARAM_KEY);
            // Load balance
            Text.fontColor(ProteusColors.TEXT_LABEL);
            // Load balance
            Text.margin({ left: 6, top: 4 });
            // Load balance
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        // Load balance
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 211, col: 7 });
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
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Configured APIs list
            Row.create();
            // Configured APIs list
            Row.width('100%');
            // Configured APIs list
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
        // Configured APIs list
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create({ space: 2 });
            List.layoutWeight(1);
            List.width('100%');
            List.padding({ left: 4, right: 4, top: 2 });
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const api = _item;
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
                                            const result = await this.appService.aiApiManager.testConnection(api.id);
                                            this.statusMessage = result.success ? `${api.name} 连接成功` : `${api.name} 失败`;
                                            this.refreshList();
                                        }
                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 257, col: 17 });
                                    ViewPU.create(componentCall);
                                    let paramsLambda = () => {
                                        return {
                                            label: '测试',
                                            widthVal: 44,
                                            onAction: async () => {
                                                this.statusMessage = `测试 ${api.name}...`;
                                                const result = await this.appService.aiApiManager.testConnection(api.id);
                                                this.statusMessage = result.success ? `${api.name} 连接成功` : `${api.name} 失败`;
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
                                            this.refreshList();
                                        }
                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 266, col: 17 });
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
                                            this.refreshList();
                                        }
                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 277, col: 17 });
                                    ViewPU.create(componentCall);
                                    let paramsLambda = () => {
                                        return {
                                            label: '删',
                                            widthVal: 36,
                                            onAction: () => {
                                                this.appService.aiApiManager.removeApi(api.id);
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
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.apiList, forEachItemGenFunction, (api: AiApiConfig) => api.id, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 4, right: 4, top: 4, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '导入', widthVal: '30%',
                        onAction: () => { this.statusMessage = '请将 JSON 配置文件放入应用目录后导入'; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 296, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '导入',
                            widthVal: '30%',
                            onAction: () => { this.statusMessage = '请将 JSON 配置文件放入应用目录后导入'; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '导入', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '导出', widthVal: '30%',
                        onAction: () => {
                            const result = this.appService.aiApiManager.exportConfigs(true);
                            this.statusMessage = result.success ? '配置已导出' : '导出失败';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 300, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '导出',
                            widthVal: '30%',
                            onAction: () => {
                                const result = this.appService.aiApiManager.exportConfigs(true);
                                this.statusMessage = result.success ? '配置已导出' : '导出失败';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '导出', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清空', widthVal: '30%',
                        onAction: () => {
                            this.appService.aiApiManager.clearAllConfigs();
                            this.refreshList();
                            this.statusMessage = '已清空所有 AI 配置';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 307, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空',
                            widthVal: '30%',
                            onAction: () => {
                                this.appService.aiApiManager.clearAllConfigs();
                                this.refreshList();
                                this.statusMessage = '已清空所有 AI 配置';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清空', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
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
