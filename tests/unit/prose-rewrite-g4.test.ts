// 퇴고 check_rewrite — G4 적대 검토(261124) 반례. 리뷰어가 낸 미탐·오탐 입력을 합성 문장으로 옮겨 고정한다.
// 상태어는 셋뿐(보존됨·훼손·변경률 초과)이고, 어림이라 확정하지 못하면 보존됨을 내지 않는다.
import { describe, expect, it } from 'vitest';
import { checkRewrite, rewriteRrnStop } from '../../tools/k-labor/lib/prose/preserve.mjs';
import { parseCitationBlocks } from '../../tools/k-labor/lib/cite-check.mjs';

type Change = { kind: string; line: { before: number | null; after: number | null }; before?: string; after?: string; value?: { before?: string; after?: string }; term?: string; modality?: string; form?: string };
type Item = { label: string; status: string; changes: Change[]; count: unknown; unrecognized?: { before: number[]; after: number[] } };
type Result = {
  status: string;
  changeRate: { rate: number; percent: number; level?: string; approximate?: boolean };
  damaged: string[];
  items: Record<'numbers' | 'quotes' | 'blocks' | 'terms' | 'modality' | 'polarity' | 'antithesis', Item>;
};
const run = (b: string, a: string, genre = 'legal') => checkRewrite(b, a, { genre }) as unknown as Result;
/** 그 항목이 훼손으로 잡혔는가 */
const caught = (b: string, a: string, item: keyof Result['items'], genre = 'legal') => {
  const r = run(b, a, genre);
  expect(r.items[item].status, `${item}: ${b} → ${a}`).toBe('훼손');
  expect(r.status).not.toBe('보존됨');
  return r;
};

describe('G4 ① 변경률 — 어림으로는 보존됨을 내지 않는다(차례를 지키는 일치의 하한으로 센 상한)', () => {
  it('가×4000+나×4000 ↔ 나×4000+가×4000(정확값 50%) → 변경률 초과', () => {
    const r = run('가'.repeat(4000) + '나'.repeat(4000), '나'.repeat(4000) + '가'.repeat(4000), 'general');
    expect(r.status).toBe('변경률 초과');
    expect(r.changeRate.rate).toBeGreaterThanOrEqual(0.5);
  });

  it('문장마다 절 넷의 차례를 뒤집음(20·40·60·120문장) → 보존됨이 아니고 변경률 30% 이상', () => {
    const A1 = ['신입 사원', '총무팀 주임', '품질 부서 대리', '전산 담당 과장', '영업 지점 차장', '물류 창고 반장', '연구소 책임', '구매 부서 사원'];
    const A2 = ['야외 작업장', '본관 회의실', '서버실', '자재 창고', '고객 상담실', '옥상 설비실', '지하 주차장', '시험 분석실'];
    const A3 = ['민원 서류', '출입 기록', '점검 일지', '교육 확인서', '안전 서약서', '근태 자료', '견적 문서', '회의 요약'];
    const A4 = ['제출함', '보관함', '폐기함', '반려함', '열람함', '수정함', '승인함', '회수함'];
    const sentence = (i: number) => [0, 1, 2, 3].map((k) => `${A1[(i + k * 3) % 8]} ${A2[(i * 3 + k) % 8]} ${A3[(i * 5 + k * 2) % 8]} ${i * 7 + k}번 ${A4[(i + k * 5) % 8]}`);
    for (const n of [20, 40, 60, 120]) {
      const b = Array.from({ length: n }, (_, i) => `${sentence(i).join(', ')}.`).join('\n');
      const a = Array.from({ length: n }, (_, i) => `${sentence(i).reverse().join(', ')}.`).join('\n');
      const r = run(b, a, 'general');
      expect(r.status, String(n)).not.toBe('보존됨');
      expect(r.changeRate.rate, String(n)).toBeGreaterThanOrEqual(0.3);
      expect(r.items.numbers.status, String(n)).toBe('훼손');
    }
  });

  it('짧은 닻 하나가 긴 글을 통째 삭제·삽입으로 가르지 않는다(가×200+끝 ↔ 끝+나+가×199 → 1% 안팎)', () => {
    const r = run(`${'가'.repeat(200)}\n끝`, `끝\n나${'가'.repeat(199)}`, 'general');
    expect(r.changeRate.rate).toBeLessThan(0.05);
    expect(r.changeRate.level).toBeUndefined();
    expect(r.status).toBe('보존됨');
  });

  it('보이는 percent 는 내림 — 경고가 없으면 30 미만, 있으면 30 이상', () => {
    const base = Array.from({ length: 10 }, (_, i) => `가상 문장 ${'가나다라마바사아자차'[i]}는 차례대로 놓여 있다.`);
    for (let k = 0; k <= 10; k++) {
      const a = base.map((s, i) => (i < k ? `완전히 다른 글 ${'하파타카차자아사바마'[i]}가 들어왔다.` : s)).join('\n');
      const r = run(base.join('\n'), a, 'general');
      expect(r.changeRate.level === undefined, `${k}: ${r.changeRate.percent}`).toBe(r.changeRate.percent < 30);
    }
  });
});

const BLK = (head: string, body: string) => `위 쟁점에 관한 판결은 아래와 같다.\n\n${head}\n${body}\n\n따라서 이 사건 통보는 효력을 다툴 수 있다.`;

describe('G4 ② 판례 블록 — check_citations 와 같은 범위(머리줄 어디든 · 빈 줄 건너 본문 · 붙여 쓴 머리)', () => {
  it('머리줄 + 빈 줄 + 평문 본문의 결론을 뒤집음 → 블록 훼손(인용 대조기도 같은 본문을 읽는다)', () => {
    const b = '[관련 판결] 대법원 2020다12345\n\n이 행위는 계약 조건에 해당한다.';
    const a = '[관련 판결] 대법원 2020다12345\n\n이 행위는 계약 조건에 해당하지 않는다.';
    caught(b, a, 'blocks');
    expect(parseCitationBlocks(b)[0].pieces).toEqual(['이 행위는 계약 조건에 해당한다.']);
    caught(BLK('[관련 판결] 가상법원 2019. 1. 1. 선고 2019가합1234 판결\n', '서면으로 알리지 않은 해고는 효력이 없다는 취지이다.'),
      BLK('[관련 판결] 가상법원 2019. 1. 1. 선고 2019가합1234 판결\n', '서면으로 알리지 않은 해고는 효력이 있다는 취지이다.'), 'blocks');
  });

  it('### 머리줄 · [관련판결](붙여 씀) · 【관련 판결】 · 머리줄 앞에 글 → 블록 훼손', () => {
    const body = (x: string) => `> 서면으로 알리지 않은 해고는 효력이 ${x}는 취지이다.`;
    for (const head of ['### [관련 판결] 가상법원 2019. 1. 1. 선고 2019가합1234 판결', '[관련판결] 대법원 판결', '【관련 판결】 가상법원 2019가합1234 판결']) {
      caught(BLK(head, body('없다')), BLK(head, body('있다')), 'blocks');
    }
    caught('[관련 판결] 대법원 2020다1 판결\n> 해고는 무효이다.', '참고 [관련 판결] 대법원 2020다1 판결\n> 해고는 유효이다.', 'blocks');
    caught('[관련 판결] 대법원 2020. 1. 1. 선고 2019다1234 판결\n> 해고는 무효이다.', '[관련 판결] 대법원 2020. 1. 1. 선고 2019다1243 판결\n> 해고는 무효이다.', 'blocks');
  });

  it('블록으로 못 읽은 [관련 … 줄은 줄 번호를 알리고, 그 아래 > 줄은 인용으로 글자 그대로 본다', () => {
    const t = (x: string) => `본문이다.\n\n[관련 법령] 가상법 제1조\n> 사용자는 ${x}.`;
    const r = caught(t('서면으로 알린다'), t('구두로 알린다'), 'quotes');
    expect(r.items.blocks.unrecognized).toEqual({ before: [3], after: [3] });
    expect(r.items.blocks.status).toBe('보존됨');
  });
});

describe('G4 ③ 수치·인용·용어는 짝 문장 안에서 견준다(맞바꿈·먼 곳 상쇄)', () => {
  it('한 문장 안 값 맞바꿈 — 금액·인용·당사자', () => {
    caught('갑은 12원, 을은 34원을 납부한다.', '갑은 34원, 을은 12원을 납부한다.', 'numbers');
    caught('회사는 갑에게 1,000,000원을, 을에게 2,500,000원을 지급한다.', '회사는 갑에게 2,500,000원을, 을에게 1,000,000원을 지급한다.', 'numbers');
    caught('갑은 “승인”, 을은 “거절”로 답했다.', '갑은 “거절”, 을은 “승인”으로 답했다.', 'quotes');
    caught('진술인 갑은 “때렸다”고 했고 을은 “안 때렸다”고 했다.', '진술인 갑은 “안 때렸다”고 했고 을은 “때렸다”고 했다.', 'quotes', 'general');
    for (const g of ['legal', 'general']) {
      caught('근로자가 사용자에게 서류를 전달한다.', '사용자가 근로자에게 서류를 전달한다.', 'terms', g);
      caught('갑은 근로자이고 을은 사용자이다.', '갑은 사용자이고 을은 근로자이다.', 'terms', g);
    }
  });

  it('문장 사이 맞바꿈 — 금액·인용·용어(문장마다 짝을 지어 본다)', () => {
    caught('가상 회사의 기본급은 200만 원이다. 수당은 30만 원이다.', '가상 회사의 기본급은 30만 원이다. 수당은 200만 원이다.', 'numbers');
    caught('갑은 “그만두라”고 말했다. 을은 “나가라”고 말했다.', '갑은 “나가라”고 말했다. 을은 “그만두라”고 말했다.', 'quotes');
    caught('첫째 행위는 징계 사유이다. 둘째 행위는 해고 사유이다.', '첫째 행위는 해고 사유이다. 둘째 행위는 징계 사유이다.', 'terms', 'general');
    caught('갑의 부서 인원은 3명이다. 을의 부서 인원은 정해지지 않았다.', '갑의 부서 인원은 정해지지 않았다. 을의 부서 인원은 3명이다.', 'numbers');
  });

  it('날짜·조문은 한 덩이 — 월·일, 조·항 맞바꿈', () => {
    caught('가상 회사는 2026. 3. 2. 해고를 통지하였다.', '가상 회사는 2026. 2. 3. 해고를 통지하였다.', 'numbers', 'general');
    caught('가상 회사는 2026.3.12 해고를 통지하였다.', '가상 회사는 2026.12.3 해고를 통지하였다.', 'numbers', 'general');
    caught('회사는 2026. 1. 12. 을에게 해고를 통보하였다.', '회사는 2026. 12. 1. 을에게 해고를 통보하였다.', 'numbers');
    caught('근로기준법 제3조 제2항에 따른다.', '근로기준법 제2조 제3항에 따른다.', 'numbers', 'general');
    caught('회사는 법 제43조의2에 따라 명단을 공개한다.', '회사는 법 제43조 제2항에 따라 명단을 공개한다.', 'numbers');
    caught('같은 취지의 판결이 있다(대법원 2019다12345 판결).', '같은 취지의 판결이 있다(대법원 2019누12345 판결).', 'numbers');
  });

  it('수치를 먼 문단으로 옮김 → 빠짐·더해짐(글 전체 개수로 상쇄하지 않는다)', () => {
    const r = caught('징계는 정직 3개월이다.\n\n중간 문단이다.\n\n회의는 1회 열렸다.', '징계는 정직이다.\n\n중간 문단이다.\n\n회의는 1회 열렸고 위원은 3명이다.', 'numbers', 'general');
    expect(r.items.numbers.changes.map((c) => c.kind).sort()).toEqual(['added', 'removed']);
  });

  it('조사가 함께 옮겨 간 어순 바꿈·나열 순서 바꿈은 용어 보존됨', () => {
    expect(run('사용자는 근로자에게 서류를 준다.', '근로자에게 사용자는 서류를 준다.').items.terms.status).toBe('보존됨');
    expect(run('근로자와 사용자는 협의한다.', '사용자와 근로자는 협의한다.').items.terms.status).toBe('보존됨');
  });

  it('「근로자」와 「근로자대표」는 다른 용어', () => {
    caught('취업규칙을 불리하게 바꾸려면 근로자의 동의를 받는다.', '취업규칙을 불리하게 바꾸려면 근로자대표의 동의를 받는다.', 'terms');
  });
});

describe('G4 ④ 수치 키 = 부호 + 값 + 만·억 + 단위 + 비교어(전각 숫자는 같은 값)', () => {
  it.each([
    ['정산 차액은 +25만원이다.', '정산 차액은 -25만원이다.'],
    ['지급액은 30만원으로 확정한다.', '지급액은 30억원으로 확정한다.'],
    ['징계위원회는 정직 3개월을 의결하였다.', '징계위원회는 정직 3년을 의결하였다.'],
    ['매출 증감률은 -12%였다.', '매출 증감률은 12%였다.'],
    ['상시 근로자 5인 이상 사업장에 적용된다.', '상시 근로자 5인 미만 사업장에 적용된다.'],
    ['이 규정은 상시 5명 이상의 근로자를 사용하는 사업장에 적용한다.', '이 규정은 상시 5명 미만의 근로자를 사용하는 사업장에 적용한다.'],
    ['을은 처분을 안 날부터 30일 이내에 이의를 신청하였다.', '을은 처분을 안 날부터 30개월 이후에 이의를 신청하였다.'],
    ['을은 ３０일 전에 통지를 받았다.', '을은 ６０일 전에 통지를 받았다.'],
    ['지급일은 매월 １０일이다.', '지급일은 매월 ２０일이다.'],
    ['회사는 을에게 위로금 5천만 원을 지급하기로 하였다.', '회사는 을에게 위로금 5억 원을 지급하기로 하였다.'],
    ['차액은 △300만 원이다.', '차액은 300만 원이다.'],
    ['취업규칙 제Ⅱ장 ①호에 따른다.', '취업규칙 제Ⅲ장 ②호에 따른다.'],
  ])('%s → %s : 수치 훼손', (b, a) => {
    caught(b, a, 'numbers');
  });

  it('같은 값의 다른 표기(전각 숫자·천 단위 쉼표·안에/이내에)는 보존됨', () => {
    expect(run('을은 ３０일 전에 통지를 받았다.', '을은 30일 전에 통지를 받았다.').items.numbers.status).toBe('보존됨');
    expect(run('금액은 1,000원이다.', '금액은 1000원이다.').items.numbers.status).toBe('보존됨');
    expect(run('을은 30일 안에 신청하였다.', '을은 30일 이내에 신청하였다.').items.numbers.status).toBe('보존됨');
    expect(run('날짜는 2026. 3. 2.이다.', '날짜는 2026년 3월 2일이다.').items.numbers.status).toBe('보존됨');
  });
});

describe('G4 ⑤ 부정 표현(극성) — 같은 극성 안 바꿈(아니하 ↔ 않)은 같다', () => {
  it.each([
    ['이 사건 해고는 징계 사유에 해당한다.', '이 사건 해고는 징계 사유에 해당하지 않는다.'],
    ['사용자는 서면으로 통지하여야 한다.', '사용자는 서면으로 통지하여야 하는 것은 아니다.'],
    ['회사는 미지급 수당을 이번 달 말까지 지급하여야 한다.', '회사는 미지급 수당을 이번 달 말까지 지급하여야 하는 것은 아니다.'],
    ['온도가 낮을 가능성이 높다.', '온도가 낮을 가능성이 없다.'],
    ['위 행위는 직장 내 괴롭힘으로 인정되는 것으로 보인다.', '위 행위는 직장 내 괴롭힘으로 인정된다고 보기 어렵다.'],
    ['위 사정을 종합하면 이 사건 처분은 정당하다.', '위 사정을 종합하면 이 사건 처분은 부당하다.'],
    ['을은 면담에서 “사직하겠다”고 말하였다.', '을은 면담에서 “사직하겠다”고 말하지 않았다.'],
    ['사용자는 이를 지급하지 아니할 수 없다.', '사용자는 이를 지급하지 않는다.'],
  ])('%s → %s : 부정 표현 훼손', (b, a) => {
    caught(b, a, 'polarity');
  });

  it('「아니한다 → 않는다」·「하여야 → 해야」·「사료됩니다 → 봅니다」·「뿐만 아니라」 풀어 씀은 보존됨(legal)', () => {
    for (const form of ['아니한다', '아니함', '아니합니다', '아니하였다']) {
      expect(run(`사용자는 이를 지급하지 ${form}.`, '사용자는 이를 지급하지 않는다.').damaged, form).toEqual([]);
    }
    expect(run('회사는 계획을 제출하여야 한다.', '회사는 계획을 제출해야 한다.').damaged).toEqual([]);
    expect(run('이 사건 해고는 정당하다고 사료됩니다.', '이 사건 해고는 정당하다고 봅니다.').damaged).toEqual([]);
    expect(run('갑은 기본급뿐만 아니라 수당도 받는다.', '갑은 기본급과 수당을 모두 받는다.').damaged).toEqual([]);
  });
});

describe('G4 ⑥ 당위·추측 — 생김도 훼손, 다른 절로 옮겨 붙음 · 대구 두 항 맞바꿈', () => {
  it('단정 → 추측, 서술 → 당위(생김)', () => {
    const r = caught('이 사건 해고는 부당하다.', '이 사건 해고는 부당한 것으로 보인다.', 'modality');
    expect(r.items.modality.changes[0]).toMatchObject({ kind: 'gained', modality: '추측' });
    expect(caught('근로자는 사직서를 제출한다.', '근로자는 사직서를 제출하여야 한다.', 'modality', 'general').items.modality.changes[0]).toMatchObject({ kind: 'gained', modality: '당위' });
  });

  it('당위 표지가 다른 절로 옮겨 붙음 → 훼손(옮김)', () => {
    const r = caught('갑은 보관해야 하며 을은 폐기한다.', '갑은 보관하며 을은 폐기해야 한다.', 'modality', 'general');
    expect(r.items.modality.changes[0]).toMatchObject({ kind: 'moved', modality: '당위' });
    for (const g of ['legal', 'general']) {
      caught('사용자는 해고 사유를 서면으로 통지하여야 한다. 다음 문단이다.', '사용자는 해고 사유를 서면으로 통지한다. 근로자는 이의를 제기하여야 한다. 다음 문단이다.', 'modality', g);
    }
  });

  it('붙은 말만 다듬은 것(통지하여야 → 통지를 하여야 · 알려야)은 보존됨', () => {
    expect(run('사용자는 해고 사유를 통지하여야 한다.', '사용자는 해고 사유의 통지를 하여야 한다.', 'general').items.modality.status).toBe('보존됨');
    expect(run('사용자는 해고 사유를 통지하여야 한다.', '사용자는 해고 사유를 알려야 한다.', 'general').items.modality.status).toBe('보존됨');
  });

  it('한 곳에서 지우고 먼 문단에 더한 당위·추측은 상쇄되지 않는다', () => {
    caught('첫 문단이다.\n\n사용자는 해고 사유를 서면으로 통지하여야 한다.\n\n가운데 문단이다.\n\n근로자는 출근한다.',
      '첫 문단이다.\n\n사용자는 해고 사유를 서면으로 통지한다.\n\n가운데 문단이다.\n\n근로자는 출근해야 한다.', 'modality', 'general');
    caught('첫 문단이다.\n\n이 사건 처분은 재량권을 일탈한 것으로 보인다.\n\n가운데 문단이다.\n\n결론은 같다.',
      '첫 문단이다.\n\n처분은 위법하다.\n\n가운데 문단이다.\n\n결론은 같은 것으로 보인다.', 'modality', 'general');
  });

  it('대구 두 항 맞바꿈(갑이 아니라 을 → 을이 아니라 갑, 5줄) → 대구 훼손', () => {
    const r = caught(Array(5).fill('갑이 아니라 을이 지급한다.').join('\n'), Array(5).fill('을이 아니라 갑이 지급한다.').join('\n'), 'antithesis', 'general');
    expect(r.items.antithesis.changes[0].kind).toBe('reordered');
  });
});

describe('G4 ⑦ 인용 범위 — 머리줄 없는 > 줄 · 곧은 따옴표 · 반각 낫표·화살괄호 · 여러 줄 · 닫히지 않은 부호', () => {
  it.each([
    ['법원은 다음과 같이 판단했다.\n> 해고는 정당하다.', '법원은 다음과 같이 판단했다.\n> 해고는 부당하다.'],
    ['을의 진술은 다음과 같다.\n\n> 그날 팀장이 저에게 서류를 던졌습니다.\n> 저는 아무 말도 하지 못했습니다.', '을의 진술은 다음과 같다.\n\n> 그날 팀장이 저에게 서류를 건넸습니다.\n> 저는 아무 말도 하지 못했습니다.'],
    ["갑은 '내일 출근하지 마라'고 했다.", "갑은 '내일 출근해라'고 했다."],
    ["갑은 을에게 '내일부터 나오지 마라'고 말하였다.", "갑은 을에게 '내일부터 꼭 나와라'고 말하였다."],
    ['갑은 "그만두라"고 했고 키는 5" 이다.', '갑은 "나가라"고 했고 키는 5" 이다.'],
    ['회사는 ｢인사규정｣ 및 〈복무지침〉과 《징계양정표》에 따랐다.', '회사는 ｢보수규정｣ 및 〈출장지침〉과 《포상기준표》에 따랐다.'],
    ['갑은 “내일부터\n출근하지 마라”고 했다.', '갑은 “내일부터\n출근해도 된다”고 했다.'],
    ['갑은 “그만두라고 말하였다.', '갑은 “계속 다니라고 말하였다.'],
  ])('%s → %s : 인용 훼손', (b, a) => {
    caught(b, a, 'quotes', 'general');
  });

  it('폭 없는 문자·NFD 로 들어온 같은 글은 보존됨·변경률 0', () => {
    const b = '갑은 “출근하라는 연락을 받은 적이 없다”라고 진술하였다.';
    for (const a of [b.replace('연락', '연​락'), b.normalize('NFD')]) {
      const r = run(b, a);
      expect(r.status).toBe('보존됨');
      expect(r.changeRate.rate).toBe(0);
    }
  });
});

describe('G4 ⑧ 주민번호 — 대시류·전각 숫자도 멈추고, 긴 숫자 열은 발췌에서 가린다', () => {
  it('EN DASH·전각 숫자·폭 없는 문자로 나눈 주민번호도 멈춘다', () => {
    for (const s of ['을(900101–1234567)은 통지를 받았다.', '을(９００１０１-１２３４５６７)은 통지를 받았다.', '을(900101-​1234567)은 통지를 받았다.']) {
      expect(rewriteRrnStop(s, '고친 글'), s).toMatchObject({ ok: false, rrnLines: { before: [1], after: [] } });
    }
  });

  it('12자리 이상 이어진 숫자는 응답 글에 그대로 실리지 않는다', () => {
    const r = run('계좌는 110123456789 이다.', '계좌는 110123456780 이다.', 'general');
    expect(r.items.numbers.status).toBe('훼손');
    expect(JSON.stringify(r)).not.toMatch(/\d{12}/);
  });
});

describe('G4 — 페이블 추가 반례(겹친 용어·징계 수위·당사자·요일·줄바꿈에 걸친 당위·당위 약화·블록 자리)', () => {
  it('겹친 용어(해고 → 해고예고 · 임금 → 최저임금 · 징계 → 징계위원회)는 상쇄되지 않는다', () => {
    caught('회사는 해고를 서면으로 알렸다. 을의 임금은 월 300만 원이다. 징계는 3월에 있었다.', '회사는 해고예고를 서면으로 알렸다. 을의 최저임금은 월 300만 원이다. 징계위원회는 3월에 있었다.', 'terms', 'general');
  });

  it('징계 수위·당사자(신청인·피신청인) 자리 맞바꿈 → 용어 훼손', () => {
    caught('갑에게는 감봉을, 을에게는 견책을 의결하였다.', '갑에게는 견책을, 을에게는 감봉을 의결하였다.', 'terms', 'general');
    caught('피신청인이 신청인의 어깨를 밀쳤다는 사실이 확인된다.', '신청인이 피신청인의 어깨를 밀쳤다는 사실이 확인된다.', 'terms', 'general');
  });

  it('요일 표기 (월) → (화) → 수치 훼손', () => {
    caught('면담은 2026. 3. 2.(월) 오전에 진행하였다.', '면담은 2026. 3. 2.(화) 오전에 진행하였다.', 'numbers', 'general');
  });

  it('줄바꿈에 걸친 당위(지급해야⏎한다)를 없앰 → 당위 훼손', () => {
    caught('회사는 을에게 이번 달 말까지 밀린 수당 전부를 지급해야\n한다는 점을 분명히 알린다.', '회사는 을에게 이번 달 말까지 밀린 수당 전부를 지급하면\n좋다는 점을 분명히 알린다.', 'modality', 'general');
  });

  it('당위를 권고로 약하게 함(하여야 한다 → 하는 것이 바람직하다) → 당위 훼손', () => {
    const r = caught('회사는 30일 전에 예고하여야 한다.', '회사는 30일 전에 예고하는 것이 바람직하다.', 'modality', 'general');
    expect(r.items.modality.changes.map((c) => [c.kind, c.modality]).sort()).toEqual([['gained', '권고'], ['lost', '당위']]);
  });

  it('글자가 같은 판례 블록 둘의 자리를 맞바꿈 → 블록 훼손(자리 바뀜)', () => {
    const blk = (n: string, d: string, body: string) => `[관련 판결] 가상법원 ${d} 선고 ${n} 판결\n> ${body}`;
    const b1 = blk('2019가합1234', '2020. 5. 14.', '사용자가 서면으로 통지하지 아니한 해고는 효력이 없다.');
    const b2 = blk('2020나5678', '2021. 6. 10.', '징계위원회 구성에 흠이 있으면 그 징계는 효력이 없다.');
    const doc = (x: string, y: string) => `쟁점 1은 해고 사유가 있는지이다.\n\n${x}\n\n쟁점 2는 절차를 지켰는지이다.\n\n${y}\n\n두 쟁점을 차례로 본다.`;
    const r = caught(doc(b1, b2), doc(b2, b1), 'blocks');
    expect(r.items.blocks.changes.map((c) => c.kind)).toEqual(['reordered']);
  });

  it('뜻이 같은 바꿈(판단됩니다 → 판단합니다 · 알지 못한다 → 모른다의 극성)은 잡지 않는다', () => {
    expect(run('징계 사유가 인정된다고 사료됩니다. 양정은 적정하다고 판단됩니다.', '징계 사유가 인정된다고 봅니다. 양정은 적정하다고 판단합니다.').damaged).toEqual([]);
    expect(run('을은 그 사정을 알지 못한다.', '을은 그 사정을 모른다.', 'general').items.polarity.status).toBe('보존됨');
  });
});

describe('G4 — 마감 점검(조사 없는 징계 수위 옆 당사자 맞바꿈 · 못 읽은 판례 머리줄 아래 본문)', () => {
  it('조사 없이 쓴 징계 수위(정직 3개월 · 감봉 처분)가 있어도 당사자 맞바꿈은 잡는다', () => {
    for (const g of ['legal', 'general'] as const) {
      caught('근로자가 사용자에게 정직 3개월에 대해 항의하였다.', '사용자가 근로자에게 정직 3개월에 대해 항의하였다.', 'terms', g);
      caught('사용자가 근로자에게 감봉 처분을 하였다.', '근로자가 사용자에게 감봉 처분을 하였다.', 'terms', g);
    }
  });

  it('줄머리 번호 꼴만 바꿈(1) 2) → 가. 나. · ① ② → 1) 2))은 수치 보존됨, 줄머리 날짜를 바꾸면 잡는다', () => {
    const b = '1) 사실관계를 본다.\n2) 판단을 적는다.\n① 첫째 사정이다.\n② 둘째 사정이다.\nⅡ. 결론';
    const a = '가. 사실관계를 본다.\n나. 판단을 적는다.\n1) 첫째 사정이다.\n2) 둘째 사정이다.\n3. 결론';
    expect(run(b, a, 'legal').items.numbers.status).toBe('보존됨');
    caught('3. 2. 면담을 하였다.', '3. 3. 면담을 하였다.', 'numbers', 'general');
    caught('1) 30일 안에 알린다.', '1) 60일 안에 알린다.', 'numbers', 'general');
  });

  it('판례 이름이 붙은 [관련 … 줄을 블록으로 못 읽어도 그 아래 본문이 바뀌면 보존됨을 내지 않는다', () => {
    const t = (head: string, x: string) => `본문이다.\n\n${head}\n이 사건 전보는 ${x}.\n\n이어서 본다.`;
    for (const head of ['[관련 판결: 가상법원 2020. 5. 14. 선고 2019가합1234 판결]', '[관련 결정 가상위원회 2020. 5. 14. 결정']) {
      const r = caught(t(head, '정당하다'), t(head, '적당하다'), 'blocks', 'general');
      expect(r.items.blocks.unrecognized).toEqual({ before: [3], after: [3] });
    }
    // 같은 글이면 보존됨, 판례 이름이 없는 [관련 법령] 아래 평문은 블록으로 보지 않는다
    expect(run(t('[관련 판결: 가상법원]', '정당하다'), t('[관련 판결: 가상법원]', '정당하다'), 'general').status).toBe('보존됨');
    expect(run(t('[관련 법령] 가상법 제1조', '정당하다'), t('[관련 법령] 가상법 제1조', '적당하다'), 'general').items.blocks.status).toBe('보존됨');
  });
});

describe('G4 ⑨ 닻 맞추기 작업량 상한', () => {
  it('같은 문장이 두 번씩 엮인 글(k=8,000)도 8초 안에 끝난다', { timeout: 60_000 }, () => {
    const S = ['가나다라마바사아자차카타파하', '고노도로모보소오조초코토포호', '구누두루무부수우주추쿠투푸후', '기니디리미비시이지치키티피히'];
    const tok = (i: number) => S.map((row, d) => row[Math.floor(i / 14 ** d) % 14]).join('');
    const A: string[] = [];
    const B: string[] = [];
    for (let i = 1; i <= 8000; i++) {
      A.push(`${tok(i)}임.`, `${tok(i - 1)}임.`);
      B.push(`${tok(i)}임.`, `${tok(i)}쪽.`, `${tok(i - 1)}임.`, `${tok(i - 1)}곳.`);
    }
    const t = performance.now();
    const r = run(A.join('\n'), B.join('\n'), 'general');
    expect(['보존됨', '훼손', '변경률 초과']).toContain(r.status);
    expect(performance.now() - t).toBeLessThan(8000);
  });
});
