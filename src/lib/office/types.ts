// 오피스 엔진 공용 모양 — 라이브러리 입구(index.ts)와 엔진이 같이 쓴다. 외부 의존 없음.

/** 경고 하나. code 는 기계가, message 는 사람이 읽는다. at = 칸 주소·장 번호 등 위치 */
export interface Warning {
  code: string;
  message: string;
  at?: string;
}
