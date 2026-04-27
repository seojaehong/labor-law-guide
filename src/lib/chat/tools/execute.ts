import {
  checkMinWage,
  calcOrdinaryWage,
  calcOvertime,
  calcSeverance,
  lookupLawArticle,
} from '@/lib/labor-calc';
import { searchBlogTool, suggestCaseAnalyzerTool } from './handlers';

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
