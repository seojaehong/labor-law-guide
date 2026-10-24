'use client';
// 읽은 결과 — 무엇을 읽었고 무엇을 읽지 않았는지 먼저 보여 준다. 빠진 규정이 있으면 확인 전에 알아야 한다.
import { CircleAlert, FileCheck2 } from 'lucide-react';
import type { Workspace } from '@/lib/rules-review/workspace';

const base = (p: string) => p.split('/').pop()!;

export default function ReadReport({ ws, onStart }: { ws: Workspace; onStart: () => void }) {
  const { report } = ws;
  const counts = (name: string) => ws.findings.filter((f) => f.reg === name).length;
  const notRead = report.skipped.length + report.failed.length + report.notRegulation.length;
  return (
    <section aria-labelledby="rr-read">
      <div className="rr-head-row">
        <h2 id="rr-read" className="rr-h2"><FileCheck2 size={20} aria-hidden /> 규정 {ws.regs.length}개를 읽었습니다</h2>
        <button className="rr-btn" onClick={onStart}>확인 시작 — 항목 {ws.findings.length}건</button>
      </div>
      <p className="rr-mute">아래 목록에 빠진 규정이 있으면 그 파일을 더해 「규정 묶음 다시 올리기」로 함께 올리세요. 규정끼리 맞춰 보는 것이라 빠진 규정이 있으면 그 규정을 부르는 곳이 「묶음에 없는 규정」으로 걸립니다.</p>

      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>규정</th><th>조문</th><th>별표·서식</th><th>최근 개정</th><th>소관 부서</th><th>걸린 곳</th><th>읽은 파일</th></tr></thead>
          <tbody>
            {ws.regs.map((r) => (
              <tr key={r.key}>
                <td><b>{r.name}</b></td>
                <td>{r.articles.length}</td>
                <td>{r.annexes.length || '-'}</td>
                <td>{r.meta.amended ?? '-'}</td>
                <td>{ws.depts[r.name] ?? '-'}</td>
                <td>{counts(r.name)}</td>
                <td className="rr-file">{r.fileName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.duplicates.length > 0 && (
        <details className="rr-details">
          <summary>같은 규정이라 하나만 읽은 파일 {report.duplicates.reduce((n, d) => n + d.others.length, 0)}개</summary>
          <p className="rr-mute">이름이 같은 규정이 여러 파일이면 날짜가 늦은 판, 그다음 hwpx·hwp 순으로 하나만 읽습니다.</p>
          <ul>{report.duplicates.map((d, i) => <li key={`${d.chosen}-${i}`}>읽음 <b>{base(d.chosen)}</b> — 읽지 않음 {d.others.map(base).join(', ')}</li>)}</ul>
        </details>
      )}
      {notRead > 0 && (
        <details className="rr-details" open={report.failed.length > 0}>
          <summary><CircleAlert size={15} aria-hidden /> 읽지 않은 파일 {notRead}개</summary>
          <ul>
            {report.failed.map((s, i) => <li key={`f-${s.path}-${i}`}><b>{base(s.path)}</b> — 읽지 못함: {s.why}</li>)}
            {report.notRegulation.map((p, i) => <li key={`n-${p}-${i}`}><b>{base(p)}</b> — 이름이 규정(○○규정·세칙·정관 등) 같지 않아 대조에서 뺐습니다</li>)}
            {report.skipped.map((s, i) => <li key={`s-${s.path}-${i}`}><b>{base(s.path)}</b> — {s.why}</li>)}
          </ul>
        </details>
      )}
      {report.annexFiles.length > 0 && (
        <details className="rr-details">
          <summary>따로 온 별표·서식 파일 {report.annexFiles.length}개</summary>
          <ul>{report.annexFiles.map((a, i) => <li key={`a-${a.path}-${i}`}><b>{base(a.path)}</b> — {a.owner ? `「${a.owner}」에 붙였습니다` : '붙일 규정을 찾지 못했습니다'}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
