// exit-check 사본 시험 둘(exit-check-sync·exit-check-boundary)이 함께 쓰는 가져오기 지정자 추출기.
// 동기화 스크립트(scripts/exit-check/sync-engine.mjs)와 따로 구현했다 — 둘이 어긋나면 지문 시험이 붉어진다.
//
// 잡는 꼴
//   · import … from "x" / export … from "x"  — 여러 줄에 걸친 문장의 닫는 줄 `} from "x";`, import type 포함
//   · import "x"                              — 부수 효과 가져오기
//   · import("x") / require("x")              — 동적 가져오기. 인자가 글자 하나일 때만(계산식은 못 푼다)
// 문장 시작(파일 처음, 줄바꿈, ; 뒤)에서만 import/export 를 본다. 그래서 // 주석 줄과 "a.js" 같은 문자열은 걸리지 않는다.
// 원문과 「주석을 공백으로 지운 글」 두 벌에서 뽑아 합친다. 지운 글은 import(/* … */ "x") 와 여러 줄 문장 안의
// 따옴표 든 주석(// don't …)을 잡고, 원문은 지우기가 정규식 리터럴 안의 따옴표·역따옴표에 속을 때를 받친다.

import { posix } from 'node:path';

export interface ImportRef {
  spec: string;
  kind: 'static' | 'side-effect' | 'dynamic' | 'require';
}

const STATIC = /(?:^|[\n;])[ \t]*(?:import|export)[ \t]+[^;'"`]*?\bfrom[ \t]*(['"])([^'"\n]+)\1/g;
const SIDE_EFFECT = /(?:^|[\n;])[ \t]*import[ \t]*(['"])([^'"\n]+)\1/g;
const DYNAMIC = /\bimport[ \t]*\(\s*(['"`])([^'"`$\n]+)\1\s*[,)]/g;
const REQUIRE = /\brequire[ \t]*\(\s*(['"`])([^'"`$\n]+)\1\s*\)/g;

/** 주석을 공백으로 바꾼다(줄바꿈은 남긴다). 따옴표 문자열은 건너뛰고, '…'·"…" 는 줄 끝에서 끊는다. */
export function blankComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      out += ' '.repeat(end - i);
      i = end;
    } else if (c === '/' && d === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      out += text.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 1, text.length);
      out += text.slice(i, end);
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function extract(text: string): ImportRef[] {
  const out: ImportRef[] = [];
  for (const m of text.matchAll(STATIC)) out.push({ spec: m[2]!, kind: 'static' });
  for (const m of text.matchAll(SIDE_EFFECT)) out.push({ spec: m[2]!, kind: 'side-effect' });
  for (const m of text.matchAll(DYNAMIC)) out.push({ spec: m[2]!, kind: 'dynamic' });
  for (const m of text.matchAll(REQUIRE)) out.push({ spec: m[2]!, kind: 'require' });
  return out;
}

export function importRefs(source: string): ImportRef[] {
  const text = source.replace(/\r/g, '');
  const seen = new Map<string, ImportRef>();
  for (const r of [...extract(text), ...extract(blankComments(text))]) seen.set(`${r.kind} ${r.spec}`, r);
  return [...seen.values()];
}

/** 사이트 저장소 기준 경로(posix, 예: src/app/x/page.tsx)에서 지정자를 저장소 경로로 푼다. 패키지면 null. */
export function resolveSiteSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@/')) return posix.normalize(`src/${spec.slice(2)}`);
  if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
    return posix.normalize(posix.join(posix.dirname(fromFile), spec));
  }
  return null;
}

/** p 가 dir 자체이거나 그 아래인가. 「exit-check-demo」처럼 앞부분만 같은 폴더는 아니다. */
export function isInside(p: string, dir: string): boolean {
  return p === dir || p.startsWith(`${dir}/`);
}
