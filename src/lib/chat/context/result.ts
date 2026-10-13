/**
 * 검색 한 건의 결과와, 비었다면 왜 비었는지.
 *
 * `''` 하나로 성공·0건·에러를 다 표현하던 것이 이 프로젝트에서 두 번 장애를 숨겼다.
 * (1) 판정례 RPC 가 죽어도 빈 문자열이라 8일 동안 아무도 몰랐다.
 * (2) 상한에 걸려 잘린 것과 0건이 마커에 똑같이 0 으로 찍혀 원인을 좁힐 수 없었다.
 */
export type Retrieval = {
  ctx: string;
  rows: number;
  /** 어느 경로로 얻었는지. 우회와 정상 경로를 사후에 구분하기 위한 것. */
  via: 'rpc' | 'fts' | 'none';
  /** 'ok' | '0rows' | 'error' | 'noembed' — 타임아웃은 호출부가 붙인다. */
  status: 'ok' | '0rows' | 'error' | 'noembed';
};

export const EMPTY_RETRIEVAL: Retrieval = { ctx: '', rows: 0, via: 'none', status: '0rows' };
