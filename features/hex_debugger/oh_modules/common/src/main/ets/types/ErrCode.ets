/**

 * 全局统一错误码

 */

export enum ErrCode {

  OK = 0,

  ERR_PARAM_INVALID = 1,

  ERR_FILE_NOT_FOUND = 2,

  ERR_FILE_CORRUPT = 3,

  ERR_HEX_PARSE_FAIL = 4,

  ERR_API_AUTH = 5,

  ERR_API_LIMIT = 6,

  ERR_API_TIMEOUT = 7,

  ERR_SIM_BUSY = 8,

  ERR_MCU_NO_HEX = 9,

  ERR_DEVICE_NOT_EXIST = 10,

  ERR_NET_SHORT = 11,

  ERR_PERMISSION = 12,

  ERR_ASYNC_CANCEL = 13,

  ERR_MODEL_MISS = 14,

  ERR_LICENSE_INVALID = 15,

  ERR_QUOTA_EXCEEDED = 16,

  ERR_FEATURE_LOCKED = 17,

  ERR_PROJECT_LOCKED = 18,

  ERR_SPICE_CONVERGENCE = 19,

  ERR_MCU_INVALID_OPCODE = 20,

  ERR_DEVICE_LIB_PARSE = 21

}



export function errCodeMessage(code: ErrCode, locale: string = 'zh'): string {

  if (locale === 'en') {
    return errCodeMessageEn(code);
  }

  switch (code) {

    case ErrCode.OK:

      return '正常';

    case ErrCode.ERR_PARAM_INVALID:

      return '参数非法、空值或超出范围';

    case ErrCode.ERR_FILE_NOT_FOUND:

      return '文件不存在';

    case ErrCode.ERR_FILE_CORRUPT:

      return '文件损坏或格式不匹配';

    case ErrCode.ERR_HEX_PARSE_FAIL:

      return 'HEX 解析失败或校验和不匹配';

    case ErrCode.ERR_API_AUTH:

      return 'AI 密钥错误 (401)';

    case ErrCode.ERR_API_LIMIT:

      return 'AI 限流 (429)';

    case ErrCode.ERR_API_TIMEOUT:

      return 'AI 接口超时';

    case ErrCode.ERR_SIM_BUSY:

      return '仿真正在运行，禁止修改原理图';

    case ErrCode.ERR_MCU_NO_HEX:

      return '单片机未加载 HEX，无法调试';

    case ErrCode.ERR_DEVICE_NOT_EXIST:

      return '器件库无对应器件';

    case ErrCode.ERR_NET_SHORT:

      return '网络短路冲突';

    case ErrCode.ERR_PERMISSION:

      return '文件读写权限不足';

    case ErrCode.ERR_ASYNC_CANCEL:

      return '异步 AI 任务已取消';

    case ErrCode.ERR_MODEL_MISS:

      return '器件缺少仿真模型';

    case ErrCode.ERR_LICENSE_INVALID:

      return '授权无效或已篡改';

    case ErrCode.ERR_QUOTA_EXCEEDED:

      return 'AI 用量超出授权额度';

    case ErrCode.ERR_FEATURE_LOCKED:

      return '当前授权版本不支持此功能';

    case ErrCode.ERR_PROJECT_LOCKED:

      return '工程已被其他会话以只读/编辑锁占用';

    case ErrCode.ERR_SPICE_CONVERGENCE:

      return 'SPICE 仿真未收敛，请减小步长或检查网表';

    case ErrCode.ERR_MCU_INVALID_OPCODE:

      return 'MCU 遇到无效指令码';

    case ErrCode.ERR_DEVICE_LIB_PARSE:

      return '器件库文件解析失败';

    default:

      return `未知错误 (${code})`;

  }

}



function errCodeMessageEn(code: ErrCode): string {

  switch (code) {

    case ErrCode.OK: return 'OK';

    case ErrCode.ERR_PARAM_INVALID: return 'Invalid parameter';

    case ErrCode.ERR_FILE_NOT_FOUND: return 'File not found';

    case ErrCode.ERR_FILE_CORRUPT: return 'File corrupted or tampered';

    case ErrCode.ERR_HEX_PARSE_FAIL: return 'HEX parse or checksum failed';

    case ErrCode.ERR_API_AUTH: return 'AI API authentication failed';

    case ErrCode.ERR_API_LIMIT: return 'AI rate limit exceeded';

    case ErrCode.ERR_API_TIMEOUT: return 'AI request timeout';

    case ErrCode.ERR_SIM_BUSY: return 'Simulation running, edit blocked';

    case ErrCode.ERR_MCU_NO_HEX: return 'No HEX loaded for MCU';

    case ErrCode.ERR_DEVICE_NOT_EXIST: return 'Device not in library';

    case ErrCode.ERR_NET_SHORT: return 'Net short circuit';

    case ErrCode.ERR_PERMISSION: return 'Permission denied';

    case ErrCode.ERR_ASYNC_CANCEL: return 'Async task cancelled';

    case ErrCode.ERR_MODEL_MISS: return 'Simulation model missing';

    case ErrCode.ERR_LICENSE_INVALID: return 'Invalid license';

    case ErrCode.ERR_QUOTA_EXCEEDED: return 'Quota exceeded';

    case ErrCode.ERR_FEATURE_LOCKED: return 'Feature locked by license';

    case ErrCode.ERR_PROJECT_LOCKED: return 'Project locked by another session';

    case ErrCode.ERR_SPICE_CONVERGENCE: return 'SPICE convergence failed';

    case ErrCode.ERR_MCU_INVALID_OPCODE: return 'Invalid MCU opcode';

    case ErrCode.ERR_DEVICE_LIB_PARSE: return 'Device library parse failed';

    default: return `Unknown error (${code})`;

  }

}
