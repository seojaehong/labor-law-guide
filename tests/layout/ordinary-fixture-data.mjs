// Supplemental synthetic ordinary-content fixtures. The original stress module
// stays byte-identical so its captured BEFORE evidence can always be verified.
import { tables, hangulParagraph, mixedParagraph } from './fixture-data.mjs';

export const ordinaryQuote = '“문단을 짧게 나누고 핵심 내용을 먼저 제시하면 글의 흐름을 이해하기 쉽습니다.”';
export const ordinaryFootnote = '합성 각주: 이 문장은 레이아웃 검증만을 위한 예시이며 실제 법률 자료를 인용하지 않습니다.';
export const ordinaryMarkdown = `## 한글 본문\n\n${hangulParagraph}\n\n## Mixed content\n\n${mixedParagraph}\n\n## 인용과 참고\n\n> ${ordinaryQuote}\n\n일반적인 문장 안에서 각주 표시와 본문으로 돌아가는 표식을 확인합니다.[^layout-note]\n\n- 요약과 본문은 같은 읽기 리듬을 유지합니다.\n- 보조 정보는 본문을 지나치게 좁히지 않습니다.\n\n| 항목 | 확인 내용 | 참고 |\n| --- | --- | --- |\n| 근로조건 | 본문 읽기 너비 | 합성 예시 |\n| 문단 구성 | 제목과 본문의 간격 | 일반 내용 |\n\n[^layout-note]: ${ordinaryFootnote}`;
const ordinarySummary = `${hangulParagraph}\n\n${mixedParagraph}`;
export const ordinaryTables = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map(row => {
  if (name === 'blog_articles') return { ...row, content: ordinaryMarkdown };
  if (name === 'cases') return { ...row, summary: ordinarySummary, holding_points: ordinaryMarkdown };
  if (['molab_interpretations', 'admin_interpretations'].includes(name)) return { ...row, inquiry_summary: ordinarySummary, answer_summary: ordinaryMarkdown, full_text: ordinaryMarkdown, holding_points: ordinaryMarkdown };
  if (name === 'nlrc_decisions') return { ...row, holding_points: `가. 사실관계\n${hangulParagraph}\n\n나. 판단 이유\n${mixedParagraph}\n\n(1) 절차 확인\n절차 관련 합성 예시입니다.\n\n① 확인 사항\n단계별 내용의 들여쓰기를 확인합니다.` };
  return { ...row };
})]));
