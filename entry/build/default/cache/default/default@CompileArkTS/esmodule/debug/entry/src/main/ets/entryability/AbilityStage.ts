import AbilityStage from "@ohos:app.ability.AbilityStage";
import type Want from "@ohos:app.ability.Want";
import hilog from "@ohos:hilog";
const DOMAIN = 0x0000;
const TAG = 'AISchSim';
export default class AppAbilityStage extends AbilityStage {
    onCreate(): void {
        hilog.info(DOMAIN, TAG, 'AbilityStage onCreate');
        // INSTR_TRACE_SIM_STEP 默认关闭；调试时调用 setInstrTraceSimStep(true)
    }
    onAcceptWant(want: Want): string {
        return 'AppAbilityStage';
    }
}
