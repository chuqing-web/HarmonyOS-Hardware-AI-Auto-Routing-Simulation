import { ErrCode, errCodeMessage } from '../types/ErrCode';

export interface ApiResult<T> {
  success: boolean;
  errCode: ErrCode;
  data?: T;
  error?: string;
}

export class ResultHelper {
  static ok<T>(data?: T): ApiResult<T> {
    return { success: true, errCode: ErrCode.OK, data };
  }

  static fail<T>(code: ErrCode, detail?: string): ApiResult<T> {
    const msg = detail ?? errCodeMessage(code);
    return { success: false, errCode: code, error: msg };
  }
}
