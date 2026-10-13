import type { ReactNode } from 'react';
import { LeaveNav } from '@/components/leave/LeaveNav';
import { WorkspaceBar } from '@/components/leave/WorkspaceBar';
import './leave.css';

export default function LeaveLayout({ children }: { children: ReactNode }) {
  return <div className="lv-shell"><LeaveNav /><details className="lv-workspace-options"><summary>사업장·명부 관리 (선택)</summary><WorkspaceBar /></details>{children}</div>;
}
