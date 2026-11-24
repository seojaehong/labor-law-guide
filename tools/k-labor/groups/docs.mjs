// 문서 묶음 — 마크다운 원고를 한글(hwpx) 파일로 만든다.
//   make_hwpx_from_markdown  md → hwpx(프리셋 internal·tribunal). 변환 규칙은 src/lib/md-hwpx
//   read_hwp_as_markdown · fill_hwp_form · patch_hwp_from_markdown  한글 읽기·서식 채우기·되쓰기(lib/hangul-kordoc.mjs, kordoc)
//   check_prose  퇴고 문체 점검 — 규칙·검출식은 팩(JSON): lib/prose/generic-pack.json + env PROSE_PACK_DIR(261123)
//   check_norms  퇴고 공개 규범 점검 — 한글 맞춤법 제5장 띄어쓰기·부록 문장 부호·연결어미 뒤 쉼표(lib/prose/norms.mjs, 261124)
// ★ 파일을 읽고 쓰므로 원격판(remote.mjs)에서 불러오지 않는다. stdio 판(server.mjs)으로만 켠다.
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { mdHwpxSummary, mdToHwpx, parseMarkdown } from '@/lib/md-hwpx';
import { fillCells, replaceText } from '@/lib/md-hwpx/postedit';
import { mdToHwpxWithTemplate } from '@/lib/md-hwpx/template';
import { argsLookLikeRrn, looksLikeRrn, text, writeNew } from '../lib/common.mjs';
import { DETAIL_SCHEMA, GENRE_SCHEMA, NORM_CHECKS_SCHEMA, normsResult, proseResult, rrnStop, TEXT_SCHEMA } from '../lib/prose/toego.mjs';
import { capSkipped, decodeMarkdown, fillHangul, hangulKind, maskExcerpt, MAX_MARKDOWN_BYTES, patchHangul, patchVerdict, readHangul, sanitizeReason } from '../lib/hangul-kordoc.mjs';

export const docsTools = ['make_hwpx_from_markdown', 'edit_hwpx_text', 'read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown', 'check_prose', 'check_norms'];

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
        '끝 15줄 안의 날짜만 있는 줄부터 서명부(오른쪽 정렬), 아래 가운데 쪽번호를 넣는다. 표 칸은 어절 단위로 줄을 나누고 줄간격 150%(tableLineSpacing 으로 조정), orientation landscape 면 A4 가로.기본으로는 병합 칸·밑줄·인용 블록·그림·링크를 만들지 않는다(결과 leftovers 에 남은 기호로 알린다). features 를 켜면 기호 내어쓰기·강조 밑줄·인용 블록·그림·표 선택값(떠 있는 표·열 폭·삼선표·가로·세로 병합)을 쓴다. ' +
        'preset = internal(내부 문서: 행간 160%·여백 20mm) / tribunal(법원·위원회 제출: 행간 200%·위 45·아래 30·좌우 20mm). 기관 서식이 따로 있으면 그 서식을 따른다. 이미 있는 파일은 덮어쓰지 않는다.',
      inputSchema: {
        markdown: z.string().max(1_000_000).optional().describe('마크다운 원고(글). markdownFile 과 둘 중 하나'),
        markdownFile: z.string().max(400).optional().describe('마크다운 파일 경로(.md, UTF-8, 2MB 이하)'),
        preset: z.enum(['internal', 'tribunal']).describe('internal 내부 문서 / tribunal 법원·위원회 제출'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().max(120).optional().describe('파일 이름(확장자 빼고). 비우면 첫 # 제목, 그것도 없으면 md 파일 이름'),
        pageBreak: z.boolean().optional().describe('Ⅰ~Ⅹ 로 시작하는 ## 앞에서 쪽을 나눈다(기본 true)'),
        footer: z.boolean().optional().describe('아래 가운데 「- N -」 쪽번호(기본 true)'),
        orientation: z.enum(['portrait', 'landscape']).optional().describe('용지 방향: portrait A4 세로(기본) / landscape A4 가로(열이 많은 표). 표 폭·배치도 가로 본문 폭을 따른다. templateFile 을 주면 양식의 쪽 설정이 우선'),
        tableLineSpacing: z.number().int().min(100).max(250).optional().describe('표 칸 줄간격(%), 100~250. 기본 150. 삼선표는 110% 그대로'),
        templateFile: z.string().max(400).optional().describe('기관·고객 양식 hwpx 경로. 주면 양식의 글자·문단 모양과 쪽 설정을 그대로 쓰고 본문만 새로 채운다(양식 미리보기 그림은 옮기지 않음)'),
        templateSamples: z
          .object({
            body: z.string().max(200).optional(),
            h1: z.string().max(200).optional(),
            h2: z.string().max(200).optional(),
            h3: z.string().max(200).optional(),
            h4: z.string().max(200).optional(),
            cell: z.string().max(200).optional().describe('표 본문 칸 글자. 주면 표 칸 문단·글자를 그 모양으로(가운데·오른쪽 정렬 칸은 정렬만 바꾼 복제, 칸 안 굵게는 굵게만 더한 복제)'),
            cellHead: z.string().max(200).optional().describe('표 머리행 칸 글자. 주면 머리행 칸 문단·글자를 그 모양으로(안 주면 cell 의 가운데·굵게 복제)'),
          })
          .optional()
          .describe('양식 안에서 역할별 모양을 찾을 글자(그 글자가 든 문단의 모양을 쓴다). body 를 비우면 양식에서 가장 많이 쓴 본문 모양. 표 칸 줄간격은 tableLineSpacing 을 주면 그 값, 아니면 양식 값이고 칸은 어절 단위로 줄을 나눈다. 칸 테두리·머리행 음영은 엔진 것 그대로'),
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
                align: z.enum(['left', 'justify']).optional().describe('표 본문 칸 정렬: left = 왼쪽(양식 칸 문단 복제·정렬만 변경), 기본 = 종전. 가운데·오른쪽 칸·머리행은 그대로'),
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
        const o = { preset: a.preset, pageBreak: a.pageBreak, footer: a.footer, features: a.features, images, orientation: a.orientation, tableLineSpacing: a.tableLineSpacing };
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
  // 원칙(G4 261123): 덜 된 것을 ok 로 내지 않는다. 파일은 쓰되 ok:false·incomplete:true 로 알린다.
  // 모든 파일 입출력은 핸들러 안 try 경계 안에서 한다 — 예외 글(경로 원문)이 응답에 실리지 않게(A10)
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
  /** 새 파일로 쓴다. 이미 있으면 'exists'. 이번 호출이 만든 파일은 쓰기 실패 시 지운다(wx 라 남의 파일은 아니다, A10) */
  const writeOut = (out, bytes) => {
    try {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    } catch (e) {
      return { error: `저장할 폴더를 만들지 못했습니다(${e?.code || 'error'}).` };
    }
    try {
      return writeNew(out, bytes) ? { ok: true } : { exists: true };
    } catch (e) {
      try { fs.rmSync(out, { force: true }); } catch { /* 지우지 못해도 아래 오류로 알린다 */ }
      return { error: `파일을 쓰지 못했습니다(${e?.code || 'error'}).` };
    }
  };
  // 파일 시스템 오류(e.code 가 있는 것)는 글에 경로가 섞인다 — 코드만 남긴다. lib 는 바이트만 받으므로 그 오류 글에는 경로가 없다
  const errText = (e) => (e?.code ? `처리하지 못했습니다(${e.code}).` : sanitizeReason(e instanceof Error ? e.message : String(e)));
  const guard = (fn) => async (a) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(errText(e));
    }
  };
  const written = (w, out) => (w.exists ? fail(EXISTS_EDIT, { exists: out }) : fail(w.error));

  server.registerTool(
    'read_hwp_as_markdown',
    {
      title: '한글(hwp·hwpx) 파일을 마크다운으로 읽기(로컬 전용)',
      description:
        '한글 파일(HWP 5.x·hwpx)을 마크다운 파일로 저장한다. 표는 마크다운 표로, 병합 칸이 있는 표는 colspan·rowspan 을 가진 HTML 표로 남는다. 그림 추출과 그림 속 글자 인식(OCR)은 하지 않는다. ' +
        "layout = visual(기본, 보이는 대로: 테두리 없는 틀 표는 글로 푼다, 읽기용) / keep(원본 표 구조 그대로). patch_hwp_from_markdown 으로 원본에 되쓸 원고는 layout 'keep' 으로 뽑는다. " +
        '일부만 읽었거나 손상을 복구하며 읽었을 때, 본문이 비었거나 배포용 안내문뿐일 때는 파일은 쓰되 ok:false·incomplete:true 와 problems 로 알린다. ' +
        '본문은 응답에 싣지 않고 outFile 에만 쓴다(응답 글은 주민등록번호 모양을 가리므로). 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 읽는다.',
      inputSchema: {
        file: z.string().max(400).describe('읽을 hwp·hwpx 파일 경로'),
        outFile: z.string().max(400).describe('저장할 마크다운 파일 경로(.md)'),
        layout: z.enum(['visual', 'keep']).optional().describe('visual(기본) 읽기용 / keep 되쓰기(patch)용 원고'),
      },
      annotations: WRITES,
    },
    guard(async (a) => {
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.md']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      const r = await readHangul(f.bytes, { layout: a.layout ?? 'visual' });
      const body = Buffer.from(r.markdown, 'utf8');
      if (body.length > MAX_MARKDOWN_BYTES) return fail('읽은 마크다운이 30MB 를 넘어 쓰지 않았습니다.');
      const w = writeOut(out, body);
      if (!w.ok) return written(w, out);
      const incomplete = r.problems.length > 0;
      return text({
        ok: !incomplete,
        ...(incomplete ? { incomplete: true, error: '읽은 결과가 온전하지 않습니다(problems). 파일은 저장했습니다.', problems: r.problems } : {}),
        kind: r.kind,
        layout: r.layout,
        file: { path: out, bytes: body.length },
        chars: r.markdown.length,
        tables: (r.markdown.match(/<table>/g) ?? []).length + (r.markdown.match(/^\|\s*-{3}/gm) ?? []).length,
        warnings: r.warnings,
      });
    }),
  );

  server.registerTool(
    'fill_hwp_form',
    {
      title: '한글(hwp·hwpx) 서식 빈칸 채우기(로컬 전용)',
      description:
        '한글 서식의 라벨(예: 성명·주소) 옆 칸과 괄호 빈칸을 values 로 채워 새 파일로 저장한다. 원본 서식(테두리·글꼴·병합)은 그대로 두고 글자만 넣는다. hwp 서식은 서식 그대로 hwpx 로 바꿔 채우고, outFile 이 .hwp 면 HWP 5.x 로(되읽어 채운 값이 남았는지 대조), .hwpx 면 hwpx 로 저장한다. ' +
        '서식을 서식 그대로 바꾸지 못하거나 일부만 읽었으면 멈춘다. 띄어쓰기·괄호를 빼면 같아지는 라벨 둘은 채우지 않고 멈춘다(collisions). requireUnique(기본 true)면 두 곳 이상에 맞는 라벨(누름틀 포함)은 채우지 않는다. ' +
        '찾지 못한 라벨(unmatched)·두 곳 이상이라 채우지 않은 라벨(rejected)·칸보다 많아 남은 배열 값(leftover)·HWP 저장 때 빠진 내용(losses)·되읽어 없는 값이 있으면 파일은 저장하되 ok:false·incomplete:true 로 알린다. ' +
        'filled 에 값을 쓴 자리(표 번호·행·열 또는 누름틀 이름)를 싣는다. 주민등록번호 모양 값은 받지 않는다. 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 채운다.',
      inputSchema: {
        file: z.string().max(400).describe('서식 hwp·hwpx 파일 경로'),
        values: z
          .record(z.string().max(200), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(200)]))
          .describe('라벨 → 값. 배열이면 같은 라벨이 나오는 순서대로 하나씩(명부형 표)'),
        outFile: z.string().max(400).describe('저장할 파일 경로(.hwp 또는 .hwpx)'),
        requireUnique: z.boolean().optional().describe('라벨이 두 곳 이상에 맞으면 채우지 않고 rejected 로 알린다(기본 true, false 면 맞는 곳 전부 채움)'),
      },
      annotations: WRITES,
    },
    guard(async (a) => {
      if (argsLookLikeRrn({ values: a.values })) return fail(RRN_STOP);
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.hwp', '.hwpx']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      if (!a.values || !Object.keys(a.values).length) return fail('values 를 주세요.');
      const r = await fillHangul(f.bytes, a.values, { out: out.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp', requireUnique: a.requireUnique !== false });
      if (r.refused) return fail(r.refused, { collisions: r.collisions });
      const w = writeOut(out, r.bytes);
      if (!w.ok) return written(w, out);
      const missing = r.verified?.missing ?? [];
      const n = { unmatched: r.unmatched.length, rejected: r.rejected.length, leftover: r.leftover.length, losses: r.losses.length, missing: missing.length };
      const incomplete = Object.values(n).some((x) => x > 0);
      return text({
        ok: !incomplete,
        ...(incomplete ? { incomplete: true, error: `다 채우지 못했습니다(못 찾음 ${n.unmatched} · 두 곳 이상 ${n.rejected} · 남은 값 ${n.leftover} · 저장 손실 ${n.losses} · 되읽어 없음 ${n.missing}). 파일은 저장했습니다.` } : {}),
        kind: r.kind,
        file: { path: out, bytes: r.bytes.length, format: r.out },
        filled: r.filled,
        unmatched: r.unmatched,
        rejected: r.rejected,
        leftover: r.leftover,
        losses: r.losses,
        ...(r.verified ? { verified: { checked: r.verified.checked, missing: missing.map(maskExcerpt) } } : {}),
        warnings: r.warnings,
        notice: '한글에서 열어 채운 칸과 쪽 나눔을 확인한 뒤 냅니다.',
      });
    }),
  );

  server.registerTool(
    'patch_hwp_from_markdown',
    {
      title: '고친 마크다운을 원본 한글 파일에 되쓰기(로컬 전용)',
      description:
        "read_hwp_as_markdown 을 layout 'keep' 으로 뽑은 마크다운을 고친 뒤, 바뀐 글자만 원본 hwp·hwpx 에 서식 그대로 되써 새 파일로 저장한다(원본이 hwp 면 .hwp, hwpx 면 .hwpx). " +
        "기본(visual) 원고로는 틀 표가 있는 문서의 원본 위치를 찾지 못해 멈춘다(layout 'keep' 으로 다시 뽑는다). " +
        '되쓰지 못한 편집(문단 추가·삭제, 표 구조 변경, 행 끝 공백 두 칸 줄바꿈 등)과 일부만 반영된 편집(partial)은 skipped(이유·전후 글자, 앞 20건과 skippedTotal)로, 되읽어 대조한 잔차는 verification 으로 돌려주고 ok:false·incomplete:true 로 알린다(되쓴 파일은 저장한다). changes 는 원본과 결과를 다시 읽어 센 줄 차이(removedLines 원본에서 빠진 줄·addedLines 결과에 생긴 줄)다. ' +
        'structure(hwpx 만) = 문단 추가·삭제 반영(기본 false: 원고에 없는 문단을 지우지 않는다). 원본에 없던 주민등록번호 모양이나 가림 표시가 원고에 있으면 멈춘다. 빈 원고는 받지 않는다. 이미 있는 파일은 덮어쓰지 않는다. kordoc(MIT) 으로 되쓴다.',
      inputSchema: {
        file: z.string().max(400).describe('원본 hwp·hwpx 파일 경로'),
        markdownFile: z.string().max(400).describe("고친 마크다운 파일 경로(.md, layout 'keep' 으로 뽑은 것. UTF-8 또는 EUC-KR)"),
        outFile: z.string().max(400).describe('저장할 파일 경로(원본과 같은 형식: .hwp 또는 .hwpx)'),
        structure: z.boolean().optional().describe('hwpx: 문단 추가·삭제 반영(기본 false)'),
      },
      annotations: WRITES,
    },
    guard(async (a) => {
      const f = readHangulFile(a.file);
      if (f.error) return fail(f.error);
      const mdPath = String(a.markdownFile ?? '').trim();
      if (!/\.md$/i.test(mdPath)) return fail('markdownFile 은 .md 파일이어야 합니다.');
      if (!fs.existsSync(mdPath) || !fs.statSync(mdPath).isFile()) return fail(`파일이 없습니다: ${mdPath}`);
      if (fs.statSync(mdPath).size > MAX_MARKDOWN_BYTES) return fail('30MB 를 넘는 마크다운은 받지 않습니다.');
      const out = String(a.outFile ?? '').trim();
      const bad = checkOut(f.src, out, ['.hwp', '.hwpx']);
      if (bad) return fail(bad, bad === EXISTS_EDIT ? { exists: out } : {});
      const md = decodeMarkdown(new Uint8Array(fs.readFileSync(mdPath)));
      if (md === null) return fail('마크다운에 깨진 글자가 있습니다. UTF-8(또는 EUC-KR)로 저장해 주세요.');
      const kind = await hangulKind(f.bytes);
      if (!kind) return fail('한글 문서(HWP 5.x 또는 hwpx)가 아닙니다.');
      const want = out.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp';
      if (want !== kind) return fail(`원본이 ${kind} 이므로 outFile 도 .${kind} 로 주세요(되쓰기는 형식을 바꾸지 않습니다).`);
      const r = await patchHangul(f.bytes, md, { structure: a.structure === true });
      if (r.refused) return fail(r.refused);
      const v = patchVerdict(r);
      const capped = capSkipped(r.skipped);
      const report = { applied: r.applied, ...capped, partialCount: v.partialCount, warnings: r.warnings, verification: r.verification, changes: r.changes };
      if (!r.success) return fail(`되쓰지 못했습니다: ${r.error}`, report);
      const w = writeOut(out, r.bytes);
      if (!w.ok) return written(w, out);
      return text({
        ok: !v.incomplete,
        ...(v.incomplete
          ? { incomplete: true, error: `다 되쓰지 못했습니다(건너뜀 ${v.missedCount} · 일부만 반영 ${v.partialCount} · 대조 잔차 ${v.residual ?? '대조 못 함'}). 되쓴 파일은 저장했습니다.` }
          : {}),
        kind: r.kind,
        file: { path: out, bytes: r.bytes.length },
        ...report,
        notice: '한글에서 열어 고친 곳과 쪽 나눔을 확인한 뒤 냅니다.',
      });
    }),
  );

  // ── 퇴고 — 문서 문체 점검(결정론). 규칙은 팩(JSON): 범용 팩 + env PROSE_PACK_DIR 의 팩
  server.registerTool(
    'check_prose',
    {
      title: '퇴고: 문서 문체 점검(규칙 팩)',
      description:
        '의견서·보고서·강의안 같은 업무 문서에서 비유·구어 표현, 번역투, AI 문체 상투어, 서식 위반을 줄·칸 단위로 찾는다. > 인용 줄과 [관련 판결] 줄은 원문이라 본문 규칙을 보지 않는다. 표 칸의 「」·“ ” 안은 원문으로 보고 가린다. ' +
        'A = 고칠 표현, B = 문맥을 보고 판단할 표현. 빈도·문장 길이·종결어미 반복 같은 알림은 notes 에 따로 준다. 걸린 곳이 많으면 hits 는 500건까지(A 먼저, 같은 등급은 앞의 것부터) 싣고 truncated 로 알린다(counts 는 전부 센 수). 규칙은 범용 팩(im-not-ai 유래)과 이 PC 의 PROSE_PACK_DIR 팩에서 읽는다. 읽지 못하거나 점검 중 멈춘 팩이 있으면 그 팩을 빼고 ok:false·incomplete:true 와 skipped(고정 코드)로 알린다. ' +
        '공개 팩의 걸림에는 걸린 글자·고칠 말·규칙 이름이 붙는다. 비공개 팩은 위치·등급·짧은 사유만 주고(PROSE_ALLOW_FULL=1 인 PC 에서는 전부), full 을 달라고 했는데 줄였으면 withheld 로 알린다. 주민등록번호 모양이 있으면 점검하지 않고 rrnLines(줄 번호만)로 알린다. 모델을 부르지 않고, 문서 글을 밖으로 보내지 않는다.',
      inputSchema: {
        text: TEXT_SCHEMA.describe('점검할 문서 글(md 또는 평문, 40만 자까지)'),
        genre: GENRE_SCHEMA.optional().describe('legal(기본: 의견서·조사보고서) / consulting / lecture / general / official(general 규칙으로 돌되 범용 팩의 법률 트랙 keep 5항목은 legal 처럼 꺼진다. 응답 genre 는 general, requestedGenre 는 official). 장르별 검사는 팩에 달려 있다'),
        detail: DETAIL_SCHEMA.optional().describe('비우면 공개 팩은 전부·비공개 팩은 위치만 / brief 모든 팩을 위치·등급·짧은 사유만 / full 비공개 팩도 전부(이 PC 가 허용할 때만)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      // 원문에서 찾는다(JSON 으로 감싸면 탭·줄바꿈 구분을 놓친다) — 멈추면 숫자 없이 줄 번호만
      const stop = rrnStop(a.text);
      if (stop) return text(stop);
      // 점검·오류 처리는 lib/prose/toego.mjs 한 곳(가벼운 실행 파일 dist/toego.mjs 와 같은 함수)
      return text(proseResult(a));
    },
  );

  // ── 퇴고 — 공개 규범 점검(결정론). 규칙은 공개 규범이라 코드(lib/prose/norms.mjs)에 있다
  server.registerTool(
    'check_norms',
    {
      title: '퇴고: 띄어쓰기·문장 부호·쉼표 점검(한글 맞춤법)',
      description:
        '한글 맞춤법(문화체육관광부 고시 제2017-12호)의 제5장 띄어쓰기와 부록 「문장 부호」, 그리고 연결어미 뒤 쉼표(~하였고, ~경우, 꼴. 규정이 아니라 업무 문서 관행)를 줄 단위로 찾는다. ' +
        'A = 규정(쉼표는 관행)이 명시한 것을 어긴 곳, B = 규정이 권하는 쪽과 다르거나 문맥을 봐야 하는 곳. 규정이 둘 다 허용하는 것(단위 명사·보조 용언 붙여 쓰기 등)은 보지 않는다. ' +
        '보지 않는 줄은 검사마다 다르다. 띄어쓰기: # 제목·| 표·--- ·[관련 …]·[질의 …] 줄, > 인용 줄과 문장 안 “ ” 인용(quote 를 켜면 인용은 본다). 문장 부호: 같은 줄들과 따옴표 안 글자(quote 를 켜면 모두 본다). ' +
        '쉼표: > 인용·# 제목·그림 줄과 “ ” ‘ ’ 「 」 " " 안(quote 와 상관없이 늘 뺀다). | 표 줄과 [관련 …] 줄은 본다. warnOnly 를 켜면 쉼표 걸림을 B 로 낸다(PDF 에서 뽑은 글처럼 인용 표시가 사라진 글). ' +
        '검사마다 counts(전부 센 수)와 hits(500건까지, A 먼저, 넘으면 truncated)를 준다. 주민등록번호 모양이 있으면 점검하지 않고 rrnLines(줄 번호만)로 알린다. 모델을 부르지 않고, 문서 글을 밖으로 보내지 않는다.',
      inputSchema: {
        text: TEXT_SCHEMA.describe('점검할 문서 글(md 또는 평문, 40만 자까지)'),
        checks: NORM_CHECKS_SCHEMA.optional().describe('spacing(띄어쓰기) / punct(문장 부호) / comma(연결어미 뒤 쉼표). 비우면 셋 다'),
        quote: z.boolean().optional().describe('켜면 > 인용 줄과 “ ” 원문 인용도 본다(띄어쓰기·문장 부호만. 쉼표는 늘 인용을 뺀다). 기본 끔'),
        warnOnly: z.boolean().optional().describe('켜면 쉼표 걸림을 B(경고)로 낸다. 기본 끔'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      // 원문에서 찾는다(JSON 으로 감싸면 탭·줄바꿈 구분을 놓친다) — 멈추면 숫자 없이 줄 번호만
      const stop = rrnStop(a.text);
      if (stop) return text(stop);
      return text(normsResult(a));
    },
  );
}
