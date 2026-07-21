import { ErrCode } from './ErrCode';

export interface FlashSegment {
  startAddr: number;
  data: number[];
  length: number;
}

export interface HexFileInfo {
  isValid: boolean;
  errCode: ErrCode;
  flashSegments: FlashSegment[];
  minAddr: number;
  maxAddr: number;
  totalByteSize: number;
  checksumOk: boolean;
}
