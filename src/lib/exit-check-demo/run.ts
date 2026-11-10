// 퇴사 자료 대조 — 합성 예시 실행 입구(계획 조각 2).
// 엔진 사본(src/lib/exit-check)의 실행 코드를 부르는 곳은 이 파일뿐이고, 내보내기는 runScenario·SCENARIO_IDS 둘이다.
// 받는 것은 예시 id 하나다. 바이트·파일·문자열을 받는 내보내기는 두지 않는다 — 업로드를 여는 일은 별도 PR 이다.
// 표본(./samples)의 파일 바이트와 manifest 가 허용목록(./allowlist — 표본과 따로 둔 생성 상수)의 해시와 같고,
// manifest 가 표본 파일 밖의 입력(직접 입력 행 등)을 갖지 않으며, 합성 자료로 표시돼 있을 때만 엔진을 부른다.
// 표본·허용목록은 깊게 얼려 있어 실행 중에 바꿀 수 없고, 둘을 가져오는 곳은 이 파일뿐이다(시험이 본다).
// 가드 가운데 일부는 겹친다(목록 비교 ↔ 해시 조회, synthetic 두 번) — 하나가 빠져도 다른 하나가 막도록 일부러 둔다.

import { prepareFromManifest, type RunManifest } from '@/lib/exit-check/config';
import { canonicalSha256 } from '@/lib/exit-check/core/canonical';
import { runCore, type CoreReport } from '@/lib/exit-check/core/run';
import { fileHashRef } from '@/lib/exit-check/core/sha256';
import type { DeadlineRulesFile } from '@/lib/exit-check/core/types';
import deadlineRules from '@/lib/exit-check/deadline-rules.json';
import { SAMPLE_ALLOWLIST } from './allowlist';
import { DEMO_SAMPLES } from './samples';

export const SCENARIO_IDS = Object.freeze(['S01', 'S03'] as const);
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioRun {
  id: ScenarioId;
  core_report: CoreReport;
  core_report_sha256: string;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export async function runScenario(id: ScenarioId): Promise<ScenarioRun> {
  if (!(SCENARIO_IDS as readonly string[]).includes(id) || !own(DEMO_SAMPLES, id) || !own(SAMPLE_ALLOWLIST, id)) {
    throw new Error('목록에 없는 예시 id 입니다.');
  }
  const sample = DEMO_SAMPLES[id]!;
  const allow = SAMPLE_ALLOWLIST[id]!;

  const allowed = Object.keys(allow.files).sort();
  const given = Object.keys(sample.files).sort();
  if (allowed.length !== given.length || allowed.some((p, i) => p !== given[i])) {
    throw new Error('예시 파일 목록이 허용목록과 다릅니다.');
  }
  const files = new Map<string, Uint8Array>();
  for (const p of given) {
    const bytes = new TextEncoder().encode(sample.files[p]!.join('\n'));
    if (fileHashRef(bytes) !== allow.files[p]) throw new Error('예시 파일 바이트가 허용목록 해시와 다릅니다.');
    files.set(p, bytes);
  }
  const manifest = sample.manifest as unknown as RunManifest;
  for (const input of manifest.inputs ?? []) {
    if (input.inline_rows !== undefined || input.path === null || !own(allow.files, input.path)) {
      throw new Error('예시 manifest 의 입력이 허용목록 밖에 있습니다.');
    }
  }
  if (manifest.synthetic !== true || typeof manifest.cutoff_at !== 'string') {
    throw new Error('합성 자료 표시가 없는 예시는 돌리지 않습니다.');
  }
  if (canonicalSha256(manifest) !== allow.manifest) throw new Error('예시 manifest 가 허용목록 해시와 다릅니다.');

  const prepared = await prepareFromManifest({
    manifest,
    cutoff_at: manifest.cutoff_at,
    files,
    deadline_rules: deadlineRules as DeadlineRulesFile,
  });
  if (prepared.synthetic !== true) throw new Error('합성 자료 표시가 없는 예시는 돌리지 않습니다.');

  const run = runCore(prepared.core);
  return { id, core_report: run.core_report, core_report_sha256: run.core_report_sha256 };
}
