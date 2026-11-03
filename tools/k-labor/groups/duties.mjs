// duties 묶음 — 사업장 규모별 사업주 의무(사이트 /duties). 자료 src/content/duties-data, 고르는 규칙 src/lib/duties(화면과 같은 함수).
// 상시 근로자 수 하나만 받고 묶은 자료로 답한다. 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다(dutiesRemoteSafe).
import { z } from 'zod';
import { CHECKED, COUNT_RULES, GROUPS, SOURCES, TIERS } from '@/content/duties-data';
import { dutiesAt, howAt } from '@/lib/duties';
import { tierFor } from '@/lib/workplace-lookup';
import { text } from '../lib/common.mjs';

export const dutiesTools = ['list_employer_duties'];
/** 원격(HTTP)판에 실어도 되는 도구 — 전부 */
export const dutiesRemoteSafe = [...dutiesTools];

const SITE = 'https://yellowenvelope.kr';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const tierOf = (min) => {
  const t = TIERS.find((x) => x.min === min);
  return { min: t.min, label: t.label, note: t.note };
};
const fromLabel = (min) => (min === 1 ? '규모 무관' : `${min}명 이상부터`);

export function registerDuties(server) {
  server.registerTool(
    'list_employer_duties',
    {
      title: '사업장 규모별 사업주 의무',
      description:
        `상시 근로자 수를 넣으면 그 규모(1~4명·5~9명·10~29명·30~49명·50명 이상)에서 지킬 노동법 의무·법정 의무교육과 위반 시 제재를 돌려준다(사이트 /duties 와 같은 자료, 법제처 현행 법령 원문 ${CHECKED} 확인). ` +
        '이 규모부터 새로 생기는 의무, 다음 규모가 되면 더 생기거나 방법이 바뀌는 의무도 함께 준다. 상시 근로자 수를 날짜별로 세려면 count_regular_workers 를 쓴다. 일반 기준을 정리한 참고 자료이고 업종·고용형태에 따라 달라질 수 있다.',
      inputSchema: {
        headcount: z.number().int().min(0).describe('상시 근로자 수(근로기준법 시행령 제7조의2로 센 수)'),
        group: z.enum(GROUPS).optional().describe(`분야 하나만 볼 때 — ${GROUPS.join(' · ')}`),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      const tier = tierFor(a.headcount);
      const at = dutiesAt(tier);
      const item = (d) => {
        const how = howAt(d, tier);
        return {
          id: d.id, group: d.group, title: d.title, basis: d.basis, what: d.what,
          ...(how ? { how } : {}), ...(d.cond ? { cond: d.cond } : {}),
          from: d.min === tier && tier !== 1 ? '이 규모부터' : fromLabel(d.min),
          penalty: d.penalty,
        };
      };
      const t = tierOf(tier);
      return text({
        ok: true,
        headcount: a.headcount,
        tier: t,
        headline: [
          `상시 근로자 ${t.label} 사업장의 사업주 의무는 ${at.applies.length}개입니다.`,
          tier === 1
            ? '근로기준법은 일부만 적용되지만, 근로계약서·최저임금·퇴직금·의무교육은 그대로입니다.'
            : `${t.label} 사업장부터 새로 생기는 의무는 ${at.fresh.length}개입니다.`,
        ],
        count: at.applies.length,
        educationCount: at.applies.filter((d) => d.group === '의무교육').length,
        conditionalCount: at.applies.filter((d) => d.cond).length,
        newAtThisTier: at.fresh.map((d) => d.title),
        howChangedAtThisTier: at.changedHere.map((d) => d.title),
        duties: at.applies.filter((d) => !a.group || d.group === a.group).map(item),
        next: at.nextMin
          ? { tier: tierOf(at.nextMin), upcoming: at.upcoming.map((d) => ({ title: d.title, basis: d.basis })), howChanges: at.changedHow.map((d) => ({ title: d.title, how: d.by?.[at.nextMin] })) }
          : null,
        countRules: COUNT_RULES,
        notice: '벌칙은 법정 상한이며, 실제 부과액은 위반 정도와 시행령 부과기준에 따라 달라집니다. 일반 기준을 정리한 참고 자료라 업종·고용형태에 따라 달라질 수 있으니 원문과 함께 확인합니다.',
        checked: CHECKED,
        sources: SOURCES,
        site: `${SITE}/duties?size=${tier}`,
      });
    },
  );
}
