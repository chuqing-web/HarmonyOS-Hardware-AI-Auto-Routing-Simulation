import AbilityStage from "@ohos:app.ability.AbilityStage";
import type Want from "@ohos:app.ability.Want";
import hilog from "@ohos:hilog";
import { setInstrTraceSimStep, INSTR_TRACE_TAG, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const DOMAIN = 0x0000;
const TAG = 'AISchSim';
export default class AppAbilityStage extends AbilityStage {
    onCreate(): void {
        hilog.info(DOMAIN, TAG, 'AbilityStage onCreate');
        setInstrTraceSimStep(true);
        Logger.info(INSTR_TRACE_TAG, '逐步仿真采样已启动 (INSTR_TRACE_SIM_STEP=true)');
    }
    onAcceptWant(m172: Want): string {
        return 'AppAbilityStage';
    }
}
