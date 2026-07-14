import { ErrCode, errCodeMessage } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
export interface ApiResult<T> {
    success: boolean;
    errCode: ErrCode;
    data?: T;
    error?: string;
}
export class ResultHelper {
    static ok<s49>(t49?: s49): ApiResult<s49> {
        return { success: true, errCode: ErrCode.OK, data: t49 };
    }
    static fail<o49>(p49: ErrCode, q49?: string): ApiResult<o49> {
        const r49 = q49 ?? errCodeMessage(p49);
        return { success: false, errCode: p49, error: r49 };
    }
}
