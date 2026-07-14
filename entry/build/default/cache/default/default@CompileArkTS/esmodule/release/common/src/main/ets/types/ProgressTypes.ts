import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
export interface ProgressInfo {
    progress: number;
    stage: string;
    isFinish: boolean;
    errCode: ErrCode;
    errMsg: string;
}
export type ProgressCallback = (info: ProgressInfo) => void;
export function makeProgress(y11: number, z11: string, a12: boolean = false, b12: ErrCode = ErrCode.OK, c12: string = ''): ProgressInfo {
    return { progress: y11, stage: z11, isFinish: a12, errCode: b12, errMsg: c12 };
}
