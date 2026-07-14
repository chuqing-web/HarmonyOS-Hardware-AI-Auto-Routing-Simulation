import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
/** 异步任务通用进度回调结构 */
export interface ProgressInfo {
    progress: number;
    stage: string;
    isFinish: boolean;
    errCode: ErrCode;
    errMsg: string;
}
export type ProgressCallback = (info: ProgressInfo) => void;
export function makeProgress(progress: number, stage: string, isFinish: boolean = false, errCode: ErrCode = ErrCode.OK, errMsg: string = ''): ProgressInfo {
    return { progress, stage, isFinish, errCode, errMsg };
}
