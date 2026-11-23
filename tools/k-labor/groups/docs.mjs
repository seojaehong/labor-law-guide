// 문서 묶음 — 마크다운 원고를 한글(hwpx) 파일로 만든다.
//   make_hwpx_from_markdown  md → hwpx(프리셋 internal·tribunal). 변환 규칙은 src/lib/md-hwpx
//   read_hwp_as_markdown · fill_hwp_form · patch_hwp_from_markdown  한글 읽기·서식 채우기·되쓰기(lib/hangul-kordoc.mjs, kordoc)
// ★ 파일을 읽고 쓰므로 원격판(remote.mjs)에서 불러오지 않는다. stdio 판(server.mjs)으로만 켠다.
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { mdHwpxSummary, mdToHwpx, parseMarkdown } from '@/lib/md-hwpx';
import { fillCells, replaceText } from '@/lib/md-hwpx/postedit';
import { mdToHwpxWithTemplate } from '@/lib/md-hwpx/template';
import { argsLookLikeRrn, looksLikeRrn, text, writeNew } from '../lib/common.mjs';
import { fillHangul, hangulKind, patchHangul, readHangul } from '../lib/hangul-kordoc.mjs';

export const docsTools = ['make_hwpx_from_markdown', 'edit_hwpx_text', 'read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown'];

const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const EXISTS_MD = '이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.';
const EXISTS_EDIT = '이미 있는 파일은 덮어쓰지 않습니다. outFile 을 바꿔 주세요.';
// 마지막 쓰기는 공용 writeNew(없을 때만 만들기, wx) — 늦은 쪽은 앞 검사와 같은 거절을 받는다(261120 적대 검토)
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 주민등록번호를 받지 않습니다.';
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
const MAX_FILE = 2 * 1024 * 1024;
const MAX_HANGUL = 30 * 1024 * 1024;
// 원고 안의 16진 해시 조각(a-f 글자가 섞인 12자 이상)은 숫자 13자리가 이어져도 주민번호가 아니다 — 검사에서 뺀다(261119)
const HEX_TOKEN = /\b(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/gi;

export function registerDocs(server) {
  server.registerTool(
    'make_hwpx_from_markdown',
    {
      title: '마크다운을 한글(hwpx) 파일로 만들기(로컬 전용)',
      description:
        '마크다운 원고(의견서·답변서·검토 메모·양식집·보고서)를 한글 파일로 만든다. # ~ #### 제목(## 은 앞에 □, Ⅰ~Ⅹ 로 시작하면 쪽을 나눔), 본문 **굵게**, 판례 번호(「대법원 … 선고 … 판결」) 자동 굵게, 목록, 표(첫 행 = 머리행 음영·반복, 열 폭 자동, :---: 가운데·---: 오른쪽, 칸 안 <br> 줄바꿈, 7열 이상은 작은 글자, 긴 표는 쪽을 넘긴다), ' +
        '끝 15줄 안의 날짜만 있는 줄부터 서명부(오른쪽 정렬), 아래 가운데 쪽번호를 넣는다. 기본으로는 병합 칸·밑줄·인용 블록·그림·링크를 만들지 않는다(결과 leftovers 에 남은 기호로 알린다). features 를 켜면 기호 내어쓰기·강조 밑줄·인용 블록·그림·표 선택값(떠 있는 표·열 폭·삼선표·가로·세로 병합)을 쓴다. ' +
        'preset = internal(내부 문서: 행간 160%·여백 20mm) / tribunal(법원·위원회 제출: 행간 200%·위 45·아래 30·좌우 20mm). 기관 서식이 따로 있으면 그 서식을 따른다. 이미 있는 파일은 덮어쓰지 않는다.',
      inputSchema: {
        markdown: z.string().max(1_000_000).optional().describe('마크다운 원고(글). markdownFile 과 둘 중 하나'),
        markdownFile: z.string().max(400).optional().describe('마크다운 파일 경로(.md, UTF-8, 2MB 이하)'),
        preset: z.enum(['internal', 'tribunal']).describe('internal 내부 문서 / tribunal 법원·위원회 제출'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().max(120).optional().describe('파일 이름(확장자 빼고). 비우면 첫 # 제목, 그것도 없으면 md 파일 이름'),
        pageBreak: z.boolean().optional().describe('Ⅰ~Ⅹ 로 시작하는 ## 앞에서 쪽을 나눈다(기본 true)'),
        footer: z.boolean().optional().describe('아래 가운데 「- N -」 쪽번호(기본 true)'),
        templateFile: z.string().max(400).optional().describe('기관·고객 양식 hwpx 경로. 주면 양식의 글자·문단 모양과 쪽 설정을 그대로 쓰고 본문만 새로 채운다(양식 미리보기 그림은 옮기지 않음)'),
        templateSamples: z
          .object({ body: z.string().max(200).optional(), h1: z.string().max(200).optional(), h2: z.string().max(200).optional(), h3: z.string().max(200).optional(), h4: z.string().max(200).optional() })
          .optional()
          .describe('양식 안에서 역할별 모양을 찾을 글자(그 글자가 든 문단의 모양을 쓴다). body 를 비우면 양식에서 가장 많이 쓴 본문 모양'),
        features: z
          .object({
            indent: z.boolean().optional().describe('기호 문단 내어쓰기·공백 들여쓰기 없앰'),
            underline: z.boolean().optional().describe('문장 안 **강조** = 굵게+밑줄, <u> = 밑줄'),
            quote: z.boolean().optional().describe('> 인용 블록(휴먼고딕 11pt·180%)'),
            image: z.boolean().optional().describe('![캡션](경로) 한 줄을 그림으로(경로는 md 파일 폴더 기준, PNG·JPEG·GIF·BMP)'),
            table: z
              .object({
                float: z.boolean().optional().describe('떠 있는 표(아래 여백 8.5mm)'),
                pageBreak: z.enum(['CELL', 'TABLE']).optional().describe('쪽 나눔 단위(기본 CELL)'),
                width: z.enum(['fit']).optional().describe('열 폭: 짧은 열 먼저·최장 낱말 하한·구분행 대시 비율'),
                style: z.enum(['threeLine']).optional().describe('삼선표'),
                merge: z.boolean().optional().describe('가로 병합: 칸 내용이 < 하나면 왼쪽 칸과 합침'),
                vmerge: z.boolean().optional().describe('세로 병합: 칸 내용이 ^ 하나면 위 칸과 합침(머리행 제외)'),
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
      if (fs.existsSync(out)) return fail(EXISTS_MD, { exists: out });
      const images = {};
      for (const x of items) {
        if (x.kind !== 'image') continue;
        const p = path.isAbsolute(x.src) ? x.src : path.join(a.markdownFile ? path.dirname(String(a.markdownFile).trim()) : process.cwd(), x.src);
        if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size <= 15 * 1024 * 1024) images[x.src] = new Uint8Array(fs.readFileSync(p));
      }
      let bytes;
      try {
        const o = { preset: a.preset, pageBreak: a.pageBreak, footer: a.footer, features: a.features, images };
        if (a.templateFile) {
          const tp = String(a.templateFile).trim();
          if (!/\.hwpx$/i.test(tp) || !fs.existsSync(tp) || !fs.statSync(tp).isFile()) return fail(`양식 hwpx 파일이 없습니다: ${tp}`);
          bytes = await mdToHwpxWithTemplate(md, new Uint8Array(fs.readFileSync(tp)), { ...o, samples: a.templateSamples });
        } else bytes = await mdToHwpx(md, o);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      fs.mkdirSync(a.outDir, { recursive: true });
      if (!writeNew(out, bytes)) return fail(EXISTS_MD, { exists: out });
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

  server.registerTool(
    'edit_hwpx_text',
    {
      title: '한글(hwpx) 파일의 글자만 고치기(로컬 전용)',
      description:
        '이미 있는 hwpx 의 서식(header)은 바이트 그대로 두고 글자만 바꿔 새 파일로 저장한다. edits = 찾을 글자와 바꿀 글자 목록(찾는 글자는 문서 전체에서 정확히 1번, 한 글자 모양 안에 있어야 한다. 0번·2번 이상·강조 경계를 넘으면 아무것도 바꾸지 않고 멈춘다). ' +
        'fills = 표 칸 채우기(표 번호는 문서 순서 0부터, 행·열은 0부터). 넣은 글자는 예시 서식(파랑·기울임)을 물려받지 않고 header 에 있는 검정 글자 모양을 쓴다. 원본은 고치지 않고, 이미 있는 파일은 덮어쓰지 않는다. 쪽 나눔이 바뀌었는지는 한글에서 열어 고치기 전후 쪽을 대조한다.',
      inputSchema: {
        file: z.string().max(400).describe('고칠 hwpx 파일 경로'),
        edits: z.array(z.object({ old: z.string().min(1).max(2000), new: z.string().max(2000) })).max(200).optional().describe('글자 바꾸기 목록'),
        fills: z.array(z.object({ table: z.number().int().min(0), row: z.number().int().min(0), col: z.number().int().min(0), text: z.string().max(4000) })).max(500).optional().describe('표 칸 채우기 목록'),
        outFile: z.string().max(400).optional().describe('저장할 파일 경로(비우면 원래 이름 뒤에 _수정)'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ edits: a.edits, fills: a.fills })) return fail(RRN_STOP);
      const src = String(a.file).trim();
      if (!/\.hwpx$/i.test(src)) return fail('hwpx 파일만 받습니다.');
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return fail(`파일이 없습니다: ${src}`);
      if (!a.edits?.length && !a.fills?.length) return fail('edits 나 fills 중 하나를 주세요.');
      const out = (a.outFile ?? '').trim() || src.replace(/\.hwpx$/i, '_수정.hwpx');
      if (path.resolve(out) === path.resolve(src)) return fail('원본 파일에는 쓰지 않습니다. outFile 을 바꿔 주세요.');
      if (fs.existsSync(out)) return fail(EXISTS_EDIT, { exists: out });
      try {
        let bytes = new Uint8Array(fs.readFileSync(src));
        let preview = [];
        if (a.edits?.length) ({ bytes, preview } = await replaceText(bytes, a.edits));
        if (a.fills?.length) bytes = await fillCells(bytes, a.fills);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (!writeNew(out, bytes)) return fail(EXISTS_EDIT, { exists: out });
        return text({ ok: true, file: { path: out, bytes: bytes.length }, edits: preview, fills: a.fills?.length ?? 0, notice: '서식(header)은 그대로입니다. 한글에서 열어 고치기 전후 쪽마다 첫 줄과 끝 줄을 대조해 주세요.' });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // ── kordoc 3도구 — 한글 읽기·서식 채우기·마크다운 되쓰기(lib/hangul-kordoc.mjs). 파일 경로를 받고 결과 파일을 새로 쓴다.
  // 결과 글은 주민번호 모양을 가리므로(common.text) 마크다운 본문은 응답에 싣지 않고 파일로만 낸다 — 가린 글로 되쓰면 원본이 망가진다.
  const readHangulFile = (p) => {
    const src = String(p ?? '').trim();
    if (!/\.hwpx?$/i.test(src)) return { error: 'hwp·hwpx 파일만 받습니다.' };
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return { error: `파일이 없습니다: ${src}` };
    if (fs.statSync(src).size > MAX_HANGUL) return { error: '30MB 를 넘는 파일은 받지 않습니다.' };
    return { src, bytes: new Uint8Array(fs.readFileSync(src)) };
  };
  const checkOut = (src, out, exts) => {
    if (!out) return 'outFile 을 주세요.';
    if (!exts.some((e) => out.toLowerCase().endsWith(e))) return `outFile 은 ${exts.join('·')} 로 끝나야 합니다.`;
    if (path.resolve(out) === path.resolve(src)) return '원본 파일에는 쓰지 않습니다. outFile 을 바꿔 주세요.';
    if (fs.existsSync(out)) return EXISTS_EDIT;
    return null;
  };
  const errText = (e) => (e instanceof Error ? e.message : String(e));

  server.registerTool(
    'read_hwp_as_markdown',
    {
      title: '한글(hwp·hwpx) 파일을 마크다운으로 읽기(로컬 전용)',
      description:
        '한글 파일(HWP 5.x·hwpx)을 마크다운 파일로 저장한다. 표는 마크다운 표로, 병합 칸이 있는 표는 colspan·rowspan 을 가진 HTML 표로 남는다. 그림 속 글자 인식(OCR)은 하지 않는다. ' +
        "layout = visual(기본, 보이는 대로: 테두리 없는 틀 표는 글로 푼다, 읽기용) / keep(원본 표 구조 그대로). patch_hwp_from_markdown 으로 원본에 되쓸 원고는 layout 'keep' 으로 뽑는다. " +
        '본문은 응답에 싣지 않고 outFile 에만 쓴다(응답 글은 주민등록번호 모양을 가리므로). 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 읽는다.',
      inputSchema: {
        file: z.string().max(400).describe('읽을 hwp·hwpx 파일 경로'),
        outFile: z.string().max(400).describe('저장할 마크다운 파일 경로(.md)'),
        layout: z.enum(['visual', 'keep']).optional().describe("visual(기본) 읽기용 / keep 되쓰기(patch)용 원고"),
      },
      annotations: WRITES,
    },
    async (a) => {
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.md']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      let r;
      try {
        r = await readHangul(f.bytes, { layout: a.layout ?? 'visual' });
      } catch (e) {
        return fail(errText(e));
      }
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      const body = Buffer.from(r.markdown, 'utf8');
      if (!writeNew(out, body)) return fail(EXISTS_EDIT, { exists: out });
      return text({
        ok: true,
        kind: r.kind,
        layout: r.layout,
        file: { path: out, bytes: body.length },
        chars: r.markdown.length,
        tables: (r.markdown.match(/<table>/g) ?? []).length + (r.markdown.match(/^\|\s*-{3}/gm) ?? []).length,
        warnings: r.warnings,
      });
    },
  );

  server.registerTool(
    'fill_hwp_form',
    {
      title: '한글(hwp·hwpx) 서식 빈칸 채우기(로컬 전용)',
      description:
        '한글 서식의 라벨(예: 성명·주소) 옆 칸과 괄호 빈칸을 values 로 채워 새 파일로 저장한다. 원본 서식(테두리·글꼴·병합)은 그대로 두고 글자만 넣는다. hwp 서식은 서식 그대로 hwpx 로 바꿔 채우고, outFile 이 .hwp 면 HWP 5.x 로, .hwpx 면 hwpx 로 저장한다. ' +
        '서식 그대로 바꾸지 못하면 서식을 버리고 새로 짓지 않고 멈춘다. 찾지 못한 라벨(unmatched)이나 두 곳 이상에 맞아 채우지 않은 라벨(rejected, requireUnique 일 때)이 있으면 파일은 저장하되 ok:false·incomplete:true 로 알린다. ' +
        '주민등록번호 모양 값은 받지 않는다. 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 채운다.',
      inputSchema: {
        file: z.string().max(400).describe('서식 hwp·hwpx 파일 경로'),
        values: z
          .record(z.string().max(200), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(200)]))
          .describe('라벨 → 값. 배열이면 같은 라벨이 나오는 순서대로 하나씩(명부형 표)'),
        outFile: z.string().max(400).describe('저장할 파일 경로(.hwp 또는 .hwpx)'),
        requireUnique: z.boolean().optional().describe('라벨이 두 곳 이상에 맞으면 채우지 않고 rejected 로 알린다(기본 false)'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ values: a.values })) return fail(RRN_STOP);
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.hwp', '.hwpx']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      if (!a.values || !Object.keys(a.values).length) return fail('values 를 주세요.');
      let r;
      try {
        r = await fillHangul(f.bytes, a.values, { out: out.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp', requireUnique: a.requireUnique === true });
      } catch (e) {
        return fail(errText(e));
      }
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      if (!writeNew(out, r.bytes)) return fail(EXISTS_EDIT, { exists: out });
      const incomplete = r.unmatched.length > 0 || r.rejected.length > 0;
      return text({
        ok: !incomplete,
        ...(incomplete ? { incomplete: true, error: `채우지 못한 라벨이 있습니다(못 찾음 ${r.unmatched.length} · 두 곳 이상 ${r.rejected.length}). 파일은 저장했습니다.` } : {}),
        kind: r.kind,
        file: { path: out, bytes: r.bytes.length, format: r.out },
        filled: r.filled,
        unmatched: r.unmatched,
        rejected: r.rejected,
        warnings: r.warnings,
        notice: '한글에서 열어 채운 칸과 쪽 나눔을 확인한 뒤 냅니다.',
      });
    },
  );

  server.registerTool(
    'patch_hwp_from_markdown',
    {
      title: '고친 마크다운을 원본 한글 파일에 되쓰기(로컬 전용)',
      description:
        "read_hwp_as_markdown 을 layout 'keep' 으로 뽑은 마크다운을 고친 뒤, 바뀐 글자만 원본 hwp·hwpx 에 서식 그대로 되써 새 파일로 저장한다(원본이 hwp 면 .hwp, hwpx 면 .hwpx). " +
        "기본(visual) 원고로는 틀 표가 있는 문서의 원본 위치를 찾지 못해 멈춘다(layout 'keep' 으로 다시 뽑는다). " +
        '되쓰지 못한 편집(HWP 5.x 의 문단 추가·삭제, 표 구조 변경 등)은 skipped(이유·전후 글자)로, 되읽어 대조한 잔차는 verification 으로 그대로 돌려주고 ok:false·incomplete:true 로 알린다(되쓴 파일은 저장한다). ' +
        'structure(hwpx 만) = 문단 추가·삭제 반영(기본 true). 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 되쓴다.',
      inputSchema: {
        file: z.string().max(400).describe('원본 hwp·hwpx 파일 경로'),
        markdownFile: z.string().max(400).describe("고친 마크다운 파일 경로(.md, layout 'keep' 으로 뽑은 것)"),
        outFile: z.string().max(400).describe('저장할 파일 경로(원본과 같은 형식: .hwp 또는 .hwpx)'),
        structure: z.boolean().optional().describe('hwpx: 문단 추가·삭제 반영(기본 true)'),
      },
      annotations: WRITES,
    },
    async (a) => {
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const mdPath = String(a.markdownFile ?? '').trim();
      if (!/\.md$/i.test(mdPath)) return fail('markdownFile 은 .md 파일이어야 합니다.');
      if (!fs.existsSync(mdPath) || !fs.statSync(mdPath).isFile()) return fail(`파일이 없습니다: ${mdPath}`);
      if (fs.statSync(mdPath).size > MAX_FILE) return fail('2MB 를 넘는 마크다운은 받지 않습니다.');
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.hwp', '.hwpx']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      const md = fs.readFileSync(mdPath, 'utf8').replace(/^﻿/, '');
      let r;
      try {
        const kind = await hangulKind(f.bytes);
        if (!kind) return fail('한글 문서(HWP 5.x 또는 hwpx)가 아닙니다.');
        const want = out.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp';
        if (want !== kind) return fail(`원본이 ${kind} 이므로 outFile 도 .${kind} 로 주세요(되쓰기는 형식을 바꾸지 않습니다).`);
        r = await patchHangul(f.bytes, md, { structure: a.structure !== false });
      } catch (e) {
        return fail(errText(e));
      }
      const report = { applied: r.applied, skipped: r.skipped, warnings: r.warnings, verification: r.verification };
      if (!r.success) return fail(`되쓰지 못했습니다: ${r.error}`, report);
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      if (!writeNew(out, r.bytes)) return fail(EXISTS_EDIT, { exists: out });
      const v = r.verification;
      const residual = v ? v.added + v.removed + v.modified : 0;
      const missed = r.skipped.filter((s) => !s.partial).length;
      const incomplete = missed > 0 || residual > 0;
      return text({
        ok: !incomplete,
        ...(incomplete ? { incomplete: true, error: `되쓰지 못한 편집이 있습니다(건너뜀 ${missed} · 대조 잔차 ${residual}). 되쓴 파일은 저장했습니다.` } : {}),
        kind: r.kind,
        file: { path: out, bytes: r.bytes.length },
        ...report,
        notice: '한글에서 열어 고친 곳과 쪽 나눔을 확인한 뒤 냅니다.',
      });
    },
  );
}
