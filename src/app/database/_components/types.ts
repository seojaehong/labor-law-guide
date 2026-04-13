import { Scale, FileText, Landmark } from 'lucide-react';
import React from 'react';

export type TabType = 'cases' | 'admin' | 'nlrc';

export interface CaseResult {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string;
  case_type: string;
  verdict_type?: string | null;
  keywords_matched?: string[] | null;
  reason_category?: string[] | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  holding_summary?: string | null;
  holding_points?: string | null;
  url?: string;
  relevance?: number;
}

export interface AdminResult {
  id: string;
  title: string;
  doc_number: string;
  decision_date: string;
  keywords_matched?: string[] | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  holding_points?: string | null;
  url?: string;
}

export interface NlrcResult {
  id: string;
  serial_number: string;
  case_number: string;
  title: string;
  department: string;
  decision_date: string;
  case_type: string;
  decision_result: string;
  keywords_matched?: string[] | null;
  reason_category?: string[] | null;
  holding_points?: string | null;
  holding_summary?: string | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  url?: string;
  relevance?: number;
}

export interface DatabaseClientProps {
  initialTotalCases: number;
  initialTotalAdmin: number;
  initialTotalNlrc?: number;
}

export const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: 'cases', label: '판례', icon: React.createElement(Scale, { size: 16 }) },
  { key: 'admin', label: '행정해석', icon: React.createElement(FileText, { size: 16 }) },
  { key: 'nlrc', label: '노동위결정문', icon: React.createElement(Landmark, { size: 16 }) },
];

export const PAGE_SIZE = 20;
export const SEARCH_LIMIT = PAGE_SIZE * 3;

export const REASON_CATEGORY_LABELS: Record<string, string> = {
  absence: '무단결근/태만',
  workplace_bullying: '직장내괴롭힘',
  probation: '수습해고',
  incompetence: '업무능력부족',
  contract_expiry: '갱신기대권/계약만료',
  transfer: '전보/인사이동',
  violence: '폭언/폭행',
  worker_status: '근로자성',
  sexual_harassment: '성희롱',
  embezzlement: '횡령/배임',
  misconduct: '비위행위',
  redundancy: '경영상해고',
  no_dismissal: '해고부존재/사직',
  discrimination: '차별시정',
  union_activity: '부당노동행위',
  other: '기타',
};

export const SUGGESTED_KEYWORDS: Record<TabType, string[]> = {
  cases: ['사용자성', '원청', '단체교섭', '부당노동행위', '파견', '손해배상'],
  admin: ['단체교섭', '교섭창구', '부당노동행위', '파견', '손해배상', '과반수노동조합'],
  nlrc: ['부당노동행위', '단체협약', '교섭거부', '조합활동', '부당해고', '손해배상'],
};
