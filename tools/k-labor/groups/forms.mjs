// 서식 묶음 — 모성보호·일가정 양립 서식(육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서, 육아휴직 허용·단기 육아휴직 시기변경 통지서).
// 사이트 /tools/hr-forms 와 같은 엔진(src/lib/hr-forms)을 그대로 불러온다 — 칸·검사·원고가 한 벌이다.
//   list_hr_forms · check_hr_form 은 읽기 전용이라 원격판에도 싣는다(formsRemoteSafe).
//   make_hr_form 은 이 PC 에 파일을 쓰므로 로컬 전용이다.
// ★ 주민등록번호를 받지 않는다(생년월일만). 도구 호출은 서로 상태를 나누지 않아 여러 건을 동시에 불러도 된다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { buildForm, catalog, findForm, FormError, review } from '@/lib/hr-forms';
import { text, writeNew } from '../lib/common.mjs';

export const formsTools = ['list_hr_forms', 'check_hr_form', 'make_hr_form'];
export const formsRemoteSafe = ['list_hr_forms', 'check_hr_form'];

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const SITE = 'https://yellowenvelope.kr/tools/hr-forms';
const IDS = catalog().map((f) => f.id);
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
const valuesSchema = z.record(z.string(), z.string().max(1000)).describe('칸 이름 → 값(문자열). 날짜는 YYYY-MM-DD. 칸 이름은 list_hr_forms 의 fields[].key');
const formIdSchema = z.enum(IDS).describe(`서식 id: ${IDS.join(' · ')}`);

export function registerForms(server) {
  server.registerTool(
    'list_hr_forms',
    {
      title: '모성보호·일가정 양립 서식 목록',
      description: '육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서와 육아휴직 허용·단기 육아휴직 시기변경 통지서의 칸(이름·종류·필수 여부·선택지)과 근거 조문을 돌려준다. 칸을 채우기 전에 먼저 부른다.',
      inputSchema: { formId: formIdSchema.optional().describe('하나만 볼 때') },
      annotations: READ_ONLY,
    },
    async ({ formId }) => {
      const all = catalog();
      return text({ ok: true, forms: formId ? all.filter((f) => f.id === formId) : all, site: SITE });
    },
  );

  server.registerTool(
    'check_hr_form',
    {
      title: '서식 칸 검사·조문 안내',
      description: '파일을 만들지 않고 칸을 검사한다. problems = 파일을 만들 수 없는 이유(빈 필수 칸·날짜 형식·주민등록번호 모양 등), notes = 근거 조문이 정한 신청 기한·기간과 대조한 안내(파일은 만들 수 있다), markdown = 들어갈 원고.',
      inputSchema: { formId: formIdSchema, values: valuesSchema },
      annotations: READ_ONLY,
    },
    async ({ formId, values }) => {
      const r = review(findForm(formId), values);
      return text({ ok: r.problems.length === 0, problems: r.problems, notes: r.notes, unknownKeys: r.unknown, markdown: r.md || undefined });
    },
  );

  server.registerTool(
    'make_hr_form',
    {
      title: '서식 한글(hwpx) 파일 만들기(로컬 전용)',
      description: '칸을 검사한 뒤 서식을 한글(hwpx) 파일로 저장한다. 이미 있는 파일은 덮어쓰지 않는다. 여러 사람·여러 서식은 이 도구를 건마다 부르면 된다(호출끼리 상태를 나누지 않는다).',
      inputSchema: {
        formId: formIdSchema,
        values: valuesSchema,
        outDir: z.string().max(400).describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().max(120).optional().describe('파일 이름(확장자 빼고). 비우면 「서식 제목_성명」'),
      },
      annotations: WRITES,
    },
    async ({ formId, values, outDir, fileBase }) => {
      let b;
      try {
        b = await buildForm(formId, values);
      } catch (e) {
        if (e instanceof FormError) return text({ ok: false, problems: e.problems });
        return text({ ok: false, error: String(e?.message || e) });
      }
      const who = (values.name || values.employee || '').trim();
      const base = safeName((fileBase ?? '').trim() || `${b.title}${who ? `_${who}` : ''}`);
      const out = path.join(outDir, `${base}.hwpx`);
      fs.mkdirSync(outDir, { recursive: true });
      if (!writeNew(out, b.hwpx)) return text({ ok: false, error: '이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', exists: out });
      return text({ ok: true, file: { path: out, bytes: b.hwpx.length }, title: b.title, notes: b.notes, unknownKeys: b.unknown, check: '내기 전에 한글에서 열어 칸을 확인하세요.' });
    },
  );
}
