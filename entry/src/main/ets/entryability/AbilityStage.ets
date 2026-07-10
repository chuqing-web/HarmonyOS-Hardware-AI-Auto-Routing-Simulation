import { AbilityStage, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { setInstrTraceSimStep, INSTR_TRACE_TAG, Logger } from 'common';

const DOMAIN = 0x0000;
const TAG = 'AISchSim';

export default class AppAbilityStage extends AbilityStage {
  onCreate(): void {
    hilog.info(DOMAIN, TAG, 'AbilityStage onCreate');
    setInstrTraceSimStep(true);
    Logger.info(INSTR_TRACE_TAG, '逐步仿真采样已启动 (INSTR_TRACE_SIM_STEP=true)');
  }

  onAcceptWant(want: Want): string {
    return 'AppAbilityStage';
  }
}
