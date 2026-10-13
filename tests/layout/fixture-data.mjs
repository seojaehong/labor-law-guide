// Synthetic content only. No production records, credentials or legal advice.
export const hangulParagraph = '한글 측정 문단에서는 읽기 좋은 본문 너비와 줄 간격을 확인합니다. 근로자와 사용자는 같은 문장을 편안하게 읽고 중요한 내용을 쉽게 찾을 수 있어야 합니다. 화면이 넓어져도 한 줄이 지나치게 길어지지 않으며 좁은 화면에서는 본문과 보조 정보가 자연스럽게 이어집니다. '.repeat(4);
export const fullwidthParagraph = '전각한글측정가나다라마바사아자차카타파하근로조건읽기너비본문검증'.repeat(16);
export const mixedParagraph = 'Mixed layout 측정은 근로기준법 Article 23, 2026-10-03, HR policy 및 employee rights를 함께 다룹니다. 한글과 Latin letters, 1,234,567원 같은 숫자가 섞여도 읽기 흐름과 줄바꿈은 안정적이어야 합니다. Design review는 실제 글자 위치를 DOM Range로 측정하고 단순한 폭 나눗셈에만 의존하지 않습니다. '.repeat(4);
export const markdown = `## 한글 본문\n\n${hangulParagraph}\n\n${fullwidthParagraph}\n\n## Mixed content\n\n${mixedParagraph}\n\n### 긴 문자열과 표\n\n[긴 링크](https://example.invalid/layout) https://example.invalid/${'readable-layout-'.repeat(20)}\n\n| 항목 | 확인 내용 | 참고 |\n| --- | --- | --- |\n| 근로조건 | 본문 읽기 너비와 정보의 우선순위 | 2026-10-03 |\n| 긴 식별자 | ${'ABCDEFGHIJ'.repeat(15)} | overflow containment |\n\n> ${hangulParagraph.slice(0, 130)}\n\n- 요약과 본문은 같은 읽기 리듬을 유지합니다.\n- 보조 정보는 본문을 지나치게 좁히지 않습니다.\n\n\`\`\`text\n${'LONG_CODE_TOKEN_'.repeat(18)}\n\`\`\``;
// Intentionally wide authored HTML table exercises keyboard scrolling, not page overflow.
export const wideTable = '<table style="min-width:60rem"><thead><tr><th>넓은 표 시작</th><th>상세 설명</th><th>넓은 표 끝</th></tr></thead><tbody><tr><td>첫 셀 확인</td><td>가로 스크롤로 모든 열을 확인합니다.</td><td>마지막 셀 확인</td></tr></tbody></table>';
const published = '2026-10-03T00:00:00.000Z';
export const articles = Array.from({ length: 8 }, (_, i) => ({
  id: `layout-article-${i}`, slug: i ? `layout-related-${i}` : 'news-20261003-01',
  title: i ? `읽기 레이아웃 관련 자료 ${i}` : '넓은 화면에서도 편안하게 읽는 노동법 소식',
  subtitle: '결정론적 레이아웃 검증용 합성 자료', content: `${markdown}\n\n${wideTable}`,
  summary: '화면 너비에 따라 본문과 보조 정보의 배치가 달라지는지 살펴보는 합성 예시입니다.',
  category: 'general', sub_category: null, tags: ['레이아웃', '근로조건', '읽기'], author: 'Layout Fixture',
  cover_image: null, published_at: published, updated_at: published, view_count: 0,
  seo_title: null, seo_description: null, is_published: true,
  is_topic_pick: i > 0 && i < 5, topic_pick_rank: i, topic_pick_week: '2026-09-28',
}));
export const cases = Array.from({ length: 6 }, (_, i) => ({
  id: i ? `layout-case-${i}` : 'layout-case', title: `근로조건 변경과 절차에 관한 합성 판례 ${i + 1}`,
  case_number: `2026다${10000 + i}`, court: '합성 법원', decision_date: '2026-10-03', case_type: '근로조건', verdict_type: '원고일부승',
  keywords_matched: ['근로조건', '절차'], summary: `${hangulParagraph}\n\n${fullwidthParagraph}\n\n${mixedParagraph}`,
  holding_points: markdown, law_references: '레이아웃 검증용 예시 조문', url: null, original_url: null,
}));
export const interpretations = Array.from({ length: 6 }, (_, i) => ({
  id: i ? `layout-interpretation-${i}` : 'layout-interpretation', title: `근로시간과 휴게시간에 관한 합성 행정해석 ${i + 1}`,
  case_number: `합성근로-${100 + i}`, doc_number: `합성근로-${100 + i}`, decision_date: '2026-10-03',
  keywords_matched: ['근로조건', '근로시간'], inquiry_summary: `${hangulParagraph}\n\n${fullwidthParagraph}\n\n${mixedParagraph}`,
  answer_summary: markdown, full_text: markdown, summary: hangulParagraph, holding_points: markdown,
  url: null, original_url: null,
}));
export const decisions = Array.from({ length: 25 }, (_, i) => ({
  id: i ? `layout-decision-${i}` : 'layout-decision', title: `합성 노동위원회 판정례: 근로조건과 절차 ${i + 1}`,
  case_number: `2026부해${100 + i}`, case_number_real: `2026부해${100 + i}`, case_number_qualified: `합성2026부해${100 + i}`,
  decision_date: '2026-10-03', decision_result: 'granted', reason_category: ['no_dismissal', 'misconduct'],
  department: '합성 노동위원회', key_issue: '절차와 사실관계에 관한 레이아웃 검증',
  holding_summary: mixedParagraph, holding_points: `가. 사실관계\n${hangulParagraph}\n\n${fullwidthParagraph}\n\n나. 판단 이유\n${mixedParagraph}\n\n(1) 절차 확인\n절차 관련 합성 예시입니다.\n\n① 확인 사항\n단계별 내용의 들여쓰기를 확인합니다.`,
  reason_detail: hangulParagraph, tags: ['합성자료'], legal_focus: [], disposition_type: [],
  sanction_type: null, is_non_labor: false, confidence_level: 0.99, url: null,
}));
export const tables = {
  blog_articles: articles, cases, molab_interpretations: interpretations,
  admin_interpretations: interpretations, nlrc_decisions: decisions,
  decision_source_documents: [], news: [], news_briefings: [],
};
