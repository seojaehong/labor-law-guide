// sanction 묶음 — 법원 판결의 징계 양정 판단 발췌(원문 그대로)를 의견서 블록·md·jsonl·AI 붙여넣기 꼴로 돌려준다.
// ★ 1차는 우리만 쓴다(261122) — 원격 라우트가 SANCTION_API_TOKEN 이 맞을 때만 이 묶음을 등록한다. REMOTE_TOOLS·npm stdio 판에는 넣지 않는다.
// ★ 조회는 주입받은 fetchCases 로만 한다 — 이 파일은 DB·네트워크를 직접 모른다(등록 함수에 I/O 없음).
// ★ 이 묶음이 쓰는 안내 문구에 공개 금지어(src/lib/tool-kit/banned.ts)를 쓰지 않는다. 판결 원문 칸은 고치지 않는다.
import { z } from 'zod';
import { formatRows, TYPE_LABEL } from '../lib/sanction-format.mjs';

export const sanctionTools = ['search_sanction_cases'];
export const SANCTION_LOADED = ['sexual', 'harass', 'attend'];

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const text = (t) => ({ content: [{ type: 'text', text: t }] });

export function registerSanction(server, { fetchCases }) {
  server.registerTool(
    'search_sanction_cases',
    {
      title: '징계 양정 판결 발췌 찾기',
      description:
        '법원 판결에서 징계 처분의 양정(수위)을 판단한 문단을 원문 그대로 찾아, 의견서에 붙이는 [관련 판결] 블록(10줄 이내)·md·jsonl·AI 붙여넣기 꼴로 돌려줍니다. '
        + `지금 수록 유형: ${SANCTION_LOADED.map((t) => `${t}(${TYPE_LABEL[t]})`).join(', ')}. `
        + '발췌는 판결 원문이라 글자를 바꾸지 마세요. 「양정 판단 적정」은 법원이 그 처분 수위를 유지한 것, 「과중」은 지나치게 무겁다고 본 것입니다.',
      inputSchema: {
        type: z.enum(Object.keys(TYPE_LABEL)).describe('비위 유형'),
        sanction: z.enum(['적정', '과중']).optional().describe('법원의 양정 판단'),
        disposition: z.string().max(30).optional().describe('처분 낱말(예: 해고, 정직, 감봉)'),
        keyword: z.string().max(40).optional().describe('발췌 안에 든 낱말'),
        limit: z.number().int().min(1).max(20).optional().describe('최대 건수(기본 8)'),
        with_evidence: z.boolean().optional().describe('사유 인정 근거 문장을 ❶로 함께 싣는다'),
        format: z.enum(['block', 'md', 'jsonl', 'ai']).optional().describe('block=의견서 블록(기본) · md · jsonl · ai=내 AI 대화창 붙여넣기'),
        purpose: z.string().max(200).optional().describe('format=ai 일 때 자료를 쓸 곳 한 줄'),
      },
      annotations: { title: '징계 양정 판결 발췌 찾기', ...READ_ONLY },
    },
    async (a) => {
      if (!SANCTION_LOADED.includes(a.type)) {
        return text(`${TYPE_LABEL[a.type]} 유형은 아직 수록 전입니다(수집 중). 지금 수록: ${SANCTION_LOADED.map((t) => TYPE_LABEL[t]).join(', ')}.`);
      }
      let rows;
      try {
        rows = await fetchCases({ type: a.type, sanction: a.sanction, disposition: a.disposition, keyword: a.keyword, fitsOnly: (a.format ?? 'block') === 'block', limit: a.limit ?? 8 });
      } catch {
        return { ...text('양정 사례를 읽지 못했습니다. 잠시 뒤 다시 불러 주세요.'), isError: true };
      }
      if (!rows.length) return text('조건에 맞는 판결이 이 자료 안에 없습니다. 조건을 줄여 보세요(0건은 「그런 판결이 없다」가 아니라 아직 수록되지 않았다는 뜻일 수 있습니다).');
      const head = `${TYPE_LABEL[a.type]} · ${rows.length}건${a.sanction ? ` · 양정 판단 ${a.sanction}` : ''}`;
      return text(`${head}\n\n${formatRows(rows, a.format ?? 'block', { withEvidence: a.with_evidence === true, purpose: a.purpose })}`);
    },
  );
}
