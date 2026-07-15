if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface InstrTraceLogPanel_Params {
    statusMessage?: string;
    logText?: string;
    lineCount?: number;
    refreshTimer?: number;
    lastSeq?: number;
}
import pasteboard from "@ohos:pasteboard";
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
export class InstrTraceLogPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__logText = new ObservedPropertySimplePU('', this, "logText");
        this.__lineCount = new ObservedPropertySimplePU(0, this, "lineCount");
        this.refreshTimer = -1;
        this.lastSeq = -1;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: InstrTraceLogPanel_Params) {
        if (params.logText !== undefined) {
            this.logText = params.logText;
        }
        if (params.lineCount !== undefined) {
            this.lineCount = params.lineCount;
        }
        if (params.refreshTimer !== undefined) {
            this.refreshTimer = params.refreshTimer;
        }
        if (params.lastSeq !== undefined) {
            this.lastSeq = params.lastSeq;
        }
    }
    updateStateVars(params: InstrTraceLogPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__logText.purgeDependencyOnElmtId(rmElmtId);
        this.__lineCount.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__logText.aboutToBeDeleted();
        this.__lineCount.aboutToBeDeleted();
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
    private __logText: ObservedPropertySimplePU<string>;
    get logText() {
        return this.__logText.get();
    }
    set logText(newValue: string) {
        this.__logText.set(newValue);
    }
    private __lineCount: ObservedPropertySimplePU<number>;
    get lineCount() {
        return this.__lineCount.get();
    }
    set lineCount(newValue: number) {
        this.__lineCount.set(newValue);
    }
    private refreshTimer: number;
    private lastSeq: number;
    aboutToAppear(): void {
        this.pullLog(true);
        this.refreshTimer = setInterval(() => {
            this.pullLog(false);
        }, 400);
    }
    aboutToDisappear(): void {
        if (this.refreshTimer >= 0) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = -1;
        }
    }
    private pullLog(force: boolean): void {
        const seq = Logger.getInstrTraceSeq();
        if (!force && seq === this.lastSeq) {
            return;
        }
        this.lastSeq = seq;
        this.lineCount = Logger.getInstrTraceLineCount();
        this.logText = Logger.getInstrTraceText();
    }
    private async copyAll(): Promise<void> {
        const text = this.logText.length > 0 ? this.logText : Logger.getInstrTraceText();
        if (text.length === 0) {
            this.statusMessage = '运行日志为空';
            return;
        }
        try {
            const data = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
            await pasteboard.getSystemPasteboard().setData(data);
            this.statusMessage = `已复制 instr_trace ${this.lineCount} 行`;
        }
        catch (_e) {
            this.statusMessage = '复制失败';
        }
    }
    private clearLog(): void {
        Logger.clearInstrTrace();
        this.pullLog(true);
        this.statusMessage = '已清空运行日志';
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
            Column.width('100%');
            Column.height('100%');
            Column.alignItems(HorizontalAlign.Start);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: '运行日志 (instr_trace)' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrTraceLogPanel.ets", line: 65, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '运行日志 (instr_trace)'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '运行日志 (instr_trace)'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 6, right: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.lineCount} 行`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.layoutWeight(1);
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '复制全部',
                        widthVal: 72,
                        onAction: () => { void this.copyAll(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrTraceLogPanel.ets", line: 73, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '复制全部',
                            widthVal: 72,
                            onAction: () => { void this.copyAll(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '复制全部',
                        widthVal: 72
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清空',
                        widthVal: 56,
                        onAction: () => this.clearLog()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrTraceLogPanel.ets", line: 78, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空',
                            widthVal: 56,
                            onAction: () => this.clearLog()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清空',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('可拖选文本后 Ctrl+C / 长按复制；或点「复制全部」');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, bottom: 2 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextArea.create({ text: this.logText.length > 0 ? this.logText : '(暂无 instr_trace 日志)' });
            TextArea.width('100%');
            TextArea.layoutWeight(1);
            TextArea.fontSize(10);
            TextArea.fontColor(ProteusColors.TEXT_PRIMARY);
            TextArea.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            TextArea.caretColor(ProteusColors.TEXT_PRIMARY);
            TextArea.copyOption(CopyOptions.LocalDevice);
            TextArea.enableKeyboardOnFocus(false);
            TextArea.padding(6);
            TextArea.margin({ left: 4, right: 4, bottom: 4 });
            TextArea.border({ width: 1, color: ProteusColors.DIVIDER });
        }, TextArea);
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
