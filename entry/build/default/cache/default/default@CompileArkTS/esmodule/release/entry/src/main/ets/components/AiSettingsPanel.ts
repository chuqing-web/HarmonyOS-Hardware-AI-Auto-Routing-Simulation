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
    constructor(g69, h69, i69, j69 = -1, k69 = undefined, l69) {
        super(g69, i69, j69, l69);
        if (typeof k69 === "function") {
            this.paramsGenerator_ = k69;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(h69.statusMessage, this, "statusMessage");
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
        this.setInitiallyProvidedValue(h69);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(f69: AiSettingsPanel_Params) {
        if (f69.apiList !== undefined) {
            this.apiList = f69.apiList;
        }
        if (f69.showAddForm !== undefined) {
            this.showAddForm = f69.showAddForm;
        }
        if (f69.newApiName !== undefined) {
            this.newApiName = f69.newApiName;
        }
        if (f69.newApiKey !== undefined) {
            this.newApiKey = f69.newApiKey;
        }
        if (f69.newApiModel !== undefined) {
            this.newApiModel = f69.newApiModel;
        }
        if (f69.newApiUrl !== undefined) {
            this.newApiUrl = f69.newApiUrl;
        }
        if (f69.newApiFormat !== undefined) {
            this.newApiFormat = f69.newApiFormat;
        }
        if (f69.newAuthField !== undefined) {
            this.newAuthField = f69.newAuthField;
        }
        if (f69.selectedProvider !== undefined) {
            this.selectedProvider = f69.selectedProvider;
        }
        if (f69.apiFormatIdx !== undefined) {
            this.apiFormatIdx = f69.apiFormatIdx;
        }
        if (f69.appService !== undefined) {
            this.appService = f69.appService;
        }
        if (f69.providerIdx !== undefined) {
            this.providerIdx = f69.providerIdx;
        }
        if (f69.selectedStratIdx !== undefined) {
            this.selectedStratIdx = f69.selectedStratIdx;
        }
        if (f69.providers !== undefined) {
            this.providers = f69.providers;
        }
        if (f69.providerTypes !== undefined) {
            this.providerTypes = f69.providerTypes;
        }
        if (f69.apiFormats !== undefined) {
            this.apiFormats = f69.apiFormats;
        }
        if (f69.loadBalanceLabels !== undefined) {
            this.loadBalanceLabels = f69.loadBalanceLabels;
        }
        if (f69.authFieldOptions !== undefined) {
            this.authFieldOptions = f69.authFieldOptions;
        }
    }
    updateStateVars(e69: AiSettingsPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(d69) {
        this.__statusMessage.purgeDependencyOnElmtId(d69);
        this.__apiList.purgeDependencyOnElmtId(d69);
        this.__showAddForm.purgeDependencyOnElmtId(d69);
        this.__newApiName.purgeDependencyOnElmtId(d69);
        this.__newApiKey.purgeDependencyOnElmtId(d69);
        this.__newApiModel.purgeDependencyOnElmtId(d69);
        this.__newApiUrl.purgeDependencyOnElmtId(d69);
        this.__newApiFormat.purgeDependencyOnElmtId(d69);
        this.__newAuthField.purgeDependencyOnElmtId(d69);
        this.__selectedProvider.purgeDependencyOnElmtId(d69);
        this.__apiFormatIdx.purgeDependencyOnElmtId(d69);
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
    set statusMessage(c69: string) {
        this.__statusMessage.set(c69);
    }
    private __apiList: ObservedPropertyObjectPU<AiApiConfig[]>;
    get apiList() {
        return this.__apiList.get();
    }
    set apiList(b69: AiApiConfig[]) {
        this.__apiList.set(b69);
    }
    private __showAddForm: ObservedPropertySimplePU<boolean>;
    get showAddForm() {
        return this.__showAddForm.get();
    }
    set showAddForm(a69: boolean) {
        this.__showAddForm.set(a69);
    }
    private __newApiName: ObservedPropertySimplePU<string>;
    get newApiName() {
        return this.__newApiName.get();
    }
    set newApiName(z68: string) {
        this.__newApiName.set(z68);
    }
    private __newApiKey: ObservedPropertySimplePU<string>;
    get newApiKey() {
        return this.__newApiKey.get();
    }
    set newApiKey(y68: string) {
        this.__newApiKey.set(y68);
    }
    private __newApiModel: ObservedPropertySimplePU<string>;
    get newApiModel() {
        return this.__newApiModel.get();
    }
    set newApiModel(x68: string) {
        this.__newApiModel.set(x68);
    }
    private __newApiUrl: ObservedPropertySimplePU<string>;
    get newApiUrl() {
        return this.__newApiUrl.get();
    }
    set newApiUrl(w68: string) {
        this.__newApiUrl.set(w68);
    }
    private __newApiFormat: ObservedPropertySimplePU<string>;
    get newApiFormat() {
        return this.__newApiFormat.get();
    }
    set newApiFormat(v68: string) {
        this.__newApiFormat.set(v68);
    }
    private __newAuthField: ObservedPropertySimplePU<string>;
    get newAuthField() {
        return this.__newAuthField.get();
    }
    set newAuthField(u68: string) {
        this.__newAuthField.set(u68);
    }
    private __selectedProvider: ObservedPropertySimplePU<AiProviderType>;
    get selectedProvider() {
        return this.__selectedProvider.get();
    }
    set selectedProvider(t68: AiProviderType) {
        this.__selectedProvider.set(t68);
    }
    private __apiFormatIdx: ObservedPropertySimplePU<number>;
    get apiFormatIdx() {
        return this.__apiFormatIdx.get();
    }
    set apiFormatIdx(s68: number) {
        this.__apiFormatIdx.set(s68);
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
        this.observeComponentCreation2((q68, r68) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        this.observeComponentCreation2((o68, p68) => {
            Row.create();
            Row.width('100%');
            Row.padding({ right: 6 });
        }, Row);
        this.observeComponentCreation2((m68, n68) => {
            Text.create('AI API 管理');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
            Text.padding({ left: 8, top: 8, bottom: 4 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((i68, j68) => {
                if (j68) {
                    let k68 = new ProteusClassicBtn(this, {
                        label: this.showAddForm ? '收起' : '+ 添加',
                        widthVal: 64,
                        onAction: () => { this.showAddForm = !this.showAddForm; }
                    }, undefined, i68, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 65, col: 9 });
                    ViewPU.create(k68);
                    let l68 = () => {
                        return {
                            label: this.showAddForm ? '收起' : '+ 添加',
                            widthVal: 64,
                            onAction: () => { this.showAddForm = !this.showAddForm; }
                        };
                    };
                    k68.paramsGenerator_ = l68;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i68, {
                        label: this.showAddForm ? '收起' : '+ 添加',
                        widthVal: 64
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((v65, w65) => {
            If.create();
            if (this.showAddForm) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((g68, h68) => {
                        Column.create({ space: 4 });
                        Column.padding({ left: 6, right: 6, top: 4, bottom: 4 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.margin({ left: 4, right: 4, top: 2 });
                    }, Column);
                    this.observeComponentCreation2((e68, f68) => {
                        Text.create('选择平台');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((c68, d68) => {
                        __Common__.create();
                        __Common__.padding({ left: 8, right: 8, top: 2, bottom: 4 });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((u67, v67) => {
                            if (v67) {
                                let w67 = new ProteusChipGrid(this, {
                                    labels: this.providers,
                                    selectedIdx: this.providerIdx,
                                    colsPerRow: 3,
                                    onSelect: (a68: number) => {
                                        this.providerIdx = a68;
                                        this.selectedProvider = this.providerTypes[a68];
                                        const b68 = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                        if (b68.success && b68.data) {
                                            this.newApiModel = b68.data.model;
                                            this.newApiUrl = b68.data.baseUrl;
                                        }
                                    }
                                }, undefined, u67, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 82, col: 11 });
                                ViewPU.create(w67);
                                let x67 = () => {
                                    return {
                                        labels: this.providers,
                                        selectedIdx: this.providerIdx,
                                        colsPerRow: 3,
                                        onSelect: (y67: number) => {
                                            this.providerIdx = y67;
                                            this.selectedProvider = this.providerTypes[y67];
                                            const z67 = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                                            if (z67.success && z67.data) {
                                                this.newApiModel = z67.data.model;
                                                this.newApiUrl = z67.data.baseUrl;
                                            }
                                        }
                                    };
                                };
                                w67.paramsGenerator_ = x67;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(u67, {
                                    labels: this.providers,
                                    selectedIdx: this.providerIdx,
                                    colsPerRow: 3
                                });
                            }
                        }, { name: "ProteusChipGrid" });
                    }
                    __Common__.pop();
                    this.observeComponentCreation2((s67, t67) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 2 });
                    }, Divider);
                    this.observeComponentCreation2((q67, r67) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((o67, p67) => {
                        Text.create('官网链接');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((l67, m67) => {
                        TextInput.create({ placeholder: 'https://example.com （可选）', text: this.newApiUrl });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((n67: string) => { this.newApiUrl = n67; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((j67, k67) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((h67, i67) => {
                        Text.create('API Key');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((e67, f67) => {
                        TextInput.create({ placeholder: 'sk-...', text: this.newApiKey });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.type(InputType.Password);
                        TextInput.onChange((g67: string) => { this.newApiKey = g67; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((c67, d67) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((a67, b67) => {
                        Text.create('API 格式');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((x66, y66) => {
                        Select.create(this.buildApiFormatOptions());
                        Select.selected(this.apiFormatIdx);
                        Select.value(this.apiFormats[this.apiFormatIdx].label);
                        Select.font({ size: 10 });
                        Select.fontColor(ProteusColors.TEXT_PRIMARY);
                        Select.backgroundColor(ProteusColors.CANVAS_BG);
                        Select.layoutWeight(1);
                        Select.height(26);
                        Select.onSelect((z66: number) => {
                            this.apiFormatIdx = z66;
                            this.newApiFormat = this.apiFormats[z66].value;
                        });
                    }, Select);
                    Select.pop();
                    Row.pop();
                    this.observeComponentCreation2((v66, w66) => {
                        Text.create('选择供应商 API 的输入格式');
                        Text.fontSize(8);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                        Text.padding({ left: 56 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((t66, u66) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((r66, s66) => {
                        Text.create('认证字段');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((o66, p66) => {
                        TextInput.create({ placeholder: 'ANTHROPIC_AUTH_TOKEN（默认）', text: this.newAuthField });
                        TextInput.layoutWeight(1);
                        TextInput.height(26);
                        TextInput.fontSize(10);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((q66: string) => { this.newAuthField = q66; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((m66, n66) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((k66, l66) => {
                        Text.create('模型名称');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(52);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((h66, i66) => {
                        TextInput.create({ placeholder: 'claude-sonnet-4-6', text: this.newApiModel });
                        TextInput.layoutWeight(1);
                        TextInput.height(26);
                        TextInput.fontSize(10);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.onChange((j66: string) => { this.newApiModel = j66; });
                    }, TextInput);
                    Row.pop();
                    {
                        this.observeComponentCreation2((x65, y65) => {
                            if (y65) {
                                let z65 = new ProteusClassicBtn(this, {
                                    label: '保存 API',
                                    widthVal: '100%',
                                    onAction: () => {
                                        const e66 = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                        if (!e66.success || !e66.data)
                                            return;
                                        const f66 = e66.data;
                                        f66.apiKey = this.newApiKey;
                                        f66.model = this.newApiModel || f66.model;
                                        f66.name = this.newApiName || f66.name;
                                        f66.baseUrl = this.newApiUrl || f66.baseUrl;
                                        if (this.newAuthField.length > 0) {
                                            const g66: Record<string, string> = {};
                                            g66[this.newAuthField] = this.newApiKey;
                                            f66.customHeaders = g66;
                                        }
                                        this.appService.aiApiManager.addApi(f66);
                                        this.refreshList();
                                        this.showAddForm = false;
                                        this.newApiKey = '';
                                        this.newApiUrl = '';
                                        this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                        this.statusMessage = `已添加 ${f66.name}`;
                                    }
                                }, undefined, x65, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 171, col: 11 });
                                ViewPU.create(z65);
                                let a66 = () => {
                                    return {
                                        label: '保存 API',
                                        widthVal: '100%',
                                        onAction: () => {
                                            const b66 = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, this.newApiName || 'New API');
                                            if (!b66.success || !b66.data)
                                                return;
                                            const c66 = b66.data;
                                            c66.apiKey = this.newApiKey;
                                            c66.model = this.newApiModel || c66.model;
                                            c66.name = this.newApiName || c66.name;
                                            c66.baseUrl = this.newApiUrl || c66.baseUrl;
                                            if (this.newAuthField.length > 0) {
                                                const d66: Record<string, string> = {};
                                                d66[this.newAuthField] = this.newApiKey;
                                                c66.customHeaders = d66;
                                            }
                                            this.appService.aiApiManager.addApi(c66);
                                            this.refreshList();
                                            this.showAddForm = false;
                                            this.newApiKey = '';
                                            this.newApiUrl = '';
                                            this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
                                            this.statusMessage = `已添加 ${c66.name}`;
                                        }
                                    };
                                };
                                z65.paramsGenerator_ = a66;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(x65, {
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
        this.observeComponentCreation2((t65, u65) => {
            Text.create('负载均衡策略');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.margin({ left: 6, top: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r65, s65) => {
            __Common__.create();
            __Common__.width('100%');
            __Common__.padding({ left: 8, right: 8, top: 2, bottom: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((j65, k65) => {
                if (k65) {
                    let l65 = new ProteusChipGrid(this, {
                        labels: this.loadBalanceLabels,
                        selectedIdx: this.selectedStratIdx,
                        colsPerRow: 3,
                        onSelect: (p65: number) => {
                            this.selectedStratIdx = p65;
                            const q65 = [LoadBalanceMode.PRIORITY, LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER];
                            this.appService.aiApiManager.setLoadBalanceStrategy(q65[p65]);
                            this.statusMessage = `负载均衡: ${this.loadBalanceLabels[p65]}`;
                        }
                    }, undefined, j65, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 211, col: 7 });
                    ViewPU.create(l65);
                    let m65 = () => {
                        return {
                            labels: this.loadBalanceLabels,
                            selectedIdx: this.selectedStratIdx,
                            colsPerRow: 3,
                            onSelect: (n65: number) => {
                                this.selectedStratIdx = n65;
                                const o65 = [LoadBalanceMode.PRIORITY, LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER];
                                this.appService.aiApiManager.setLoadBalanceStrategy(o65[n65]);
                                this.statusMessage = `负载均衡: ${this.loadBalanceLabels[n65]}`;
                            }
                        };
                    };
                    l65.paramsGenerator_ = m65;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j65, {
                        labels: this.loadBalanceLabels,
                        selectedIdx: this.selectedStratIdx,
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        __Common__.pop();
        this.observeComponentCreation2((h65, i65) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((f65, g65) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 6, right: 6, top: 4 });
        }, Row);
        this.observeComponentCreation2((d65, e65) => {
            Text.create('已配置 API');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((b65, c65) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((z64, a65) => {
            Text.create(`${this.apiList.length} 个`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((x64, y64) => {
            List.create({ space: 2 });
            List.layoutWeight(1);
            List.width('100%');
            List.padding({ left: 4, right: 4, top: 2 });
        }, List);
        this.observeComponentCreation2((i63, j63) => {
            ForEach.create();
            const k63 = m63 => {
                const n63 = m63;
                {
                    const o63 = (v64, w64) => {
                        ViewStackProcessor.StartGetAccessRecordingFor(v64);
                        ListItem.create(q63, true);
                        if (!w64) {
                            ListItem.pop();
                        }
                        ViewStackProcessor.StopGetAccessRecording();
                    };
                    const p63 = (t64, u64) => {
                        ListItem.create(q63, true);
                    };
                    const q63 = (r63, s63) => {
                        o63(r63, s63);
                        this.observeComponentCreation2((r64, s64) => {
                            Column.create();
                            Column.width('100%');
                            Column.padding({ left: 6, right: 6, top: 4, bottom: 4 });
                            Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                            Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        }, Column);
                        this.observeComponentCreation2((p64, q64) => {
                            Row.create();
                            Row.width('100%');
                        }, Row);
                        this.observeComponentCreation2((n64, o64) => {
                            Text.create(n63.name);
                            Text.fontSize(10);
                            Text.fontColor(ProteusColors.TEXT_PRIMARY);
                            Text.fontWeight(FontWeight.Medium);
                            Text.maxLines(1);
                            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                            Text.layoutWeight(1);
                        }, Text);
                        Text.pop();
                        this.observeComponentCreation2((l64, m64) => {
                            Text.create(n63.enabled ? '●' : '○');
                            Text.fontSize(8);
                            Text.fontColor(n63.enabled ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
                            Text.margin({ left: 4 });
                        }, Text);
                        Text.pop();
                        Row.pop();
                        this.observeComponentCreation2((j64, k64) => {
                            Text.create(`${n63.model}`);
                            Text.fontSize(9);
                            Text.fontColor(ProteusColors.TEXT_LABEL);
                            Text.width('100%');
                            Text.maxLines(1);
                            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                        }, Text);
                        Text.pop();
                        this.observeComponentCreation2((h64, i64) => {
                            Row.create({ space: 3 });
                            Row.width('100%');
                        }, Row);
                        {
                            this.observeComponentCreation2((b64, c64) => {
                                if (c64) {
                                    let d64 = new ProteusClassicBtn(this, {
                                        label: '测试', widthVal: 44,
                                        onAction: async () => {
                                            this.statusMessage = `测试 ${n63.name}...`;
                                            const g64 = await this.appService.aiApiManager.testConnection(n63.id);
                                            this.statusMessage = g64.success ? `${n63.name} 连接成功` : `${n63.name} 失败`;
                                            this.refreshList();
                                        }
                                    }, undefined, b64, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 257, col: 17 });
                                    ViewPU.create(d64);
                                    let e64 = () => {
                                        return {
                                            label: '测试',
                                            widthVal: 44,
                                            onAction: async () => {
                                                this.statusMessage = `测试 ${n63.name}...`;
                                                const f64 = await this.appService.aiApiManager.testConnection(n63.id);
                                                this.statusMessage = f64.success ? `${n63.name} 连接成功` : `${n63.name} 失败`;
                                                this.refreshList();
                                            }
                                        };
                                    };
                                    d64.paramsGenerator_ = e64;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(b64, {
                                        label: '测试', widthVal: 44
                                    });
                                }
                            }, { name: "ProteusClassicBtn" });
                        }
                        {
                            this.observeComponentCreation2((x63, y63) => {
                                if (y63) {
                                    let z63 = new ProteusClassicBtn(this, {
                                        label: n63.enabled ? '禁用' : '启用',
                                        widthVal: 44,
                                        onAction: () => {
                                            if (n63.enabled) {
                                                this.appService.aiApiManager.disableApi(n63.id);
                                            }
                                            else {
                                                this.appService.aiApiManager.enableApi(n63.id);
                                            }
                                            this.refreshList();
                                        }
                                    }, undefined, x63, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 266, col: 17 });
                                    ViewPU.create(z63);
                                    let a64 = () => {
                                        return {
                                            label: n63.enabled ? '禁用' : '启用',
                                            widthVal: 44,
                                            onAction: () => {
                                                if (n63.enabled) {
                                                    this.appService.aiApiManager.disableApi(n63.id);
                                                }
                                                else {
                                                    this.appService.aiApiManager.enableApi(n63.id);
                                                }
                                                this.refreshList();
                                            }
                                        };
                                    };
                                    z63.paramsGenerator_ = a64;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(x63, {
                                        label: n63.enabled ? '禁用' : '启用',
                                        widthVal: 44
                                    });
                                }
                            }, { name: "ProteusClassicBtn" });
                        }
                        {
                            this.observeComponentCreation2((t63, u63) => {
                                if (u63) {
                                    let v63 = new ProteusClassicBtn(this, {
                                        label: '删', widthVal: 36,
                                        onAction: () => {
                                            this.appService.aiApiManager.removeApi(n63.id);
                                            this.refreshList();
                                        }
                                    }, undefined, t63, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 277, col: 17 });
                                    ViewPU.create(v63);
                                    let w63 = () => {
                                        return {
                                            label: '删',
                                            widthVal: 36,
                                            onAction: () => {
                                                this.appService.aiApiManager.removeApi(n63.id);
                                                this.refreshList();
                                            }
                                        };
                                    };
                                    v63.paramsGenerator_ = w63;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(t63, {
                                        label: '删', widthVal: 36
                                    });
                                }
                            }, { name: "ProteusClassicBtn" });
                        }
                        Row.pop();
                        Column.pop();
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(p63, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(i63, this.apiList, k63, (l63: AiApiConfig) => l63.id, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        this.observeComponentCreation2((g63, h63) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 4, right: 4, top: 4, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((c63, d63) => {
                if (d63) {
                    let e63 = new ProteusClassicBtn(this, {
                        label: '导入', widthVal: '30%',
                        onAction: () => { this.statusMessage = '请将 JSON 配置文件放入应用目录后导入'; }
                    }, undefined, c63, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 296, col: 9 });
                    ViewPU.create(e63);
                    let f63 = () => {
                        return {
                            label: '导入',
                            widthVal: '30%',
                            onAction: () => { this.statusMessage = '请将 JSON 配置文件放入应用目录后导入'; }
                        };
                    };
                    e63.paramsGenerator_ = f63;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c63, {
                        label: '导入', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((w62, x62) => {
                if (x62) {
                    let y62 = new ProteusClassicBtn(this, {
                        label: '导出', widthVal: '30%',
                        onAction: () => {
                            const b63 = this.appService.aiApiManager.exportConfigs(true);
                            this.statusMessage = b63.success ? '配置已导出' : '导出失败';
                        }
                    }, undefined, w62, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 300, col: 9 });
                    ViewPU.create(y62);
                    let z62 = () => {
                        return {
                            label: '导出',
                            widthVal: '30%',
                            onAction: () => {
                                const a63 = this.appService.aiApiManager.exportConfigs(true);
                                this.statusMessage = a63.success ? '配置已导出' : '导出失败';
                            }
                        };
                    };
                    y62.paramsGenerator_ = z62;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w62, {
                        label: '导出', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((s62, t62) => {
                if (t62) {
                    let u62 = new ProteusClassicBtn(this, {
                        label: '清空', widthVal: '30%',
                        onAction: () => {
                            this.appService.aiApiManager.clearAllConfigs();
                            this.refreshList();
                            this.statusMessage = '已清空所有 AI 配置';
                        }
                    }, undefined, s62, () => { }, { page: "entry/src/main/ets/components/AiSettingsPanel.ets", line: 307, col: 9 });
                    ViewPU.create(u62);
                    let v62 = () => {
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
                    u62.paramsGenerator_ = v62;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(s62, {
                        label: '清空', widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    private buildApiFormatOptions(): SelectValueOption[] {
        const p62: SelectValueOption[] = [];
        for (let q62 = 0; q62 < this.apiFormats.length; q62++) {
            const r62: SelectValueOption = { value: this.apiFormats[q62].label };
            p62.push(r62);
        }
        return p62;
    }
    rerender() {
        this.updateDirtyElements();
    }
}
interface SelectValueOption {
    value: string;
}
