import { AbilityStage, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

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
