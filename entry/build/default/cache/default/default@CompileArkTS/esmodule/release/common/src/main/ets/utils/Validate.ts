import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
export class Validate {
    static notEmpty(e55: string | undefined | null, f55: string): ErrCode | null {
        if (e55 === undefined || e55 === null || e55.trim().length === 0) {
            return ErrCode.ERR_PARAM_INVALID;
        }
        return null;
    }
    static validateRange(b55: number, c55: number, d55: number): ErrCode | null {
        if (isNaN(b55) || b55 < c55 || b55 > d55)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static validateNonEmptyArray<z54>(a55: z54[] | undefined | null): ErrCode | null {
        if (!a55 || a55.length === 0)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static validateEmail(x54: string): ErrCode | null {
        const y54 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!y54.test(x54))
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static validateUrl(v54: string): ErrCode | null {
        const w54 = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!w54.test(v54))
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static inRange(s54: number, t54: number, u54: number): ErrCode | null {
        return Validate.validateRange(s54, t54, u54);
    }
    static uuid(r54: string): ErrCode | null {
        if (!r54 || r54.length < 4)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static filePath(q54: string): ErrCode | null {
        if (!q54 || q54.trim().length === 0)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
}
