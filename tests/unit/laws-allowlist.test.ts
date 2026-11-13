// 261113 — 「법령 조문」 후보는 노동 법령 허용 목록으로 거른 뒤 순위를 매긴다.
// 미리보기(4f60d7e)에서 연차·퇴직금 질문의 조문 1위가 공무원연금법이었다. 아래 모의 검색 결과는
// 그때 화면에 보인 상위 조문 순서를 그대로 앞에 두고, 뒤에 노동 법령 조문을 이어 붙인 것이다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLawsContext } from '@/lib/chat/context/laws';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

type Row = { law_name: string; article_label: string; article_title: string | null; body: string };
const rpc = (rows: Row[]) => ({
  rpc: vi.fn().mockResolvedValue({
    data: rows.map((r, i) => ({ ...r, law_kind: '법률', effective_date: '2026-01-01', score: 100 - i, matched: 1 })),
    error: null,
  }),
}) as unknown as SupabaseClient;
const row = (law_name: string, article_label: string, article_title: string | null, body = `${article_label}(${article_title ?? ''}) 본문`): Row =>
  ({ law_name, article_label, article_title, body });

// e07ae17 미리보기에서 거른 뒤 상위 3건이 산재법 제5조 · 근로기준법 제56조 · 제60조 순이었다. 그 순서를 그대로 둔다.
const LEAVE_SEARCH = [
  row('공무원연금법', '제89조', '효력발생기간'),
  row('공무원 재해보상법', '제55조', '효력발생기간'),
  row('군인연금법', '제12조', '급여의 제한'),
  row('산업재해보상보험법', '제5조', '정의'),
  row('근로기준법', '제56조', '연장ㆍ야간 및 휴일 근로'),
  row('근로기준법', '제60조', '연차 유급휴가'),
  row('근로기준법', '제61조', '연차 유급휴가의 사용 촉진'),
];

const SEVERANCE_SEARCH = [
  row('공무원연금법', '제25조', '재직기간의 계산'),
  row('근로기준법 시행령', '제2조', '평균임금의 계산에서 제외되는 기간과 임금'),
  row('근로자퇴직급여 보장법', '제12조', '퇴직급여등의 우선변제'),
  row('사립학교교직원 연금법', '제31조', '재직기간의 계산'),
  row('군인연금법', '제16조', '복무기간의 계산'),
  row('공무원연금법', '제28조', '급여의 종류'),
  row('근로자퇴직급여 보장법', '제8조', '퇴직금제도의 설정 등'),
  row('근로기준법', '제2조', '정의'),
];

it.each(['false', 'true'])('연차 질문(JEV_ON=%s) — 공무원·군인 연금법과 공무원 재해보상법을 버리고 근로기준법 제60조가 상위 3건에 든다', async (jev) => {
  vi.stubEnv('JEV_ON', jev);
  const laws = await buildLawsContext(rpc(LEAVE_SEARCH), '연차휴가는 언제 생기나요?');
  // 261113 — 최종 3건은 조문 제목이 질문 낱말과 많이 겹치는 순으로 다시 세운다. 제60조(연차 유급휴가)가 1위
  expect(laws.items?.map(i => i.id)).toEqual(['근로기준법 제60조', '산업재해보상보험법 제5조', '근로기준법 제56조']);
  // 요약 프롬프트에 들어가는 조문 후보에도 같은 필터가 걸린다
  expect(laws.ctx).not.toMatch(/공무원|군인연금/);
  expect(laws.ctx).toContain('[근로기준법 제60조 (연차 유급휴가)]');
});

it('퇴직금 계산 기간 질문 — 상위 3건에 퇴직급여법 제8조 또는 근로기준법 제2조가 들고, 연금법 조문은 없다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc(SEVERANCE_SEARCH), '퇴직금 계산 기간은 어떻게 정하나요?');
  const ids = laws.items?.map(i => i.id) ?? [];
  expect(ids).toHaveLength(3);
  expect(ids.some(id => id === '근로자퇴직급여 보장법 제8조' || id === '근로기준법 제2조')).toBe(true);
  expect(ids.join(' ')).not.toMatch(/연금법/);
  expect(laws.ctx).not.toMatch(/연금법/);
});

it('질문에 법령 이름이 적혀 있으면 허용 목록 밖이어도 그 법은 남긴다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([row('공무원연금법', '제25조', '재직기간의 계산'), row('군인연금법', '제16조', '복무기간의 계산')]),
    '공무원연금법 재직기간은 어떻게 계산하나요?');
  expect(laws.items?.map(i => i.id)).toEqual(['공무원연금법 제25조']);
});

it('허용 목록은 띄어쓰기·가운뎃점 표기 차이를 가리지 않고, 노동 법령의 시행령·시행규칙을 함께 허용한다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([
    row('남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률', '제19조', '육아휴직'),
    row('근로기준법 시행규칙', '제15조', null),
    row('고용보험법 시행령', '제95조', '육아휴직 급여'),
    row('공인노무사법', '제2조', '직무의 범위'),
  ]), '육아휴직은 어떻게 하나요?');
  // 제목이 질문과 겹치는 고용보험법 시행령 제95조(육아휴직 급여)가 제목 없는 근기법 시행규칙보다 앞선다
  expect(laws.items?.map(i => i.id)).toEqual(['남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률 제19조', '고용보험법 시행령 제95조', '근로기준법 시행규칙 제15조']);
});

it('질문 속 다른 법령명의 일부(「재해보상법」 안의 「상법」)는 법령 이름을 적은 것으로 보지 않는다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([row('상법', '제1조', '상사적용법규'), row('공무원 재해보상법', '제8조', '요양급여'), row('산업재해보상보험법', '제40조', '요양급여')]),
    '공무원 재해보상법 요양급여는요?');
  expect(laws.items?.map(i => i.id)).toEqual(['공무원 재해보상법 제8조', '산업재해보상보험법 제40조']);
});

it('공인노무사법은 질문에 이름이 있어도 넣지 않는다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([row('공인노무사법', '제2조', '직무의 범위'), row('근로기준법', '제2조', '정의')]), '공인노무사법 제2조는 뭔가요?');
  expect(laws.items?.map(i => i.id)).toEqual(['근로기준법 제2조']);
});

it('후보가 전부 허용 목록 밖이면 조문 없이 0건으로 돌려준다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([row('공무원연금법', '제89조', '효력발생기간')]), '연차휴가는 언제 생기나요?');
  expect(laws).toMatchObject({ ctx: '', rows: 0, status: '0rows' });
  expect(laws.items ?? []).toEqual([]);
});

it('「연차휴가」 질문은 검색어에 법령 용어 「연차 유급휴가」를 보태 넘긴다', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const db = rpc([row('근로기준법', '제60조', '연차 유급휴가')]);
  await buildLawsContext(db, '연차휴가는 언제 생기나요?');
  const arg = (db.rpc as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as { query_text: string };
  expect(arg.query_text).toMatch(/유급휴가/);
});

it('최저임금법·퇴직급여법 시행령도 허용한다(노동 법령 시행령 전체)', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([
    row('최저임금법 시행령', '제5조', '최저임금의 적용을 위한 임금의 환산'),
    row('근로자퇴직급여 보장법 시행령', '제3조', '퇴직금의 중간정산 사유'),
    row('국민연금법 시행령', '제2조', '정의'),
  ]), '최저임금 환산은 어떻게 하나요?');
  expect(laws.items?.map(i => i.id)).toEqual(['최저임금법 시행령 제5조', '근로자퇴직급여 보장법 시행령 제3조']);
});

it('제목 겹침이 같으면 제목이 짧은(질문에 더 꼭 맞는) 조문이 앞선다 — 제60조가 제61조(사용 촉진)보다 먼저', async () => {
  vi.stubEnv('JEV_ON', 'false');
  const laws = await buildLawsContext(rpc([
    row('근로기준법', '제61조', '연차 유급휴가의 사용 촉진'),
    row('근로기준법', '제2조', '정의'),
    row('근로기준법', '제60조', '연차 유급휴가'),
  ]), '연차휴가 며칠인가요?');
  expect(laws.items?.map(i => i.id)).toEqual(['근로기준법 제60조', '근로기준법 제61조', '근로기준법 제2조']);
});
