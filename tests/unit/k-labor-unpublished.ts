// 저장소에는 있지만 아직 npm 에 게시하지 않은 k-labor 도구(묶음별).
// 공개 안내(public/howto/k-labor · src/content/ai-tools.ts)는 게시판 기준이라, 시험이 이 이름들을 빼고 센다.
// 게시하면서 안내 페이지를 고칠 때 여기서 지운다.
import { officeTools } from '../../tools/k-labor/groups/office.mjs';

export const UNPUBLISHED: Record<string, string[]> = {
  office: [...officeTools],
  docs: ['stamp_exhibit_pdf'], // 호증 날인(261124), 미게시
  calc: ['calc_childcare_reduction_pay'], // 육아기 근로시간 단축 급여·장려금(261127), 미게시
  law: ['get_law_articles'], // 조문 원문 여러 개(261127), 미게시
};

export const unpublishedNames = (): string[] => Object.values(UNPUBLISHED).flat();
