// 올린 파일(zip·낱개)을 펼쳐 규정 목록으로 만든다. 모두 브라우저 안에서 한다 — 규정 파일은 서버로 가지 않는다.
// hwp·hwpx 는 rhwp 문단 색인으로 읽는다. 줄 번호가 반영본 고침(src/lib/hwp/apply.ts)과 같아야 하기 때문이다.
import JSZip from 'jszip';
import type { InitInput } from '@rhwp/core';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { toLines } from '@/lib/hwp/apply';
import { readDocText } from '@/lib/laws/doc-io';
import { annexKey, parseRegulation, type DocLine, type Regulation, type SourceKind } from './model';
import { annexOwner, groupSame, nameFromFile, nameFromText, normName, REG_SUFFIX, sameName, versionDate } from './names';
import { readPdf, type PdfLib, type PdfPage, type PdfPageInfo } from './pdf';

export const LIMITS = { files: 1500, fileBytes: 20 * 1024 * 1024, totalBytes: 400 * 1024 * 1024 };

export interface Upload {
  /** zip 안 경로까지 붙인 이름 */
  path: string;
  bytes: Uint8Array;
}

export interface Skipped {
  path: string;
  why: string;
}

const ext = (p: string) => p.toLowerCase().split('.').pop() ?? '';
const KIND: Record<string, SourceKind> = { hwp: 'hwp', hwpx: 'hwpx', docx: 'docx', txt: 'txt', pdf: 'pdf' };

/** pdf 읽기 — 글자층은 브라우저 안에서, 스캔 쪽은 onScanned 가 있을 때만(담당자 동의 뒤) 읽는다 */
export interface PdfReader {
  /** pdf.js — 화면에서는 pdf 가 실제로 나왔을 때만 불러오도록 함수로 준다 */
  lib: PdfLib | (() => Promise<PdfLib>);
  onScanned?: (page: PdfPage, no: number, path: string) => Promise<string[] | null>;
}

/** 윈도우 「압축 폴더」는 한글 이름을 EUC-KR 로 적는다. JSZip 은 UTF-8 표시가 없는 항목에만 이 함수를 부른다 */
const decodeName = (b: string[] | Uint8Array | Buffer) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array((b as string[]).map((c) => c.charCodeAt(0)));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('euc-kr').decode(bytes); }
};

/** zip 은 펼치고(안의 zip 은 한 단계만), 읽을 형식만 남긴다 */
export async function expandUploads(inputs: Upload[]): Promise<{ files: Upload[]; skipped: Skipped[] }> {
  const files: Upload[] = [];
  const skipped: Skipped[] = [];
  let total = 0;
  const take = (u: Upload) => {
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(u.path) || u.path.split('/').pop()!.startsWith('~$')) return;
    const e = ext(u.path);
    if (!KIND[e]) { skipped.push({ path: u.path, why: '읽지 않는 형식' }); return; }
    if (u.bytes.byteLength > LIMITS.fileBytes) { skipped.push({ path: u.path, why: '20MB 넘는 파일' }); return; }
    if (files.length >= LIMITS.files) { skipped.push({ path: u.path, why: `파일 ${LIMITS.files}개 한도 초과` }); return; }
    total += u.bytes.byteLength;
    if (total > LIMITS.totalBytes) { skipped.push({ path: u.path, why: '전체 400MB 한도 초과' }); return; }
    files.push(u);
  };
  const unzip = async (u: Upload, depth: number) => {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(u.bytes, { decodeFileName: decodeName }); } catch { skipped.push({ path: u.path, why: '열 수 없는 zip' }); return; }
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const path = `${u.path}/${entry.name}`;
      const bytes = await entry.async('uint8array');
      if (ext(entry.name) === 'zip') {
        if (depth < 1) await unzip({ path, bytes }, depth + 1);
        else skipped.push({ path, why: 'zip 안의 zip 안의 zip 은 펼치지 않습니다' });
      } else take({ path, bytes });
    }
  };
  for (const u of inputs) {
    if (ext(u.path) === 'zip') await unzip(u, 0);
    else take(u);
  }
  return { files, skipped };
}

/** 한 파일 → 줄 목록 */
export async function readLines(u: Upload, wasm?: InitInput, pdf?: PdfReader): Promise<{ kind: SourceKind; lines: DocLine[]; pages?: PdfPageInfo[] }> {
  const kind = KIND[ext(u.path)];
  if (kind === 'pdf') {
    if (!pdf) throw new Error('pdf 를 읽을 준비가 되지 않았습니다');
    const lib = typeof pdf.lib === 'function' ? await pdf.lib() : pdf.lib;
    const got = await readPdf(u.bytes, lib, pdf.onScanned ? (page, no) => pdf.onScanned!(page, no, u.path) : undefined);
    return { kind, lines: got.lines, pages: got.pages };
  }
  if (kind === 'hwp' || kind === 'hwpx') {
    const doc = await HwpEditDoc.open(u.bytes.slice(), wasm);
    try {
      return { kind, lines: toLines(doc.paragraphs()).map((l) => ({ text: l.text, controls: l.controls })) };
    } finally {
      doc.free();
    }
  }
  if (kind === 'docx') return { kind, lines: (await readDocText(u.bytes.slice(), 'docx')).split('\n').map((text) => ({ text, controls: 0 })) };
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(u.bytes); } catch { text = new TextDecoder('euc-kr').decode(u.bytes); }
  return { kind, lines: text.split(/\r?\n/).filter((l) => l.trim()).map((t) => ({ text: t, controls: 0 })) };
}

export interface Source {
  path: string;
  kind: SourceKind;
  bytes: Uint8Array;
}

export interface IngestReport {
  /** 읽은 규정 수 */
  read: number;
  /** 같은 규정이라 읽지 않은 파일: 고른 파일 → 나머지 */
  duplicates: { chosen: string; others: string[] }[];
  /** 규정이 아닌 것 같아 대조에서 뺀 파일 */
  notRegulation: string[];
  /** 규정에 붙인 별표·별지 파일 */
  annexFiles: { path: string; owner: string | null }[];
  failed: Skipped[];
  skipped: Skipped[];
  /** pdf 로 읽은 규정 — 쪽 수와 글자층이 없는(스캔) 쪽, 그중 읽어 낸 쪽 */
  pdf?: { path: string; pages: number; scanned: number[]; read: number[] }[];
}

export interface Ingested {
  regs: Regulation[];
  sources: Record<string, Source>;
  report: IngestReport;
}

const base = (p: string) => p.split('/').pop()!;

export async function ingest(inputs: Upload[], opts: { wasm?: InitInput; pdf?: PdfReader; onProgress?: (done: number, total: number, name: string) => void } = {}): Promise<Ingested> {
  const { files, skipped } = await expandUploads(inputs);
  const annexFiles: { path: string; owner: string | null; file: Upload }[] = [];
  const notRegulation: string[] = [];
  const cands = files.flatMap((f) => {
    const name = nameFromFile(f.path);
    const owner = annexOwner(name);
    if (owner || /^\s*별\s*[표지]/.test(name)) { annexFiles.push({ path: f.path, owner, file: f }); return []; }
    return [{ path: f.path, name, kind: KIND[ext(f.path)], date: versionDate(base(f.path)), size: f.bytes.byteLength, file: f }];
  });
  const groups = groupSame(cands);
  const regs: Regulation[] = [];
  const sources: Record<string, Source> = {};
  const failed: Skipped[] = [];
  const duplicates: IngestReport['duplicates'] = [];
  const pdfs: NonNullable<IngestReport['pdf']> = [];
  const readOk = new Map<string, number[]>();
  const pdf: PdfReader | undefined = opts.pdf && {
    lib: opts.pdf.lib,
    onScanned: opts.pdf.onScanned && (async (page, no, path) => {
      const got = await opts.pdf!.onScanned!(page, no, path);
      if (got?.length) readOk.set(path, [...(readOk.get(path) ?? []), no]);
      return got;
    }),
  };
  let done = 0;
  for (const g of groups) {
    const c = g.chosen;
    opts.onProgress?.(done++, groups.length, base(c.path));
    let lines: DocLine[];
    try {
      const got = await readLines(c.file, opts.wasm, pdf);
      lines = got.lines;
      if (got.pages) pdfs.push({ path: c.path, pages: got.pages.length, scanned: got.pages.filter((p) => p.scanned).map((p) => p.no), read: readOk.get(c.path) ?? [] });
    } catch (e) {
      failed.push({ path: c.path, why: (e as Error).message });
      continue;
    }
    const titled = nameFromText(lines);
    const name = titled ?? c.name;
    if (!REG_SUFFIX.test(normName(name))) { notRegulation.push(c.path); continue; }
    // 파일 이름은 달랐는데 본문 제목이 같은 규정 — 먼저 읽은 것을 남긴다
    const twin = regs.find((r) => sameName(r.name, name));
    if (twin) { duplicates.push({ chosen: sources[twin.key].path, others: [c.path] }); continue; }
    if (g.others.length) duplicates.push({ chosen: c.path, others: g.others.map((o) => o.path) });
    const key = `r${regs.length + 1}`;
    regs.push(parseRegulation({ key, name, fileName: base(c.path), kind: c.kind, lines }));
    sources[key] = { path: c.path, kind: c.kind, bytes: c.file.bytes };
  }
  opts.onProgress?.(groups.length, groups.length, '');
  // 따로 온 별표·별지 파일은 주인 규정의 별표 목록에 더한다
  for (const a of annexFiles) {
    const owner = a.owner ? regs.find((r) => sameName(r.name, a.owner!)) : null;
    a.owner = owner?.name ?? null;
    const m = base(a.path).match(/별\s*([표지])\s*(?:제\s*)?(\d+)/);
    if (owner && m) owner.annexes.push({ key: annexKey(`별${m[1]}`, m[2]), label: m[0], line: -1, deleted: false });
  }
  return {
    regs,
    sources,
    report: { read: regs.length, pdf: pdfs.length ? pdfs : undefined, duplicates, notRegulation, annexFiles: annexFiles.map(({ path, owner }) => ({ path, owner })), failed, skipped },
  };
}
