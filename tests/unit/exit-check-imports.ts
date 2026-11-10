// exit-check 사본 시험 둘(exit-check-sync·exit-check-boundary)이 함께 쓰는 가져오기 지정자 추출기.
// 동기화 스크립트(scripts/exit-check/sync-engine.mjs)와 따로 구현했다 — 둘이 어긋나면 지문 시험이 붉어진다.
//
// 잡는 꼴
//   · import … from "x" / export … from "x"  — 여러 줄에 걸친 문장의 닫는 줄 `} from "x";` 포함
//   · import "x"                              — 부수 효과 가져오기
//   · import("x") / require("x")              — 동적 가져오기. 인자가 글자 하나일 때만(계산식은 못 푼다)
// 문장 시작(파일 처음, 줄바꿈, ; 뒤)에서만 import/export 를 본다. 그래서 // 주석 줄과 "a.js" 같은 문자열은 걸리지 않는다.

import { posix } from 'node:path';

export interface ImportRef {
  spec: string;
  /** import type … / export type … 문장. 컴파일하면 지워져 실행 코드를 끌어오지 않는다. */
  typeOnly: boolean;
  kind: 'static' | 'side-effect' | 'dynamic' | 'require';
}

const STATIC = /(?:^|[\n;])[ \t]*(?:import|export)[ \t]+(type[ \t]+)?[^;'"`]*?\bfrom[ \t]*(['"])([^'"\n]+)\2/g;
const SIDE_EFFECT = /(?:^|[\n;])[ \t]*import[ \t]*(['"])([^'"\n]+)\1/g;
const DYNAMIC = /\bimport[ \t]*\([ \t\r\n]*(['"`])([^'"`$\n]+)\1[ \t\r\n]*[,)]/g;
const REQUIRE = /\brequire[ \t]*\([ \t\r\n]*(['"`])([^'"`$\n]+)\1[ \t\r\n]*\)/g;

export function importRefs(source: string): ImportRef[] {
  const text = source.replace(/\r/g, '');
  const out: ImportRef[] = [];
  for (const m of text.matchAll(STATIC)) out.push({ spec: m[3]!, typeOnly: Boolean(m[1]), kind: 'static' });
  for (const m of text.matchAll(SIDE_EFFECT)) out.push({ spec: m[2]!, typeOnly: false, kind: 'side-effect' });
  for (const m of text.matchAll(DYNAMIC)) out.push({ spec: m[2]!, typeOnly: false, kind: 'dynamic' });
  for (const m of text.matchAll(REQUIRE)) out.push({ spec: m[2]!, typeOnly: false, kind: 'require' });
  return out;
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
