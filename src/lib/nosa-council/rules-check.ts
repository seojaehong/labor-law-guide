// 협의회규정 본문 점검 — 사업장이 가진 노사협의회 규정 글자를 현행 법령·견본(rules-template.ts)과 조항별로 대조한다.
// 대조 기준(법제처 원문 261117 재확인): 근로자참여 및 협력증진에 관한 법률(2022. 6. 10. 공포, 2022. 12. 11. 시행)
//   · 같은 법 시행령(2022. 11. 8. 공포, 2022. 12. 11. 시행). 견본 변경표 R1~R12 = 노사협의회신고 스킬 references/council-rules-template-261110.md §1.
// 등급(기준 하나): 필수 = 규정 글자가 법령 문언과 다르거나 법령이 정한 사항이 빠졌다(시행령 제5조제1항 기재사항, 법 제20조제1항제16호 포함 —
//         매뉴얼 부록1 예시 규정에 없는 것도 법령이 정하면 필수다).
//       선택 = 법령이 정하지 않은 사항을 고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.) 부록1 예시 규정과 같은 방식으로 정했다 — 협의회가 정한다
//         (입후보 추천 인원·정기회의 고정일·임의중재 추가 사유 등).
//       권장 = 법령 사항은 아니나 고쳐 두면 운영에 도움이 된다(오기·빈 시행일·별지 서식 잔재 등).
// 대조 기준(매뉴얼): 부록1 노사협의회운영규정(예시) 인쇄 153~163쪽. 시행규칙 제3조제1항(2023. 6. 8. 개정)은 변경 제출 때 신·구조문대비표를 요구한다
//   (매뉴얼에 실린 시행규칙은 개정 전 판이라 대비표 첨부가 없다) — AMEND_SUBMISSION_NOTE.
// ★ 결과 글에 공개 문구 금지어(tool-kit/banned.ts)와 포괄·대신·대행·대리·지도를 쓰지 않는다. 「현재」 칸은 사용자 글을 그대로 옮긴다.
// ★ 글자 대조는 공백을 지운 글(sq)로 한다 — 한글에서 복사한 본문은 낱말 중간에 줄바꿈 공백이 끼어 있다(「협 의」).
import { REGULATION_REQUIRED } from './assess';
import { COUNCIL_TOPICS } from './meeting';

export type RulesGrade = '필수' | '권장' | '선택';
export const RULES_GRADES: RulesGrade[] = ['필수', '권장', '선택'];

/** 규정을 고친 뒤 제출 안내 — 점검 결과·신·구조문대비표 도구가 항목과 따로 늘 싣는다 */
export const AMEND_SUBMISSION_NOTE =
  '협의회규정을 변경한 경우에도 변경한 날부터 15일 이내에 관할 지방고용노동관서의 장에게 제출한다(법 제18조제1항 「변경한 경우에도 또한 같다」). ' +
  '변경 제출 서류는 제정·변경 협의회규정 제출서(시행규칙 별지 제1호서식)에 변경된 협의회규정과 신·구조문대비표를 붙인 것이다(시행규칙 제3조제1항제1호·제2호, 2023. 6. 8. 개정). ' +
  '고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.)에 실린 시행규칙 제3조는 개정 전 판이라 신·구조문대비표가 빠져 있다. 규정 변경은 협의회 의결을 거친다(시행령 제5조제2항).';

export interface RulesFinding {
  grade: RulesGrade;
  /** 짧은 분류 키 — 시험·집계용 */
  id: string;
  /** 규정 위치 — 예: 제7조제2항, 부칙, 별지 서식 */
  regulation: string;
  /** 근거 법령 조문 */
  law: string;
  /** 무엇이 다른가 */
  issue: string;
  /** 고칠 방향(문안 예시) */
  change: string;
  /** 규정의 지금 글(앞부분) */
  current?: string;
}

export interface RequiredItem {
  no: number;
  item: string;
  found: boolean;
  where?: string;
}

export interface RulesCheck {
  findings: RulesFinding[];
  counts: Record<RulesGrade, number>;
  requiredItems: RequiredItem[];
  parsed: { articles: number; addendum: boolean; formsTail: boolean; workplaceName?: string };
}

// ── 본문 나누기 ─────────────────────────────────────────

export interface Item { no: number; text: string }
/** no 0 = 항 번호 없는 본문 */
export interface Para { no: number; text: string; items: Item[] }
/** title 은 공백을 지운 제목(대조용), head 는 원문 머리(「제8조(의장 및 위원)」) */
export interface Article { no: number; sub?: number; title: string; head: string; paras: Para[]; prefix: string }

export const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const sq = (s: string) => s.replace(/\s+/g, '');
const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
/** 가운뎃점 변형(‧ ․ ㆍ ・ ･)을 · 로, 전각 괄호를 반각으로 */
function normalize(text: string): string {
  return normalizeLines(text).replace(/[‧․ㆍ・･]/g, '·').replace(/（/g, '(').replace(/）/g, ')');
}
/** 줄바꿈 통일 + 마크다운 머리 표시(「## 제 1 장」·「# 제목」)만 지운다 — 글자는 그대로(신·구조문대비표가 이 글을 쓴다) */
export function normalizeLines(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
}

const ART_RE = /^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*\(([^)]*)\)\s*(.*)$/;
/** 줄 처음에 온 다른 조 인용(「제26조(…)에 의하여 …」) — 괄호 바로 뒤에 조사가 붙으면 조 머리가 아니라 본문이다 */
const XREF_ONE = String.raw`제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\([^()]*\)(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?`;
const XREF_RE = new RegExp(
  String.raw`^${XREF_ONE}(?:\s*(?:및|또는|과|와|,|·)\s*${XREF_ONE})*\s*(?:에\s*(?:의|따|정한|규정|도\s*불구|해당|준하)|의\s*규정|에서\s*(?:정|규정)|[을를]\s*(?:준용|위반)|부터)`,
);
/** 조 머리 줄 — 인용 줄은 빼고 */
const isArtHead = (line: string) => ART_RE.test(line) && !XREF_RE.test(line);
const CHAPTER_RE = /^제\s*\d+\s*장(\s|$)/;
const ITEM_RE = /^(\d{1,2})\s*\.\s*(.*)$/;
const isAddendumHead = (line: string) => /^부칙(\(|<|$)/.test(sq(line));
const isFormsHead = (line: string) => /^[[<［〔]/.test(line.trim()) || /^(위원등명부|위촉장|공고$|추천서$|별지)/.test(sq(line));

/** 조문·항·호로 나눈다. 한 문단이 여러 줄로 끊긴 곳은 이어 붙인다 — 앞 줄 끝에 공백이 없고 앞뒤가 한글이면 붙여 쓰고(「불 / 이익한」), 아니면 한 칸 띄운다 */
export function parseArticles(lines: string[], prefix: string): Article[] {
  const out: Article[] = [];
  let cur: Article | null = null;
  let para: Para | null = null;
  let item: Item | null = null;
  let prevRaw = '';
  const startPara = (no: number, text: string) => {
    para = { no, text, items: [] };
    item = null;
    cur!.paras.push(para);
  };
  // 줄바꿈에 끊긴 낱말은 붙이고, 줄 처음에 온 다른 조 인용(새 어절)은 띄운다
  const glue = (before: string, line: string) => (!XREF_RE.test(line) && !/\s$/.test(prevRaw) && /[가-힣]$/.test(before) && /^[가-힣]/.test(line) ? '' : ' ');
  const addText = (raw: string) => {
    const line = raw.trim();
    if (!line || !cur) return;
    const c = CIRCLED.indexOf(line[0]);
    if (c >= 0) return startPara(c + 1, line.slice(1).trim());
    const m = ITEM_RE.exec(line);
    if (m && para) {
      item = { no: Number(m[1]), text: m[2].trim() };
      (para as Para).items.push(item);
      return;
    }
    if (!para) return startPara(0, line);
    if (item) (item as Item).text += glue((item as Item).text, line) + line;
    else (para as Para).text += glue((para as Para).text, line) + line;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || CHAPTER_RE.test(line)) continue;
    // 첫 조 앞(부칙 첫 줄·장 제목 바로 뒤)의 인용 줄은 붙일 조가 없어 버려지므로 예전처럼 조 머리로 둔다
    const a: RegExpExecArray | null = isArtHead(line) || (!cur && ART_RE.test(line)) ? ART_RE.exec(line) : null;
    if (a) {
      cur = { no: Number(a[1]), sub: a[2] ? Number(a[2]) : undefined, title: sq(a[3]), head: line.slice(0, line.length - a[4].length).trim(), paras: [], prefix };
      para = null;
      item = null;
      out.push(cur);
      if (a[4].trim()) addText(a[4]);
      prevRaw = raw;
      continue;
    }
    addText(line);
    prevRaw = raw;
  }
  return out;
}

function loc(a: Article, p?: Para, i?: Item): string {
  let s = `${a.prefix}제${a.no}조${a.sub ? `의${a.sub}` : ''}`;
  if (p && p.no) s += `제${p.no}항`;
  if (i) s += `제${i.no}호`;
  return s;
}
const paraAll = (p: Para) => [p.text, ...p.items.map((i) => i.text)].join(' ');
const artAll = (a: Article) => a.paras.map(paraAll).join(' ');

// ── 점검 ─────────────────────────────────────────

/** 법 제20조제1항 17개 호를 알아보는 낱말(공백 없앤 글). COUNCIL_TOPICS 와 같은 순서 */
const TOPIC_KEYS: RegExp[] = [
  /생산성향상/, /채용/, /고충처리/, /작업환경/, /노무관리/, /고용조정/, /휴게/, /지불방법/, /신기계/, /작업수칙/,
  /재산형성/, /발명/, /복지증진/, /감시/, /모성보호/, /성희롱/, /노사협조/,
];

const WEEKDAY_FIXED = /(제?\d+|첫째|둘째|셋째|넷째|다섯째|마지막)(주|번째)?(월|화|수|목|금|토|일)요일/;
const RECOMMEND_RE = /\d+(인|명)이상의?추천/;

export interface RulesCheckInput {
  text: string;
  /** 사업장명 — 비우면 본문의 「사업장명 :」 줄에서 찾는다. 별지 서식에 남은 다른 회사 이름을 찾을 때 쓴다 */
  workplaceName?: string;
}

const coreName = (s: string) => sq(s).replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '');

/** 규정 글을 표지·본문·부칙·별지로 나눈 것(줄 단위, 글자 그대로) */
export interface RulesParts {
  /** 첫 장·조 머리 앞 줄(표지) */
  cover: string[];
  /** 본문 줄(표지 포함) */
  body: string[];
  /** 첫 부칙 머리 줄 번호(없으면 -1) */
  addIdx: number;
  /** 부칙 머리 다음 줄부터 별지 앞까지 — 부칙이 여럿이면 뒤 부칙의 머리 줄도 들어 있다 */
  addLines: string[];
  /** 부칙마다 머리 줄과 그 아래 줄 */
  addenda: { head: string; lines: string[] }[];
  /** 별지 서식 줄 */
  tail: string[];
}

/** 표지·본문·부칙·별지 나누기 — 점검(checkCouncilRules)과 신·구조문대비표(rules-compare.ts)가 같이 쓴다. 글자는 바꾸지 않는다 */
export function splitRules(lines: string[]): RulesParts {
  const addIdx = lines.findIndex(isAddendumHead);
  const bodyLines = addIdx >= 0 ? lines.slice(0, addIdx) : lines;
  const restLines = addIdx >= 0 ? lines.slice(addIdx + 1) : [];
  const tailIdx = restLines.findIndex(isFormsHead);
  const addLines = tailIdx >= 0 ? restLines.slice(0, tailIdx) : restLines;
  const tailLines = tailIdx >= 0 ? restLines.slice(tailIdx) : [];
  // 부칙이 없으면 본문 뒤 별지도 찾는다
  let body = bodyLines;
  let tail = tailLines;
  if (addIdx < 0) {
    const t = bodyLines.findIndex((l, i) => i > 0 && isFormsHead(l) && bodyLines.slice(0, i).some((x) => isArtHead(x.trim())));
    if (t >= 0) {
      body = bodyLines.slice(0, t);
      tail = bodyLines.slice(t);
    }
  }
  const first = body.findIndex((l) => isArtHead(l.trim()) || CHAPTER_RE.test(l.trim()));
  const addenda: RulesParts['addenda'] = [];
  if (addIdx >= 0) {
    addenda.push({ head: lines[addIdx].trim(), lines: [] });
    for (const l of addLines) {
      if (isAddendumHead(l)) addenda.push({ head: l.trim(), lines: [] });
      else addenda[addenda.length - 1].lines.push(l);
    }
  }
  return { cover: first >= 0 ? body.slice(0, first) : [], body, addIdx, addLines, addenda, tail };
}

export function checkCouncilRules(input: RulesCheckInput): RulesCheck {
  const lines = normalize(input.text).split('\n');
  const { body, addIdx, addLines, tail } = splitRules(lines);
  const arts = parseArticles(body, '');
  const addArts = parseArticles(addLines, '부칙 ');
  const addText = addLines.join('\n');
  const tailText = tail.join('\n');
  const allArts = [...arts, ...addArts];

  const findings: RulesFinding[] = [];
  const push = (f: RulesFinding) => findings.push(f);

  // 사업장명
  const nameLine = lines.map((l) => /사업장명\s*[:：]\s*(\S.*)$/.exec(l.trim())).find(Boolean);
  const workplaceName = (input.workplaceName ?? '').trim() || (nameLine ? nameLine[1].trim() : '') || undefined;

  // 1·2. 근로자위원 직접선거 · 위원선거인 간접선거 — 법 제6조제2항
  const electionParas: { a: Article; p: Para }[] = [];
  for (const a of arts) for (const p of a.paras) {
    const s = sq(paraAll(p));
    if (/직접/.test(s) && /비밀/.test(s) && /무기명/.test(s)) electionParas.push({ a, p });
  }
  for (const { a, p } of electionParas) {
    const s = sq(paraAll(p));
    if (/위원선거인/.test(s)) {
      const miss: string[] = [];
      if (!/근로자(의)?과반수가?참여/.test(s)) miss.push('위원선거인을 근로자 과반수가 참여한 투표로 뽑는다');
      if (!/위원선거인(의)?과반수가?참여/.test(s)) miss.push('근로자위원을 위원선거인 과반수가 참여한 투표로 뽑는다');
      if (miss.length) {
        push({
          grade: '필수', id: 'indirect-majority', regulation: loc(a, p), law: '법 제6조제2항 단서',
          issue: `위원선거인 간접선출 조항에 법이 정한 참여 요건이 빠져 있습니다: ${miss.join(' / ')}. 두 단계 모두 과반수 「참여」(투표율) 요건입니다.`,
          change: '부서별로 근로자 수에 비례하여 위원선거인을 근로자 과반수가 참여한 직접·비밀·무기명 투표로 선출하고, 위원선거인 과반수가 참여한 직접·비밀·무기명 투표로 근로자위원을 선출할 수 있다.',
          current: clip(paraAll(p)),
        });
      }
    } else if (!/과반수가?참여/.test(s)) {
      push({
        grade: '필수', id: 'direct-majority', regulation: loc(a, p), law: '법 제6조제2항 본문',
        issue: '근로자위원 직접선거 조항에 「근로자 과반수가 참여하여」 요건이 없습니다. 법은 근로자 과반수가 투표에 참여해야 선출이 성립하도록 정합니다(찬성률이 아니라 투표 참여율).',
        change: '근로자위원은 근로자 과반수가 참여하여 직접·비밀·무기명 투표로 선출한다.',
        current: clip(paraAll(p)),
      });
    }
  }

  // 3. 입후보 추천 요건 — 시행령 제3조(2022. 11. 8. 개정으로 추천 요건 삭제). 매뉴얼 예시 제16조제1항도 추천을 두므로 선택
  for (const a of allArts) for (const p of a.paras) {
    if (RECOMMEND_RE.test(sq(paraAll(p)))) {
      push({
        grade: '선택', id: 'nomination-requirement', regulation: loc(a, p), law: '시행령 제3조',
        issue: '입후보에 근로자 일정 수 이상의 추천을 요구합니다. 시행령 제3조의 추천 요건은 2022. 11. 8. 개정(2022. 12. 11. 시행)으로 삭제되어, 현행 시행령은 입후보 자격(해당 사업이나 사업장의 근로자)만 정합니다. '
          + '고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.) 예시 규정 제16조제1항도 근로자 10명 이상의 추천을 두고, 주석에 「근로자참여법 개정으로 근로자 10명 이상 추천요건은 삭제되었으나 협의회규정으로 달리 정할 수 있음」이라 적습니다(매뉴얼 159쪽).',
        change: '추천 인원을 그대로 둘지, 줄이거나 없앨지는 노사가 협의회에서 정한다. 없애려면 「근로자위원으로 입후보하려는 사람은 해당 사업 또는 사업장의 근로자여야 한다.」로 쓴다.',
        current: clip(paraAll(p)),
      });
    }
  }

  // 3-1. 결원 충원을 「위촉」만으로 — 시행령 제4조(30일 이내에 보궐위원을 위촉하거나 선출). 선거로 뽑힌 근로자위원은 위촉만으로 채울 수 없다
  for (const a of arts) for (const p of a.paras) {
    const s = sq(p.text);
    if (/결원/.test(s) && /30일이내/.test(s) && /위촉/.test(s) && !/선출/.test(s) && !/사용자위원/.test(s) && !/노동조합/.test(s)) {
      push({
        grade: '필수', id: 'vacancy-fill', regulation: loc(a, p), law: '시행령 제4조',
        issue: '위원 결원을 「위촉」으로만 채우도록 정했습니다. 시행령 제4조는 결원이 생기면 30일 이내에 보궐위원을 「위촉하거나 선출」하도록 정합니다. 투표로 뽑힌 근로자위원의 결원은 위촉만으로 채울 수 없습니다.',
        change: '…30일 이내에 위촉하거나 선출한다.',
        current: clip(paraAll(p)),
      });
    }
  }

  // 4. 차점자 충원 — 시행령 제4조(과반수 노동조합이 없는 곳만)
  for (const a of arts) for (const p of a.paras) {
    const s = sq(paraAll(p));
    if (/차점자/.test(s) && !/노동조합/.test(s)) {
      push({
        grade: '필수', id: 'runner-up', regulation: loc(a, p), law: '시행령 제4조',
        issue: '차점자를 근로자위원으로 하는 조항에 「근로자 과반수로 구성된 노동조합이 조직되어 있지 아니한」 조건이 없습니다.',
        change: '근로자 과반수로 조직된 노동조합이 없는 동안에는 근로자위원 선출 투표에서 선출되지 못한 사람 중 득표 순에 따른 차점자를 근로자위원으로 할 수 있다.',
        current: clip(paraAll(p)),
      });
    }
  }

  // 5. 근로자위원 불이익 처분 금지 — 법 제9조제2항(견본 R2). 법이 바로 적용되므로 권장
  const hasDisadvantage = arts.some((a) => a.paras.some((p) => /근로자위원/.test(sq(p.text)) && /불이익/.test(sq(p.text))));
  if (arts.length && !hasDisadvantage) {
    push({
      grade: '권장', id: 'disadvantage', regulation: '위원의 신분 조항', law: '법 제9조제2항',
      issue: '근로자위원에 대한 불이익 처분 금지 조항이 없습니다. 법이 바로 적용되지만 규정에 적어 두면 위원과 근로자가 알기 쉽습니다.',
      change: '사용자는 협의회 위원으로서의 직무 수행과 관련하여 근로자위원에게 불이익을 주는 처분을 하여서는 아니 된다.',
    });
  }

  // 6. 협의사항 17개 호 — 법 제20조제1항
  const topicArt = arts.find((a) => /협의사항/.test(a.title)) ?? arts.find((a) => a.paras.some((p) => p.items.length >= 10 && /협의/.test(sq(p.text))));
  if (topicArt) {
    const p = topicArt.paras.find((x) => x.items.length >= 5) ?? topicArt.paras[0];
    const items = p?.items ?? [];
    const joined = sq(items.map((i) => i.text).join(' '));
    const missing = TOPIC_KEYS.map((re, i) => (re.test(joined) ? null : i)).filter((x): x is number => x != null);
    if (missing.length) {
      push({
        grade: '필수', id: 'topics', regulation: loc(topicArt, p), law: `법 제20조제1항${missing.map((i) => `제${i + 1}호`).join('·')}`,
        issue: `협의사항이 ${items.length}개 호입니다. 법은 17개 호를 정하며 다음 호가 없습니다: ${missing.map((i) => `${i + 1}호 「${COUNCIL_TOPICS[i]}」`).join(', ')}.`
          + (missing.includes(15) ? ' 16호(성희롱 예방)는 2022. 6. 10. 개정 법률(2022. 12. 11. 시행)로 신설된 호입니다.' : ''),
        change: missing.includes(15)
          ? '「16. 「남녀고용평등과 일·가정 양립 지원에 관한 법률」 제2조제2호에 따른 직장 내 성희롱 및 고객 등에 의한 성희롱 예방에 관한 사항」을 넣고 「그 밖의 노사협조에 관한 사항」을 17호로 옮긴다.'
          : `빠진 호를 법 제20조제1항 순서대로 넣는다.`,
        current: `${items.length}개 호`,
      });
    }
    const typo = items.find((i) => /직무발령/.test(sq(i.text)));
    if (typo) {
      push({
        grade: '필수', id: 'topic-12-invention', regulation: loc(topicArt, p, typo), law: '법 제20조제1항제12호',
        issue: '12호가 「직무발령」으로 적혀 있습니다. 법은 「직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항」입니다.',
        change: '직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항',
        current: clip(typo.text),
      });
    }
  } else if (arts.length) {
    push({
      grade: '권장', id: 'topics-absent', regulation: '협의사항 조항', law: '법 제20조제1항',
      issue: '협의사항(법 제20조제1항 17개 호)을 적은 조항을 찾지 못했습니다.',
      change: '법 제20조제1항 17개 호를 그대로 적은 협의사항 조항을 둔다.',
    });
  }

  // 7. 임의 중재 — 법 제25조제1항
  const arbArt = arts.find((a) => /중재/.test(a.title));
  if (arbArt) {
    const p = arbArt.paras.find((x) => x.items.length) ?? arbArt.paras[0];
    for (const it of p?.items ?? []) {
      const s = sq(it.text);
      if (/(기타|그밖에|그밖의)/.test(s) && /중재/.test(s) && /필요/.test(s)) {
        push({
          grade: '선택', id: 'arbitration-other', regulation: loc(arbArt, p, it), law: '법 제25조제1항',
          issue: '임의 중재 대상에 「그 밖에 중재가 필요한 경우」가 있습니다. 법 제25조제1항은 ① 법 제21조 의결사항을 의결하지 못한 경우 ② 의결된 사항의 해석·이행 방법에 의견이 일치하지 않는 경우 두 가지를 정하나, '
            + '추가 사유도 같은 항 본문의 근로자위원·사용자위원 합의를 전제로 합니다. 매뉴얼 예시 규정 제31조제2항제3호(노사가 공동으로 신청한 경우, 매뉴얼 162쪽)도 같은 방식입니다.',
          change: '두거나 고칠지는 노사가 협의회에서 정한다. 예시 규정처럼 쓰려면 「노사가 공동으로 중재를 신청한 경우」로 쓴다.',
          current: clip(it.text),
        });
      }
    }
    const first = p?.items[0];
    if (first) {
      const s = sq(first.text);
      const ref = /제(\d+)조/.exec(s);
      const target = ref ? arts.find((a) => a.no === Number(ref[1])) : undefined;
      const aboutTopics = (target && /협의/.test(target.title) && !/의결/.test(target.title)) || (!ref && /협의사항/.test(s) && !/의결사항/.test(s));
      if (aboutTopics) {
        push({
          grade: '필수', id: 'arbitration-target', regulation: loc(arbArt, p, first), law: '법 제25조제1항제1호',
          issue: '임의 중재 대상이 협의사항을 가리킵니다. 법은 「제21조에 따른 의결 사항에 관하여 협의회가 의결하지 못한 경우」로 정합니다.',
          change: '의결사항 조항(법 제21조)에 관하여 협의회가 의결하지 못한 경우',
          current: clip(first.text),
        });
      }
    }
  }

  // 8. 고충처리위원 — 법 제27조제1항(3명 이내, 협의회가 위원 중 선임) · 제28조제1항(청취한 날부터 10일)
  for (const a of arts) for (const p of a.paras) {
    const s = sq(paraAll(p));
    if (!/고충처리위원/.test(s)) continue;
    const within = /(\d+)(인|명)이내/.exec(s);
    if (within && Number(within[1]) > 3) {
      push({
        grade: '필수', id: 'grievance-members', regulation: loc(a, p), law: '법 제27조제1항',
        issue: `고충처리위원을 ${within[1]}명 이내로 정했습니다. 법은 노사를 대표하는 3명 이내입니다.`,
        change: '고충처리위원은 노사를 대표하는 3명 이내의 위원으로 구성하되, 협의회가 그 위원 중에서 선임한다.',
        current: clip(paraAll(p)),
      });
    }
    if (/10일/.test(s) && /접수/.test(s) && !/청취/.test(s)) {
      push({
        grade: '필수', id: 'grievance-start', regulation: loc(a, p), law: '법 제28조제1항',
        issue: '고충 처리결과 통보 10일을 「접수」부터 셉니다. 법은 근로자로부터 고충사항을 「청취한」 날부터 10일입니다.',
        change: '고충처리위원은 고충사항을 청취한 날부터 10일 이내에 조치 사항과 그 밖의 처리결과를 해당 근로자에게 알린다.',
        current: clip(paraAll(p)),
      });
    }
  }

  // 9. 정족수 — 법 제15조
  const quorumArt = arts.find((a) => /정족수/.test(a.title));
  if (quorumArt) {
    const s = sq(artAll(quorumArt));
    if (!/각과반수/.test(s) || !/3분의2/.test(s)) {
      push({
        grade: '필수', id: 'quorum', regulation: loc(quorumArt), law: '법 제15조',
        issue: '정족수가 법과 다릅니다. 법은 근로자위원과 사용자위원 각 과반수의 출석으로 회의를 열고 출석위원 3분의 2 이상의 찬성으로 의결합니다.',
        change: '회의는 근로자위원과 사용자위원 각 과반수의 출석으로 열고, 출석위원 3분의 2 이상의 찬성으로 의결한다.',
        current: clip(artAll(quorumArt)),
      });
    }
  }

  // 10. 정기회의 — 법 제12조제1항(3개월마다) · 고정 회의일은 권장
  const meetingArt = arts.find((a) => /^(정기)?회의$|^회의의?개최|^정기회의/.test(a.title)) ?? arts.find((a) => /정기회의/.test(sq(artAll(a))) && /회의/.test(a.title));
  if (meetingArt) {
    const p = meetingArt.paras[0];
    const s = sq(p ? p.text : '');
    if (!/3개월|분기/.test(sq(artAll(meetingArt)))) {
      push({
        grade: '필수', id: 'regular-interval', regulation: loc(meetingArt, p), law: '법 제12조제1항',
        issue: '정기회의 주기가 3개월마다로 정해져 있지 않습니다.',
        change: '협의회는 3개월마다 정기회의를 연다.',
        current: clip(artAll(meetingArt)),
      });
    } else if (WEEKDAY_FIXED.test(s)) {
      push({
        grade: '선택', id: 'regular-fixed-date', regulation: loc(meetingArt, p), law: '법 제12조제1항',
        issue: '정기회의 날짜를 특정 요일로 고정해 두었습니다. 법은 3개월마다 정기회의를 열도록 할 뿐 날짜를 정하지 않습니다. 매뉴얼 예시 규정 제19조제1항도 「매분기 말월 첫째주」로 고정합니다(매뉴얼 160쪽). 고정일과 실제 회의일이 다르면 규정과 운영이 어긋나 보입니다.',
        change: '날짜를 그대로 둘지 바꿀지는 노사가 협의회에서 정한다. 고정하지 않으려면 「협의회는 3개월마다 정기회의를 열며, 개최일은 협의회가 정한다.」로 쓴다.',
        current: clip(p.text),
      });
    }
  }

  // 11. 오기
  for (const a of allArts) for (const p of a.paras) {
    if (/보권위원/.test(sq(paraAll(p)))) {
      push({
        grade: '권장', id: 'typo-vacancy', regulation: loc(a, p), law: '시행령 제4조',
        issue: '「보권위원」은 「보궐위원」의 오기입니다.',
        change: '보궐위원',
        current: clip(paraAll(p)),
      });
    }
  }

  // 12. 부칙 시행일
  if (addIdx < 0) {
    if (arts.length) push({ grade: '권장', id: 'addendum-absent', regulation: '부칙', law: '시행령 제5조제2항', issue: '부칙(시행일)을 찾지 못했습니다.', change: '부칙에 협의회에서 의결한 제정·개정 일자와 시행일을 적는다.' });
  } else {
    const effLine = addLines.find((l) => /시행/.test(l) && /규정/.test(l)) ?? '';
    const s = sq(effLine);
    if (!effLine || /○|년월일|\d{4}년\d{1,2}월일|\d{4}\.\d{1,2}\.\./.test(s) || !/\d{4}/.test(s) && !/의결한날/.test(s)) {
      push({
        grade: '권장', id: 'addendum-date', regulation: '부칙', law: '시행령 제5조제2항',
        issue: effLine ? '부칙의 시행일이 비어 있거나 날짜가 덜 적혀 있습니다.' : '부칙에 시행일 문장이 없습니다.',
        change: '제정·개정 일자를 확인해 적는다(예: 이 규정은 협의회에서 의결한 날부터 시행한다).',
        ...(effLine ? { current: clip(effLine) } : {}),
      });
    }
  }

  // 13. 제출 15일·의결 — 법 제18조제1항 · 시행령 제5조제2항
  const fullSq = sq([...body, ...addLines].join(' '));
  if (arts.length && !(/15일이내/.test(fullSq) && /제출/.test(fullSq))) {
    push({
      grade: '권장', id: 'report-15days', regulation: '보칙 또는 부칙', law: '법 제18조제1항',
      issue: '협의회규정을 설치한 날(변경한 경우 변경한 날)부터 15일 이내에 제출하는 조항이 없습니다. 제출 의무는 법이 바로 정합니다(미제출 과태료 법 제33조제1항).',
      change: '사용자는 협의회를 설치한 날부터 15일 이내에 이 규정을 관할 지방고용노동관서에 제출한다. 규정을 변경한 경우에도 같다.',
    });
  }
  if (arts.length && !/(제정|변경)[^。.]{0,30}협의회의?의결/.test(fullSq) && !/협의회의?의결을거쳐(제정|변경)/.test(fullSq)) {
    push({
      grade: '권장', id: 'amend-resolution', regulation: '보칙 또는 부칙', law: '시행령 제5조제2항',
      issue: '규정을 제정·변경할 때 협의회 의결을 거친다는 조항이 없습니다.',
      change: '이 규정을 제정하거나 변경할 때에는 협의회의 의결을 거친다.',
    });
  }

  // 14. 시행령 제5조제1항 필수 기재사항 7개
  const firstWhere = (pred: (s: string) => boolean): string | undefined => {
    for (const a of arts) for (const p of a.paras) if (pred(sq(paraAll(p)))) return loc(a, p);
    return undefined;
  };
  const unionAppoint = (s: string) => /대표자와그노동조합이위촉/.test(s);
  const hasElection = electionParas.length > 0;
  const finders: ((s: string) => boolean)[] = [
    (s) => /각(\d+|○+)(인|명)/.test(s) && /위원/.test(s),
    (s) => (hasElection && /(입후보|후보등록|후보자등록|후보)/.test(s)) || unionAppoint(s),
    (s) => /사용자위원/.test(s) && /대표(자|이사).{0,20}위촉/.test(s),
    (s) => /(근로한것으로본다|근로한시간으로본다)/.test(s) && /출석/.test(s),
    (s) => /소집/.test(s),
    (s) => /중재/.test(s),
    (s) => /고충처리위원/.test(s) && /((\d+|○+)(인|명)(\(\d명)?이내|(\d+|○+)(인|명))/.test(s),
  ];
  const requiredItems: RequiredItem[] = REGULATION_REQUIRED.map((item, i) => {
    let where = firstWhere(finders[i]);
    // 2호는 선출 조항 + 후보 등록 조항이 따로 있을 수 있다
    if (i === 1 && !where && hasElection && firstWhere((s) => /(입후보|후보)/.test(s))) where = firstWhere((s) => /(입후보|후보)/.test(s));
    if (i === 4 && where && !firstWhere((s) => /정기회의|분기|3개월|회의는/.test(s))) where = undefined;
    if (i === 6 && where && !firstWhere((s) => /고충/.test(s) && /(청취|처리결과|통보|알린)/.test(s))) where = undefined;
    return { no: i + 1, item, found: !!where, ...(where ? { where } : {}) };
  });
  for (const r of requiredItems) {
    if (!r.found && arts.length) {
      push({
        grade: '필수', id: `required-${r.no}`, regulation: '규정 전체', law: `시행령 제5조제1항제${r.no}호`,
        issue: `협의회규정에 반드시 들어가야 하는 「${r.item}」을(를) 찾지 못했습니다.`,
        change: '견본 해당 조항을 참고해 사업장에 맞는 조항을 넣는다.',
      });
    }
  }
  // 위원 수 범위 — 법 제6조제1항
  const compArt = arts.find((a) => /구성/.test(a.title) && a.paras.some((p) => /각(\d+)(인|명)/.test(sq(p.text))));
  if (compArt) {
    const p = compArt.paras.find((x) => /각(\d+)(인|명)/.test(sq(x.text)))!;
    const n = Number(/각(\d+)(인|명)/.exec(sq(p.text))![1]);
    if (n < 3 || n > 10) {
      push({
        grade: '필수', id: 'members-range', regulation: loc(compArt, p), law: '법 제6조제1항',
        issue: `위원 수를 노사 각 ${n}명으로 정했습니다. 법은 각 3명 이상 10명 이하입니다.`,
        change: '근로자위원과 사용자위원 각 3명 이상 10명 이하로 정한다.',
        current: clip(p.text),
      });
    }
  }

  // 15. 별지 서식 — 다른 회사 이름 · 삭제된 추천 요건 · 근거 조문 번호
  if (tail.length) {
    const own = workplaceName ? coreName(workplaceName) : '';
    const others = new Set<string>();
    for (const m of tailText.matchAll(/현재\s*([^\s,.:]+?)\s*에\s*근무/g)) {
      const c = coreName(m[1]);
      if (own && c && !own.includes(c) && !c.includes(own)) others.add(m[1]);
    }
    if (others.size) {
      push({
        grade: '권장', id: 'forms-other-name', regulation: '별지 서식', law: '시행령 제3조',
        issue: `별지 서식에 이 사업장(${workplaceName})이 아닌 이름이 남아 있습니다: ${[...others].map((x) => `「${x}」`).join(', ')}. 다른 회사 서식을 옮겨 오며 남은 글자로 보입니다.`,
        change: '사업장명으로 고친다.',
      });
    }
    const recLine = tail.find((l) => RECOMMEND_RE.test(sq(l)));
    if (recLine) {
      push({
        grade: '선택', id: 'forms-nomination', regulation: '별지 서식', law: '시행령 제3조',
        issue: '별지 서식(선거 공고·회의록 예시 등)에 입후보 추천 인원이 적혀 있습니다. 시행령 제3조의 추천 요건은 2022. 11. 8. 개정으로 삭제되었으나, 매뉴얼 예시 규정 제16조제1항처럼 협의회규정으로 추천을 둘 수 있습니다(매뉴얼 159쪽).',
        change: '본문의 입후보 조항과 같게 맞춘다. 추천을 두면 서식의 인원을 본문과 같게, 없애면 추천 문구와 추천서 서식을 함께 뺀다.',
        current: clip(recLine),
      });
    }
    // 선거 공고의 당선 요건 — 법 제6조제2항(근로자 과반수가 참여한 투표). 다수득표만으로 당선을 정하면 필수
    const winLine = tail.find((l) => { const s = sq(l); return /당선/.test(s) && /다수득표/.test(s) && !/과반수가?참여/.test(s); });
    if (winLine) {
      push({
        grade: '필수', id: 'forms-election-majority', regulation: '별지 서식(선거 공고)', law: '법 제6조제2항',
        issue: '선거 공고의 당선 요건이 근로자 과반수 참여 요건 없이 다수득표만으로 당선을 정합니다. 법은 근로자위원을 근로자 과반수가 참여한 직접·비밀·무기명 투표로 선출하도록 정합니다. 과반수 노동조합이 있어 지금 쓰지 않는 서식이라도, 노동조합이 과반수 지위를 잃으면 이 서식으로 선거합니다.',
        change: '「당선 요건 : 근로자 과반수가 참여한 직접·비밀·무기명 투표에서 다수득표자 순으로 당선자를 정한다」로 고친다(득표수가 같을 때의 기준은 그대로 둘 수 있다).',
        current: clip(winLine),
      });
    }
    for (const l of tail) {
      const s = sq(l);
      if (/제6조제3항/.test(s) && /사용자위원/.test(s)) {
        push({
          grade: '권장', id: 'forms-basis-employer', regulation: '별지 서식(위촉장)', law: '법 제6조제4항',
          issue: '사용자위원 위촉 근거를 법 제6조제3항으로 적었습니다. 제6조제3항은 과반수 노동조합의 근로자위원 위촉 조항이고, 사용자위원은 제6조제4항입니다.',
          change: '「법 제6조제4항에 따라」',
          current: clip(l),
        });
      }
      if (/제26조제1항/.test(s) && /고충처리위원/.test(s)) {
        push({
          grade: '권장', id: 'forms-basis-grievance', regulation: '별지 서식(위촉장)', law: '법 제27조제1항',
          issue: '고충처리위원 근거를 법 제26조제1항으로 적었습니다. 제26조는 항이 나뉘지 않는 설치 조문이고, 협의회가 있는 곳의 선임 근거는 제27조제1항입니다.',
          change: '「법 제27조제1항에 따라」',
          current: clip(l),
        });
      }
    }
  }

  findings.sort((x, y) => RULES_GRADES.indexOf(x.grade) - RULES_GRADES.indexOf(y.grade));
  return {
    findings,
    counts: { 필수: findings.filter((f) => f.grade === '필수').length, 권장: findings.filter((f) => f.grade === '권장').length, 선택: findings.filter((f) => f.grade === '선택').length },
    requiredItems,
    parsed: { articles: arts.length, addendum: addIdx >= 0, formsTail: tail.length > 0, ...(workplaceName ? { workplaceName } : {}) },
  };
}
