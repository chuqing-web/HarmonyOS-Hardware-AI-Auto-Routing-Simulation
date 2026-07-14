import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
export class Validate {
    static notEmpty(value: string | undefined | null, fieldName: string): ErrCode | null {
        if (value === undefined || value === null || value.trim().length === 0) {
            return ErrCode.ERR_PARAM_INVALID;
        }
        return null;
    }
    /** 7.2.10 数值范围校验 */
    static validateRange(n: number, min: number, max: number): ErrCode | null {
        if (isNaN(n) || n < min || n > max)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    /** 7.2.10 非空数组校验 */
    static validateNonEmptyArray<T>(arr: T[] | undefined | null): ErrCode | null {
        if (!arr || arr.length === 0)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    /** 7.2.10 邮箱格式校验 */
    static validateEmail(email: string): ErrCode | null {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(email))
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    /** 7.2.10 URL 格式校验 */
    static validateUrl(url: string): ErrCode | null {
        const urlRe = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRe.test(url))
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static inRange(value: number, min: number, max: number): ErrCode | null {
        return Validate.validateRange(value, min, max);
    }
    static uuid(value: string): ErrCode | null {
        if (!value || value.length < 4)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
    static filePath(path: string): ErrCode | null {
        if (!path || path.trim().length === 0)
            return ErrCode.ERR_PARAM_INVALID;
        return null;
    }
}
