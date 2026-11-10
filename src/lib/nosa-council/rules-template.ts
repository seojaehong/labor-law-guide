// 협의회규정 견본 — 입력 → 협의회규정 FormDoc(work-rules-report/render.ts 가 PDF·한글로 그린다).
// 정본 문안 = 노사협의회신고 스킬 references/council-rules-template-261110.md §2 「견본 본문」
// (고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.) [부록 1]을 2022. 12. 11. 시행 법령에 맞춰 고친 것, 국가 저작물 자유 이용).
// 조문 글자는 그 견본 그대로다. 같은 파일 §1 변경표(R1~R12)가 고친 곳:
//   R1 제6조 위원 수 각 3~10명·과반수 노동조합 위촉(선택 B) · R2 제10조 불이익 금지·근로 간주 시간 칸 · R3 제16조 추천요건 삭제
//   R4 제17조 직접선출 원칙·선거구(선택)·위원선거인 간접선출(선택, 부득이한 사유)·찬반투표 · R5 제18조② 차점자는 과반수 노동조합이 없을 때만
//   R6 제26조 17개 호(16호 성희롱 예방, 12호 「직무 발명」) · R7 제31조 중재 대상 = 의결사항(법 제21조)·노사 합의 · R8 제33·34조 3명 이내·선임·청취한 날부터 10일
//   R9 제38조 15일 이내 제출·협의회 의결 · R10 제14조 사용자 측 선관위원 불가 · R11 비밀 누설 징계 조항 삭제 · R12 제35조 창구 칸
// 이 파일에서 견본과 달리 쓴 것:
//   - 제35조 제목 「고충 상담 창구」 → 「고충상담 창구」 — 공개 문구 금지어(「상담」) 때문이다. 「고충상담」은 법령 절차 이름이라 허용 구절이다(tool-kit/banned.ts).
//   - [선택] 조항은 입력에 따라 하나만 남기고 표기를 지운다. 과반수 노동조합이 있으면 제3장(근로자위원의 선출) 전체를 뺀다.
//     조 번호는 남은 조로 다시 매기고, 다른 조를 가리키는 번호(제6조②·제21조·제26조②·제31조①)도 함께 맞춘다. 항 번호도 남은 항으로 다시 매긴다.
//   - {칸} 은 값이 있으면 채우고(으로/로 조사는 값의 받침에 맞춘다), 없으면 ○○ 로 둔다. {선거구 표} 는 맨 뒤 [별표] 로 만든다.
// 견본 출처 문장(RULES_SOURCE)은 문서에 넣지 않고 도구 출력 notice 로만 낸다(261110 지시).
import type { FormBlock, FormDoc } from '@/lib/work-rules-report/render';
import { dateKo } from '@/lib/work-rules-report/forms';
import { GRIEVANCE_MAX, isoDate, MEMBERS_MAX, MEMBERS_MIN } from './assess';

export const RULES_SOURCE = '고용노동부 『노사협의회 운영 매뉴얼』(2022. 12.) [부록 1]을 2022. 12. 11. 시행 법령에 맞추어 고침';

export interface RulesInput {
  workplaceName?: string;
  /** 근로자 과반수로 조직된 노동조합이 있다 — 제6조② 선택 B, 제3장 없음 */
  majorityUnion: boolean;
  unionName?: string;
  /** 위원선거인 간접선출의 부득이한 사유 — 있으면 제17조 위원선거인 항을 넣는다 */
  indirectReason?: string;
  workerMembers?: number;
  employerMembers?: number;
  grievanceMembers?: number;
  councilName?: string;
  unit?: '사업' | '사업장';
  /** 설치단위 이름(예: 가상상사 본사). 비우고 unit 이 「사업」이면 사업장명 */
  unitName?: string;
  /** 정기회의 시기(예: 매 분기 마지막 달 첫째 주) */
  regularMeetings?: string;
  /** 부칙 시행일 YYYY-MM-DD */
  effectiveDate?: string;
  /** 제7조① 공동의장 */
  coChair?: boolean;
  chairTerm?: string;
  /** 제6조③ 사용자위원 직위(이름이 아니라 직위) */
  employerPositions?: string[];
  /** 제10조③ 회의 1회당 이동·자료검토 인정 시간 */
  allowanceHours?: number;
  subcommitteeMembers?: number;
  electionCommitteeMembers?: number;
  /** 제17조② 동점 처리 기준 */
  tieBreak?: string;
  /** 제17조 선거구 — 있으면 선거구 항과 [별표]를 넣는다 */
  districts?: { label?: string; seats?: number }[];
  arbitrationMembers?: number;
  /** 제35조 고충 신고 창구 */
  grievanceDesk?: string;
}

const BLANK = '○○';
const BLANK_DATE = '○○○○년 ○○월 ○○일';
const t = (s: string | undefined) => (s ?? '').trim();
const posInt = (n: number | undefined) => n == null || (Number.isInteger(n) && n >= 1);

/** 만들 수 없는 입력 — 비어 있지 않으면 councilRulesDoc 이 던진다 */
export function rulesErrors(i: RulesInput): string[] {
  const out: string[] = [];
  const range = (n: number | undefined, who: string) => {
    if (n != null && (!Number.isInteger(n) || n < MEMBERS_MIN || n > MEMBERS_MAX)) out.push(`${who} 수는 3명 이상 10명 이하입니다(법 제6조제1항, 받은 값: ${n}).`);
  };
  range(i.workerMembers, '근로자위원');
  range(i.employerMembers, '사용자위원');
  if (i.workerMembers != null && i.employerMembers != null && i.workerMembers !== i.employerMembers) {
    out.push(`근로자위원과 사용자위원은 같은 수로 구성합니다(법 제6조제1항, 받은 값: ${i.workerMembers}명 / ${i.employerMembers}명).`);
  }
  if (i.grievanceMembers != null && (!Number.isInteger(i.grievanceMembers) || i.grievanceMembers < 1 || i.grievanceMembers > GRIEVANCE_MAX)) {
    out.push(`고충처리위원은 3명 이내입니다(법 제27조제1항, 받은 값: ${i.grievanceMembers}).`);
  }
  if (t(i.effectiveDate) && !isoDate(i.effectiveDate)) out.push(`협의회규정 시행일은 YYYY-MM-DD 날짜입니다(받은 값: ${i.effectiveDate}).`);
  if (i.allowanceHours != null && !(i.allowanceHours > 0)) out.push('회의 1회당 인정 시간은 0보다 큰 수입니다.');
  for (const [k, n] of [['실무소위원 수', i.subcommitteeMembers], ['선거관리위원 수', i.electionCommitteeMembers], ['중재위원 수', i.arbitrationMembers]] as const) {
    if (!posInt(n)) out.push(`${k}는 1 이상의 정수입니다(받은 값: ${n}).`);
  }
  if ((i.districts ?? []).some((d) => !posInt(d.seats))) out.push('선거구별 근로자위원 수는 1 이상의 정수입니다.');
  return out;
}

/** (으)로 — 값의 끝 글자 받침에 맞춘다. 빈칸·한글이 아닌 끝은 견본 글자 그대로 */
function ro(word: string, literal: '으로' | '로'): string {
  const c = word.charCodeAt(word.length - 1);
  if (word === BLANK || c < 0xac00 || c > 0xd7a3) return word + literal;
  const jong = (c - 0xac00) % 28;
  return word + (jong === 0 || jong === 8 ? '로' : '으로');
}

interface Para {
  text: string;
  items?: string[];
}
interface Art {
  /** 다른 조가 가리키는 조 — 본문의 {{key}} 가 「제N조」로 바뀐다 */
  key?: string;
  title: string;
  paras: Para[];
}
interface Chap {
  title: string;
  arts: Art[];
}

const p = (text: string, items?: string[]): Para => ({ text, items });

function chapters(i: RulesInput): Chap[] {
  const name = t(i.workplaceName) || BLANK;
  const fill = (s: string | undefined) => t(s) || BLANK;
  const num = (n: number | undefined) => (n != null ? String(n) : BLANK);
  const members = i.workerMembers ?? i.employerMembers;
  const unit = t(i.unitName) || (i.unit === '사업' && t(i.workplaceName) ? name : BLANK);
  const positions = (i.employerPositions ?? []).map(t).filter(Boolean);
  const reason = t(i.indirectReason);
  const districts = i.districts ?? [];

  const general: Chap = {
    title: '총칙',
    arts: [
      { title: '목적', paras: [p(`이 규정은 근로자와 사용자 쌍방이 이해와 협조를 통하여 노사 공동의 이익을 증진함으로써 ${name}의 발전과 근로자 복지증진에 이바지함을 목적으로 한다.`)] },
      { title: '명칭 및 설치단위', paras: [p(`노사협의회(이하 "협의회"라 한다)는 ${unit}에 두며, 명칭은 ${ro(fill(i.councilName), '으로')} 한다.`)] },
      { title: '신의성실의 의무', paras: [p('근로자와 사용자는 서로 신뢰하며 성실하게 협의에 임하여야 한다.')] },
      { title: '노동조합과의 관계', paras: [p('노동조합의 단체교섭이나 그 밖의 모든 활동은 이 규정에 의하여 영향을 받지 아니한다.')] },
      {
        title: '사용자의 의무',
        paras: [p('사용자는 근로자위원의 선출에 개입하거나 방해하여서는 아니 된다.'), p('사용자는 근로자위원의 업무를 위하여 장소의 사용 등 기본적인 편의를 제공한다.')],
      },
    ],
  };

  const composition: Chap = {
    title: '협의회의 구성',
    arts: [
      {
        title: '협의회의 구성',
        paras: [
          p(`협의회는 근로자를 대표하는 위원(이하 "근로자위원"이라 한다)과 사용자를 대표하는 위원(이하 "사용자위원"이라 한다) 각 ${num(members)}명으로 구성한다. 위원 수는 각 3명 이상 10명 이하로 한다.`),
          i.majorityUnion
            ? p(`근로자위원은 ${fill(i.unionName)}의 대표자와 그 노동조합이 위촉하는 자로 한다.`)
            : p('근로자위원은 근로자가 {{elect}}에 따라 선출한다.'),
          p('사용자위원은 대표자와 대표자가 위촉하는 다음 각 호의 사람으로 한다.', [...(positions.length ? positions : [BLANK, BLANK]), '그 밖에 대표자가 위촉하는 임직원']),
        ],
      },
      {
        title: '의장',
        paras: [
          p(`협의회의 의장은 위원 중에서 호선한다.${i.coChair ? ' 이 경우 근로자위원과 사용자위원 중 각 1명을 공동의장으로 한다.' : ''}`),
          p('의장은 협의회를 대표하며 회의 업무를 총괄한다.'),
          p(`의장의 임기는 ${ro(fill(i.chairTerm), '로')} 한다.`),
        ],
      },
      { title: '간사', paras: [p('노사 쌍방은 회의 결과의 기록 등 사무를 담당하는 간사 1명을 각각 둔다.'), p('간사는 근로자위원과 사용자위원 중에서 각각 호선한다.')] },
      {
        title: '위원의 임기',
        paras: [p('위원의 임기는 3년으로 하되, 연임할 수 있다.'), p('보궐위원의 임기는 전임자 임기의 남은 기간으로 한다.'), p('위원은 임기가 끝난 경우라도 후임자가 선출될 때까지 계속 그 직무를 담당한다.')],
      },
      {
        title: '위원의 신분',
        paras: [
          p('위원은 비상임·무보수로 한다.'),
          p('사용자는 협의회 위원으로서의 직무 수행과 관련하여 근로자위원에게 불이익을 주는 처분을 하여서는 아니 된다.'),
          p(`위원의 협의회 출석 시간은 근로한 시간으로 본다. 협의회 출석과 직접 관련된 이동 시간과 자료 검토 시간도 회의 1회당 ${num(i.allowanceHours)}시간까지 근로한 시간으로 본다.`),
        ],
      },
      {
        title: '실무소위원회',
        paras: [
          p('협의회는 상정된 안건을 미리 심의하기 위하여 실무소위원회를 둘 수 있다.'),
          p(`실무소위원회는 노사위원 각 ${num(i.subcommitteeMembers)}명으로 구성한다.`),
          p('노사 어느 한쪽의 협의회 대표는 실무소위원회를 열 필요가 있으면 상대방에게 7일 전까지 알려야 한다. 다만, 긴급하거나 신속한 결정이 필요한 경우에는 그러하지 아니하다.'),
        ],
      },
    ],
  };

  const election: Chap = {
    title: '근로자위원의 선출',
    arts: [
      {
        title: '선거관리위원회의 구성',
        paras: [p(`근로자위원 선출을 관리하기 위하여 ${num(i.electionCommitteeMembers)}명 이내의 위원으로 선거관리위원회(이하 "선관위"라 한다)를 둔다.`), p('선관위는 선거 공고일 14일 전까지 구성한다.')],
      },
      { title: '선관위의 임무', paras: [p('선관위는 다음 각 호의 사무를 맡는다.', ['선거와 일정의 공고', '후보 등록과 투표에 관한 사항', '당선자 결정에 관한 사항', '그 밖에 선거에 관한 사항'])] },
      { title: '선거관리위원의 선출', paras: [p('선거관리위원은 선거관리에 참여하기를 원하는 근로자 중에서 추첨으로 정한다. 사용자나 사용자를 위하여 행동하는 사람은 선거관리위원이 될 수 없다.')] },
      { title: '선거일', paras: [p('근로자위원 선거는 근로자위원 임기가 끝나는 날 15일 전까지 실시한다.')] },
      {
        title: '입후보',
        paras: [p('해당 사업 또는 사업장의 근로자는 근로자위원에 입후보할 수 있다.'), p('입후보하려는 사람은 선관위가 공고한 기간에 선관위에 등록한다.'), p('선거관리위원은 근로자위원에 입후보할 수 없다.')],
      },
      {
        key: 'elect',
        title: '근로자위원의 선출',
        paras: [
          p('근로자위원은 근로자 과반수가 참여하여 직접·비밀·무기명 투표로 선출한다.'),
          p(`당선자는 다수 득표자 순으로 정하고, 득표수가 같으면 ${fill(i.tieBreak)} 순으로 정한다.`),
          p('후보자 수가 선출할 인원 이하인 경우에도 투표를 실시하며, 후보자별 찬반투표로 정한다.'),
          ...(districts.length ? [p('근로자위원을 선거구별로 선출하는 경우 선거구와 선거구별 인원은 별표와 같이 하고, 선거구마다 그 선거구 근로자 과반수가 참여하여야 한다.')] : []),
          ...(reason
            ? [p(`부서별로 근로자 수에 비례하여 위원선거인을 근로자 과반수가 참여한 직접·비밀·무기명 투표로 선출하고, 위원선거인 과반수가 참여한 직접·비밀·무기명 투표로 근로자위원을 선출할 수 있다. 부득이한 사유: ${reason}`)]
            : []),
        ],
      },
      {
        title: '보궐',
        paras: [
          p('근로자위원에 결원이 생기면 30일 이내에 보궐위원을 선출한다.'),
          p('제1항에도 불구하고 근로자 과반수로 조직된 노동조합이 없는 동안에는 근로자위원 선출 투표에서 선출되지 못한 사람 중 득표 순에 따른 차점자를 근로자위원으로 할 수 있다. 이를 위하여 선관위는 차점자 명부를 작성하여 보관한다.'),
        ],
      },
    ],
  };

  const operation: Chap = {
    title: '협의회의 운영',
    arts: [
      { title: '회의', paras: [p(`협의회는 3개월마다 정기회의를 열며, 정기회의는 ${fill(i.regularMeetings)}에 연다.`), p('협의회는 필요하면 임시회의를 열 수 있다.')] },
      {
        key: 'convene',
        title: '회의 소집',
        paras: [
          p('의장은 협의회의 회의를 소집하며 그 의장이 된다.'),
          p('의장은 노사 어느 한쪽의 대표자가 회의의 목적을 문서로 밝혀 회의 소집을 요구하면 그 요구에 따라야 한다.'),
          p('의장은 회의 개최 7일 전까지 회의 일시, 장소, 의제 등을 각 위원에게 알려야 한다.'),
        ],
      },
      {
        title: '자료의 사전 제공',
        paras: [
          p('근로자위원은 {{convene}}제3항에 따라 통보된 의제 중 {{topics}}의 협의사항과 {{resolutions}}의 의결사항에 관련된 자료를 회의 개최 전에 사용자에게 요구할 수 있으며, 사용자는 이에 성실히 따라야 한다. 다만, 요구 자료가 기업의 경영·영업상 비밀이나 개인정보에 해당하면 그러하지 아니하다.'),
        ],
      },
      { key: 'quorum', title: '정족수', paras: [p('회의는 근로자위원과 사용자위원 각 과반수의 출석으로 열고, 출석위원 3분의 2 이상의 찬성으로 의결한다.')] },
      { title: '회의의 공개', paras: [p('협의회의 회의는 공개한다. 다만, 협의회의 의결로 공개하지 아니할 수 있다.')] },
      { title: '비밀 유지', paras: [p('협의회의 위원은 협의회에서 알게 된 비밀을 누설하여서는 아니 된다.')] },
      {
        title: '회의록',
        paras: [
          p('협의회는 다음 각 호의 사항을 적은 회의록을 작성하여 갖추어 둔다.', ['개최 일시 및 장소', '출석 위원', '협의 내용 및 의결된 사항', '그 밖의 토의사항']),
          p('회의록에는 출석위원 전원이 서명하거나 날인한다.'),
          p('회의록은 작성한 날부터 3년간 보존한다.'),
        ],
      },
    ],
  };

  const duties: Chap = {
    title: '협의회의 임무',
    arts: [
      {
        key: 'topics',
        title: '협의사항',
        paras: [
          p('협의회는 다음 각 호의 사항을 협의한다.', [
            '생산성 향상과 성과 배분',
            '근로자의 채용·배치 및 교육훈련',
            '근로자의 고충처리',
            '안전, 보건, 그 밖의 작업환경 개선과 근로자의 건강증진',
            '인사·노무관리의 제도 개선',
            '경영상 또는 기술상의 사정으로 인한 인력의 배치전환·재훈련·해고 등 고용조정의 일반원칙',
            '작업과 휴게 시간의 운용',
            '임금의 지불방법·체계·구조 등의 제도 개선',
            '신기계·기술의 도입 또는 작업 공정의 개선',
            '작업 수칙의 제정 또는 개정',
            '종업원지주제와 그 밖에 근로자의 재산형성에 관한 지원',
            '직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항',
            '근로자의 복지증진',
            '사업장 내 근로자 감시 설비의 설치',
            '여성근로자의 모성보호 및 일과 가정생활의 양립을 지원하기 위한 사항',
            '직장 내 성희롱 및 고객 등에 의한 성희롱 예방에 관한 사항',
            '그 밖의 노사협조에 관한 사항',
          ]),
          p('협의회는 제1항 각 호의 사항에 대하여 {{quorum}}의 정족수에 따라 의결할 수 있다.'),
        ],
      },
      {
        key: 'resolutions',
        title: '의결사항',
        paras: [
          p('사용자는 다음 각 호의 사항에 대하여 협의회의 의결을 거쳐야 한다.', [
            '근로자의 교육훈련 및 능력개발 기본계획의 수립',
            '복지시설의 설치와 관리',
            '사내근로복지기금의 설치',
            '고충처리위원회에서 의결되지 아니한 사항',
            '각종 노사공동위원회의 설치',
          ]),
        ],
      },
      {
        title: '보고사항',
        paras: [
          p('사용자는 정기회의에 다음 각 호의 사항을 성실하게 보고하거나 설명한다.', ['경영계획 전반 및 실적에 관한 사항', '분기별 생산계획과 실적에 관한 사항', '인력계획에 관한 사항', '기업의 경제적·재정적 상황']),
          p('근로자위원은 근로자의 요구사항을 보고하거나 설명할 수 있다.'),
          p('근로자위원은 사용자가 제1항의 보고·설명을 하지 아니하면 제1항 각 호에 관한 자료의 제출을 요구할 수 있으며, 사용자는 이에 성실히 따라야 한다.'),
        ],
      },
      {
        title: '의결사항의 공지',
        paras: [p('의장은 협의회에서 의결된 사항을 의결한 날부터 10일 이내에 근로자에게 널리 알린다.'), p('협의회는 협의회 운영에 관한 사항을 게시판, 사내 전산망 등으로 안내한다.')],
      },
      { title: '의결사항의 이행', paras: [p('근로자와 사용자는 협의회에서 의결된 사항을 성실하게 이행하고, 그 결과를 서로 신속히 알린다.')] },
      {
        title: '임의 중재',
        paras: [
          p('협의회는 다음 각 호의 어느 하나에 해당하면 근로자위원과 사용자위원의 합의로 협의회에 중재기구를 두어 해결하거나, 노동위원회나 그 밖의 제삼자에 의한 중재를 받을 수 있다.', [
            '{{resolutions}}의 의결사항에 관하여 협의회가 의결하지 못한 경우',
            '협의회에서 의결된 사항의 해석이나 이행 방법 등에 관하여 의견이 일치하지 아니하는 경우',
          ]),
          p(`협의회에 두는 중재기구는 노사 각 ${num(i.arbitrationMembers)}명으로 구성한다.`),
          p('중재 결정이 있으면 협의회의 의결을 거친 것으로 보며, 근로자와 사용자는 그 결정에 따라야 한다.'),
        ],
      },
    ],
  };

  const grievance: Chap = {
    title: '고충처리',
    arts: [
      { title: '고충처리위원', paras: [p('근로자의 고충을 청취하고 처리하기 위하여 고충처리위원을 둔다.')] },
      {
        title: '고충처리위원의 구성·임기·신분',
        paras: [
          p(`고충처리위원은 노사를 대표하는 ${num(i.grievanceMembers)}명(3명 이내)으로 하고, 협의회가 그 위원 중에서 선임한다.`),
          p('고충처리위원의 임기는 3년으로 하되, 연임할 수 있다.'),
          p('고충처리위원은 비상임·무보수로 한다.'),
          p('사용자는 고충처리위원의 직무 수행과 관련하여 고충처리위원에게 불리한 처분을 하여서는 아니 된다.'),
          p('고충처리위원이 고충사항의 처리에 관하여 협의하거나 고충처리 업무에 사용한 시간은 근로한 시간으로 본다.'),
        ],
      },
      {
        title: '고충의 처리',
        paras: [
          p('근로자는 고충처리위원에게 구두 또는 서면으로 고충을 신고할 수 있다.'),
          p('고충처리위원은 고충사항을 청취한 날부터 10일 이내에 조치 사항과 그 밖의 처리결과를 해당 근로자에게 알린다.'),
          p('고충처리위원이 처리하기 곤란한 사항은 협의회의 회의에 부쳐 협의 처리한다.'),
        ],
      },
      // 견본 제목 「고충 상담 창구」 — 금지어 「상담」을 피해 법령 절차 이름 「고충상담」으로 붙여 쓴다
      { title: '고충상담 창구', paras: [p(`고충 신고는 ${ro(fill(i.grievanceDesk), '로')} 받는다.`)] },
      { title: '대장 비치', paras: [p('고충처리위원은 고충사항의 접수와 처리에 관한 대장을 작성하여 갖추어 두고 1년간 보존한다.')] },
    ],
  };

  const misc: Chap = {
    title: '보칙',
    arts: [
      { title: '권한의 위임', paras: [p('노사 쌍방의 대표위원은 필요하면 그 권한을 다른 위원에게 위임할 수 있다.')] },
      {
        title: '규정의 제정·변경과 제출',
        paras: [p('이 규정을 제정하거나 변경할 때에는 협의회의 의결을 거친다.'), p('사용자는 협의회를 설치한 날부터 15일 이내에 이 규정을 관할 지방고용노동관서에 제출한다. 규정을 변경한 경우에도 같다.')],
      },
      { title: '운영세칙', paras: [p('협의회는 협의회 운영에 관하여 필요한 사항을 운영세칙으로 정할 수 있다.')] },
      { title: '규정 외의 사항', paras: [p('이 규정에 정하지 아니한 사항은 「근로자참여 및 협력증진에 관한 법률」 등 관계 법령에 따른다.')] },
    ],
  };

  // 과반수 노동조합이 있으면 근로자위원은 노동조합이 위촉한다(제6조② 선택 B) — 제3장 전체를 뺀다
  return [general, composition, ...(i.majorityUnion ? [] : [election]), operation, duties, grievance, misc];
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** 협의회규정 FormDoc. 입력이 rulesErrors 에 걸리면 만들지 않고 던진다 */
export function councilRulesDoc(input: RulesInput): FormDoc {
  const errs = rulesErrors(input);
  if (errs.length) throw new Error(errs.join(' '));
  const chaps = chapters(input);
  // 조 번호는 남은 조로 다시 매기고, {{key}} 가 가리키는 조를 그 번호로 바꾼다
  const numberOf = new Map<string, number>();
  let n = 0;
  for (const c of chaps) for (const a of c.arts) {
    n += 1;
    if (a.key) numberOf.set(a.key, n);
  }
  const ref = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const m = numberOf.get(k);
      if (!m) throw new Error(`협의회규정 견본: 가리키는 조(${k})가 없습니다`);
      return `제${m}조`;
    });

  const name = (input.workplaceName ?? '').trim() || BLANK;
  const title = `${name} 노사협의회 규정`;
  const blocks: FormBlock[] = [{ kind: 'title', text: title }];
  let art = 0;
  chaps.forEach((c, ci) => {
    blocks.push({ kind: 'space', pt: 6 }, { kind: 'text', text: `제${ci + 1}장 ${c.title}`, align: 'center', gapAfter: 8 });
    for (const a of c.arts) {
      art += 1;
      const numbered = a.paras.length > 1;
      a.paras.forEach((para, pi) => {
        const lead = pi === 0 ? `제${art}조(${a.title}) ` : '';
        const mark = numbered ? `${CIRCLED[pi]} ` : '';
        const items = (para.items ?? []).map((x, k) => `\n  ${k + 1}. ${ref(x)}`).join('');
        blocks.push({ kind: 'text', text: `${lead}${mark}${ref(para.text)}${items}`, gapAfter: pi === a.paras.length - 1 ? 8 : 3 });
      });
    }
  });
  const eff = isoDate(input.effectiveDate);
  blocks.push(
    { kind: 'space', pt: 6 },
    { kind: 'text', text: '부칙', align: 'center', gapAfter: 8 },
    { kind: 'text', text: `이 규정은 ${eff ? dateKo(eff) : BLANK_DATE}부터 시행한다.`, gapAfter: 8 },
  );
  const districts = input.majorityUnion ? [] : input.districts ?? [];
  if (districts.length) {
    blocks.push(
      { kind: 'space', pt: 10 },
      { kind: 'text', text: '[별표] 선거구별 근로자위원 수', gapAfter: 4 },
      {
        kind: 'table',
        widths: [60, 40],
        headerRows: 1,
        minRowHeight: 20,
        rows: [
          [{ text: '선거구', head: true }, { text: '근로자위원 수', head: true }],
          ...districts.map((d) => [{ text: (d.label ?? '').trim() || BLANK }, { text: d.seats != null ? `${d.seats}명` : BLANK, align: 'center' as const }]),
        ],
      },
    );
  }
  return { title, blocks };
}
