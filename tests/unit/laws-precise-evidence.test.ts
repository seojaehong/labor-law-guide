import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import rules from '../../public/data/laws/rules.json';
import type { RuleSpec } from '@/lib/laws/rules-check';
import { loadEvidence, evidenceKey } from '@/lib/laws/precise/evidence';
import { body } from '@/lib/laws/precise/judge';
import { precisePipeline, mapRules } from '@/lib/laws/precise/pipeline';
import { pairArticles, splitArticles } from '@/lib/laws/precise/articles';
import { readDocText } from '@/lib/laws/doc-io';

describe('저장소 공식자료 연결', () => {
  it('동일 법령·조문·시행일 원문만 연결하고 모델에 날짜와 함께 준다', async () => {
    const r = (rules.rules as RuleSpec[]).find((r) => r.lawId === '000130' && r.effective === '20260918')!;
    const evidence = await loadEvidence([r]);
    expect(evidence.get(evidenceKey(r))?.text).toContain('제18조의2');
    expect(evidence.get(evidenceKey(r))?.url).toContain('law.go.kr');
    const arts = splitArticles('제1조(배우자 출산휴가) 배우자의 출산을 이유로 휴가 10일');
    const input = JSON.parse(body(pairArticles([], arts), new Map(), mapRules(arts, '20260101', [r], evidence), '24', '20260101', '20261022'));
    expect(input['점검 기준일']).toBe('20261022'); expect(input['법령 대조 시작일']).toBe('20260101');
    expect(input.조문들[0]['관련 법령 기준'][0].원문.text).toBe(evidence.get(evidenceKey(r))?.text);
    expect((await loadEvidence([{ ...r, effective: '19000101' }])).size).toBe(0);
    expect((await loadEvidence([{ ...r, mst: '0' }])).size).toBe(0);
  });
});

it('중첩표 앞뒤와 예외 문구를 한 번씩 추출해 조문에 남긴다', async () => {
  const zip = new JSZip();
  zip.file('Contents/section0.xml', '<hp:p><hp:t>제1조(합성 휴가) 원칙</hp:t><hp:tbl><hp:p><hp:t>① 유급 5일</hp:t><hp:tbl><hp:p><hp:t>다만, 중첩 셀 예외는 별도로 정한다.</hp:t></hp:p></hp:tbl><hp:t>② 바깥 셀 후문</hp:t></hp:p></hp:tbl><hp:t>③ 표 뒤 예외를 보존한다.</hp:t></hp:p><hp:p><hp:t>제2조(합성 적용) 다른 조문</hp:t></hp:p>');
  const text = await readDocText(await zip.generateAsync({ type: 'uint8array' }), 'hwpx');
  expect(splitArticles(text)[0].body).toBe('원칙\n① 유급 5일\n다만, 중첩 셀 예외는 별도로 정한다.\n② 바깥 셀 후문\n③ 표 뒤 예외를 보존한다.');
  expect(splitArticles(text)[1].body).toBe('다른 조문');
});


it('인용 번호 일부 일치를 원문 연결로 오인하지 않고 일치해도 법률 검증으로 표시하지 않는다', async () => {
  const r = (rules.rules as RuleSpec[]).find((r) => r.lawId === '000130' && r.effective === '20260918')!;
  const evidence = await loadEvidence([r]);
  const law = evidence.get(evidenceKey(r))!.law;
  for (const [citation, linked] of [[`${law} ${r.article}0`, false], [`${law} ${r.article}`, true]] as const) {
    const result = await precisePipeline({ rules: '제1조(배우자 출산휴가) 배우자의 출산을 이유로 휴가 10일', since: '20260101' }, [r], {
      evidence, ask: async () => [{ no: '제1조', result: '현행 수정 필요', disadvantage: '해당 없음', reason: '합성 의견', basis: citation, ops_note: '', proposed_text: '' }],
    });
    expect(result.rows[0].review?.citationLinked).toBe(linked);
    expect(result.rows[0]['근거·시행일']).toContain('AI 인용(미검증)');
    if (!linked) expect(result.rows[0]['점검 결과']).toBe('추가 확인');
  }
});


it('같은 조문의 일부 법령 원문 누락은 다른 원문 연결로 숨기지 않는다', async () => {
  const first: RuleSpec = { lawId: '999999', law: '합성법', article: '제1조', effective: '20260101', topic: '합성 기준 A', art93: '', required: false,
    keywords: ['합성제도'], ok: ['충족'], stale: [], point: '', clause: '', mst: null };
  const second = { ...first, article: '제2조', topic: '합성 기준 B' };
  const evidence = new Map([[evidenceKey(first), { law: '합성법', article: '제1조', effective: '20260101', text: '법률 정답이 아닌 합성 근거', url: 'https://example.invalid/synthetic' }]]);
  for (const verdict of ['문제없음', '현행 수정 필요'] as const) {
    const result = await precisePipeline({ rules: '제1조(합성제도) 합성제도 충족', since: '20260101' }, [first, second], {
      evidence, ask: async () => [{ no: '제1조', result: verdict, disadvantage: '해당 없음', reason: '합성 의견', basis: verdict === '문제없음' ? '' : '합성법 제1조', ops_note: '', proposed_text: '' }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].review?.sourceMissing).toBe(true);
    expect(result.rows[0]['점검 결과']).toBe('추가 확인');
    expect(result.rows[0]['운영 메모']).toContain('일부 누락');
  }
});


it('원문 식별자가 일치해도 불이익 의견 충돌 행을 문제없음으로 표시하지 않는다', async () => {
  const r = (rules.rules as RuleSpec[]).find((r) => r.lawId === '000130' && r.effective === '20260918')!;
  const evidence = await loadEvidence([r]);
  let round = 0;
  const result = await precisePipeline({ rules: '제1조(배우자 출산휴가) 배우자의 출산을 이유로 휴가 10일', since: '20260101' }, [r], {
    evidence, workers: 1, ask: async () => [{ no: '제1조', result: '문제없음', disadvantage: ++round === 1 ? '해당' : '해당 없음',
      reason: '상충하는 합성 의견', basis: `${evidence.get(evidenceKey(r))!.law} ${r.article}`, ops_note: '', proposed_text: '' }],
  });
  expect(result.rows[0].review).toMatchObject({ citationLinked: true, conflict: true });
  expect(result.rows[0]['점검 결과']).toBe('추가 확인');
});
