// 한글 라벨 사전 (영문 컬럼값 → 한글). DB는 영문 그대로 두고 화면 렌더 시 매핑.
// JSON 외부화로 비개발자도 편집 가능 + 향후 모노레포에서 packages/shared로 추출 예정.

import legalFocus from './legal-focus.json';
import dispositionType from './disposition-type.json';
import factMarker from './fact-marker.json';

export const LEGAL_FOCUS_LABELS: Record<string, string> = legalFocus;
export const DISPOSITION_TYPE_LABELS: Record<string, string> = dispositionType;
export const FACT_MARKER_LABELS: Record<string, string> = factMarker;

// 미매핑 키 fallback: 원문 그대로 출력 (감지/추가용)
export function labelize(value: string, dict: Record<string, string>): string {
  return dict[value] ?? value;
}
