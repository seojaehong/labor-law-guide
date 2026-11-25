// 양정 사례(법원 판결 발췌) 붙여넣기 형식 4종 — 의견서 블록 · md · jsonl · AI 붙여넣기.
// 정본 = 태광 의견서 [관련 판결] 블록: 머리줄 + 판결 원문 판단 문단을 문장 통째로(인용부호·칸 이름 없음, 문장 중간 생략 없음).
// ★ quote·evidence 는 판결 원문이다 — 한 글자도 바꾸지 않고, 자르지도 않는다. 10줄(FIT 자)을 넘으면 블록에서 빼고 목록으로 알린다.
// ★ generated_note 는 모델 메모 — 원문 칸과 이름을 가르고 「AI 정리 · 원문 아님」으로 표시한다.
// ★ 이 파일이 쓰는 안내 문구에는 공개 금지어(src/lib/tool-kit/banned.ts)를 쓰지 않는다. 그래서 「양정 판단」이라 쓴다.

export const FIT = 450;

export const TYPE_LABEL = {
  sexual: '성비위', harass: '괴롭힘·폭언', attend: '근태',
  secret: '비밀유지·보안', fraud: '부정수령', embezzle: '횡령·배임·사적 유용',
  neglect: '근무태만·업무상 과실', drunk: '음주운전', dignity: '품위유지',
};

/** '2099-01-09' → '2099. 1. 9.' */
export function fmtDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : '';
}

/** 머리줄 — 처분명은 괄호로 붙인다(261122 결정: 블록 본문에 처분명이 없는 판결이 많다. 정본이 심급을 머리줄 괄호로 다는 자리와 같다) */
export function blockHeader(r) {
  const d = fmtDate(r.decided_on);
  return `[관련 판결] ${r.court} ${d ? `${d} 선고 ` : ''}${r.case_number} 판결${r.disposition ? `(${r.disposition})` : ''}`;
}

const fits = (r) => r.quote_fits !== false && (r.quote?.length ?? 0) <= FIT;

/**
 * 의견서 블록.
 * - 검수 블록(block_status 칸이 있는 행): 통과(pass)면 block_body 를 그대로 싣고, 아니면 빼서 목록으로 알린다.
 * - 검수 전 행: 발췌(quote)가 10줄 안이면 싣는다. withEvidence 면 ❶ 사유 근거 ❷ 양정 발췌.
 */
export function toBlocks(rows, { withEvidence = false } = {}) {
  const blocks = [];
  const overLength = [];
  for (const r of rows) {
    if ('block_status' in r) {
      if (r.block_status === 'pass' && r.block_body) blocks.push(`${blockHeader(r)}\n${r.block_body}`);
      else overLength.push(`${r.court} ${r.case_number}`);
      continue;
    }
    if (!fits(r)) { overLength.push(`${r.court} ${r.case_number}`); continue; }
    const ev = withEvidence && r.evidence && r.evidence.length <= FIT ? r.evidence : null;
    blocks.push(ev ? `${blockHeader(r)}\n❶ ${ev}\n❷ ${r.quote}` : `${blockHeader(r)}\n${r.quote}`);
  }
  return { text: blocks.join('\n\n'), overLength };
}

function facts(r) {
  return [
    `유형 ${TYPE_LABEL[r.type] ?? r.type}${r.kind ? `(${r.kind})` : ''}`,
    r.disposition ? `처분 ${r.disposition}` : null,
    r.reason ? `사유 ${r.reason}` : null,
    r.sanction ? `양정 판단 ${r.sanction}` : null,
  ].filter(Boolean).join(' · ');
}

const vetted = (r) => r.block_status === 'pass' && r.block_body;
/** 원문 칸 — 검수 블록이 있으면 그것, 긴 판단이면 판단 원문 전체(261123), 없으면 발췌 */
const excerpt = (r) => (vetted(r) ? r.block_body : r.block_status === 'long_judgment' && r.long_text ? r.long_text : r.quote);

export function toMarkdown(rows) {
  const out = [];
  for (const r of rows) {
    out.push(`### ${r.court} ${r.case_number}`, '', facts(r), '');
    if (vetted(r)) out.push(blockHeader(r), r.block_body, '');
    else if (r.long_text) out.push('※ 양정 판단이 한 문장으로 길어 10줄 블록에 싣지 않았습니다. 판단 원문 전체:', '', blockHeader(r), r.long_text, '');
    else {
      out.push(blockHeader(r), r.quote, '');
      if (!fits(r)) out.push('※ 발췌가 10줄을 넘습니다. 문장 통째라 자르지 않았습니다.', '');
    }
    if (r.evidence && !vetted(r)) out.push('사유 근거(원문)', r.evidence, '');
    if (r.generated_note) out.push(`AI 정리 · 원문 아님: ${r.generated_note}`, '');
  }
  return out.join('\n').trimEnd() + '\n';
}

export function toJsonl(rows) {
  return rows.map((r) => JSON.stringify({
    court: r.court, case_number: r.case_number, decided_on: r.decided_on ?? null, type: r.type, kind: r.kind ?? null,
    disposition: r.disposition ?? null, sanction_level: r.sanction_level ?? null, reason: r.reason ?? null, sanction: r.sanction ?? null,
    block_status: r.block_status ?? null, block_body: vetted(r) ? r.block_body : null, long_text: r.long_text ?? null,
    quote: r.quote, quote_fits: fits(r), evidence: r.evidence ?? null, ai_note: r.generated_note ?? null,
  })).join('\n') + '\n';
}

/** 사용자가 자기 AI 대화창에 붙여 넣는 묶음 — 발췌를 바꾸지 말라는 지시 + 원문/정리 구분 태그 */
export function toAiPaste(rows, { purpose = '' } = {}) {
  const head = [
    '아래는 법원 판결의 징계 양정 판단 부분을 원문 그대로 옮긴 자료입니다.',
    '<발췌>와 <사유근거> 안의 문장은 판결 원문입니다. 인용할 때 글자를 바꾸지 말고 문장 통째로 쓰고, 문장 중간을 생략하지 마세요.',
    '<AI정리>는 원문이 아닌 메모입니다. 인용부호 안에 넣지 마세요.',
    '인용할 때 머리줄은 「[관련 판결] 법원 선고일 사건번호 판결」 꼴로 쓰고, 그 아래에 발췌를 인용부호 없이 붙입니다.',
    purpose ? `쓰려는 곳: ${purpose}` : null,
  ].filter(Boolean).join('\n');
  const body = rows.map((r) => [
    `<판결 법원="${r.court}" 사건번호="${r.case_number}" 선고일="${fmtDate(r.decided_on)}">`,
    facts(r),
    `<발췌>${excerpt(r)}</발췌>`,
    r.evidence && !vetted(r) ? `<사유근거>${r.evidence}</사유근거>` : null,
    r.generated_note ? `<AI정리>${r.generated_note}</AI정리>` : null,
    '</판결>',
  ].filter(Boolean).join('\n'));
  return `${head}\n\n${body.join('\n\n')}\n`;
}

export function formatRows(rows, format, opts = {}) {
  if (format === 'md') return toMarkdown(rows);
  if (format === 'jsonl') return toJsonl(rows);
  if (format === 'ai') return toAiPaste(rows, opts);
  const { text, overLength } = toBlocks(rows, opts);
  return overLength.length
    ? `${text}\n\n(10줄을 넘어 블록에서 뺀 판결: ${overLength.join(', ')} — format=md 로 보면 전문 발췌가 나옵니다)`
    : text;
}
