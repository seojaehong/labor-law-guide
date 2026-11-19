// 문서 묶음 — 마크다운 원고를 한글(hwpx) 파일로 만든다.
//   make_hwpx_from_markdown  md → hwpx(프리셋 internal·tribunal). 변환 규칙은 src/lib/md-hwpx
// ★ 파일을 읽고 쓰므로 원격판(remote.mjs)에서 불러오지 않는다. stdio 판(server.mjs)으로만 켠다.
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { mdHwpxSummary, mdToHwpx, parseMarkdown } from '@/lib/md-hwpx';
import { argsLookLikeRrn, looksLikeRrn, text } from '../lib/common.mjs';

export const docsTools = ['make_hwpx_from_markdown'];

const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 주민등록번호를 받지 않습니다.';
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
const MAX_FILE = 2 * 1024 * 1024;
// 원고 안의 16진 해시 조각(a-f 글자가 섞인 12자 이상)은 숫자 13자리가 이어져도 주민번호가 아니다 — 검사에서 뺀다(261119)
const HEX_TOKEN = /\b(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/gi;

export function registerDocs(server) {
  server.registerTool(
    'make_hwpx_from_markdown',
    {
      title: '마크다운을 한글(hwpx) 파일로 만들기(로컬 전용)',
      description:
        '마크다운 원고(의견서·답변서·검토 메모·양식집·보고서)를 한글 파일로 만든다. # ~ #### 제목(## 은 앞에 □, Ⅰ~Ⅹ 로 시작하면 쪽을 나눔), 본문 **굵게**, 판례 번호(「대법원 … 선고 … 판결」) 자동 굵게, 목록, 표(첫 행 = 머리행 음영·반복, 열 폭 자동, :---: 가운데·---: 오른쪽, 칸 안 <br> 줄바꿈, 7열 이상은 작은 글자, 긴 표는 쪽을 넘긴다), ' +
        '끝 15줄 안의 날짜만 있는 줄부터 서명부(오른쪽 정렬), 아래 가운데 쪽번호를 넣는다. 병합 칸·밑줄·인용 블록·링크는 만들지 못한다(결과 leftovers 에 남은 기호로 알린다). ' +
        'preset = internal(내부 문서: 행간 160%·여백 20mm) / tribunal(법원·위원회 제출: 행간 200%·위 45·아래 30·좌우 20mm). 기관 서식이 따로 있으면 그 서식을 따른다. 이미 있는 파일은 덮어쓰지 않는다.',
      inputSchema: {
        markdown: z.string().max(1_000_000).optional().describe('마크다운 원고(글). markdownFile 과 둘 중 하나'),
        markdownFile: z.string().max(400).optional().describe('마크다운 파일 경로(.md, UTF-8, 2MB 이하)'),
        preset: z.enum(['internal', 'tribunal']).describe('internal 내부 문서 / tribunal 법원·위원회 제출'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().max(120).optional().describe('파일 이름(확장자 빼고). 비우면 첫 # 제목, 그것도 없으면 md 파일 이름'),
        pageBreak: z.boolean().optional().describe('Ⅰ~Ⅹ 로 시작하는 ## 앞에서 쪽을 나눈다(기본 true)'),
        footer: z.boolean().optional().describe('아래 가운데 「- N -」 쪽번호(기본 true)'),
        features: z
          .object({
            indent: z.boolean().optional().describe('기호 문단 내어쓰기·공백 들여쓰기 없앰'),
            underline: z.boolean().optional().describe('문장 안 **강조** = 굵게+밑줄, <u> = 밑줄'),
            quote: z.boolean().optional().describe('> 인용 블록(휴먼고딕 11pt·180%)'),
            table: z
              .object({
                float: z.boolean().optional().describe('떠 있는 표(아래 여백 8.5mm)'),
                pageBreak: z.enum(['CELL', 'TABLE']).optional().describe('쪽 나눔 단위(기본 CELL)'),
                width: z.enum(['fit']).optional().describe('열 폭: 짧은 열 먼저·최장 낱말 하한·구분행 대시 비율'),
                style: z.enum(['threeLine']).optional().describe('삼선표'),
              })
              .optional(),
          })
          .optional()
          .describe('편집 기술 선택값(기본 모두 끔). 끄면 지금까지와 같은 파일이 나온다'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ ...a, markdown: '', outDir: '', markdownFile: '' })) return fail(RRN_STOP);
      let md = a.markdown ?? '';
      if (!md && a.markdownFile) {
        const p = String(a.markdownFile).trim();
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return fail(`파일이 없습니다: ${p}`);
        if (fs.statSync(p).size > MAX_FILE) return fail('2MB 를 넘는 파일은 받지 않습니다.');
        md = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
      }
      if (!md.trim()) return fail('markdown 이나 markdownFile 중 하나를 주세요.');
      if (looksLikeRrn(md.replace(HEX_TOKEN, ''))) return fail(RRN_STOP);
      const items = parseMarkdown(md, { pageBreak: a.pageBreak, features: a.features });
      const h1 = items.find((x) => x.kind === 'h1');
      const base = safeName(
        (a.fileBase ?? '').trim() || (h1 && 'text' in h1 ? h1.text : '') || (a.markdownFile ? path.basename(a.markdownFile, path.extname(a.markdownFile)) : '') || '문서',
      );
      const out = path.join(a.outDir, `${base}.hwpx`);
      if (fs.existsSync(out)) return fail('이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', { exists: out });
      const bytes = await mdToHwpx(md, { preset: a.preset, pageBreak: a.pageBreak, footer: a.footer, features: a.features });
      fs.mkdirSync(a.outDir, { recursive: true });
      fs.writeFileSync(out, bytes);
      const summary = mdHwpxSummary(items, a.features);
      return text({
        ok: true,
        file: { path: out, bytes: bytes.length },
        preset: a.preset,
        ...summary,
        notice:
          (summary.leftovers.length ? `옮기지 못한 마크다운 기호가 있습니다(${summary.leftovers.join(' ')}). 원고를 고치거나 한글에서 손봐 주세요. ` : '') +
          '쪽 나눔·표가 쪽에 걸치는 모양은 파일 안 글자로는 알 수 없습니다. 한글에서 열거나 PDF 로 바꿔 쪽마다 확인한 뒤 냅니다.',
      });
    },
  );
}
