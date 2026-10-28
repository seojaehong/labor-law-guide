import {
  checkMinWage,
  calcOrdinaryWage,
  calcOvertime,
  calcSeverance,
  lookupLawArticle,
} from '@/lib/labor-calc';
import { searchBlogTool, suggestCaseAnalyzerTool } from './handlers';

// 계산 엔진은 날짜 형식·순서가 틀리면 던진다. 여기서 받아 { error } 로 돌려줘야 모델이 사용자에게 되묻는다
// (던진 채로 두면 챗 스트림 전체가 「답변 생성 실패」로 끝난다).
export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    return await runTool(name, args);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'calc_severance':
      return calcSeverance(args as Parameters<typeof calcSeverance>[0]);
    case 'calc_ordinary_wage':
      return calcOrdinaryWage(args as Parameters<typeof calcOrdinaryWage>[0]);
    case 'calc_overtime':
      return calcOvertime(args as Parameters<typeof calcOvertime>[0]);
    case 'check_min_wage':
      return checkMinWage(args as Parameters<typeof checkMinWage>[0]);
    case 'lookup_law_article':
      return await lookupLawArticle(args as Parameters<typeof lookupLawArticle>[0]);
    case 'search_blog':
      return await searchBlogTool(args as { query: string; category?: string; limit?: number });
    case 'suggest_case_analyzer':
      return suggestCaseAnalyzerTool(args as { dispute_summary: string });
    default:
      return { error: `unknown tool: ${name}` };
  }
}
