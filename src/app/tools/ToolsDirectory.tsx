'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight, BellRing, BookOpen, Building2, CalendarCheck, CalendarDays, CalendarRange, CirclePause,
  ClipboardList, Coins, FilePen, FilePenLine, FileSearch, FileSpreadsheet, FileText, Files, Gauge, Landmark,
  ListChecks, MailWarning, Percent, Phone, PiggyBank, Receipt, ReceiptText, Scale, Search, Sun, Timer, Users, Wallet,
} from 'lucide-react';
import { groupedTools, searchTools, TOOL_GROUPS, type IndexedTool, type ToolGlyph } from '@/content/tools-groups';
import './tools-directory.css';

const GLYPHS: Record<ToolGlyph, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  building: Building2, users: Users, 'file-search': FileSearch, 'file-pen': FilePen, scale: Scale,
  gauge: Gauge, 'calendar-days': CalendarDays, wallet: Wallet, 'receipt-text': ReceiptText, 'calendar-range': CalendarRange,
  'list-checks': ListChecks, receipt: Receipt, pause: CirclePause,
  'calendar-check': CalendarCheck, bell: BellRing, percent: Percent, sun: Sun, coins: Coins,
  'piggy-bank': PiggyBank, landmark: Landmark, spreadsheet: FileSpreadsheet, 'mail-warning': MailWarning, arrows: ArrowLeftRight, timer: Timer,
  phone: Phone, clipboard: ClipboardList,
  'file-text': FileText, 'file-pen-line': FilePenLine, book: BookOpen, files: Files,
};

function ToolItem({ t }: { t: IndexedTool }) {
  const Icon = GLYPHS[t.glyph];
  const body = (
    <>
      <span className="tools-dir__icon"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="tools-dir__text">
        <span className="tools-dir__title">{t.title}</span>
        <span className="tools-dir__summary">{t.summary}</span>
        <span className={t.badge === 'NEW' ? 'tools-dir__badge tools-dir__badge--new' : 'tools-dir__badge'}>{t.badge}</span>
      </span>
    </>
  );
  return (
    <li>
      {t.external ? (
        <a className="tools-dir__item" href={t.href}>{body}</a>
      ) : (
        <Link className="tools-dir__item" href={t.href}>{body}</Link>
      )}
    </li>
  );
}

export default function ToolsDirectory() {
  const [q, setQ] = useState('');
  const query = q.trim();
  const hits = query ? searchTools(query) : [];

  return (
    <div className="tools-dir">
      <div className="tools-dir__finder">
        <label htmlFor="tools-search" className="tools-dir__label">도구 찾기</label>
        <div className="tools-dir__search">
          <Search className="h-4 w-4" aria-hidden />
          <input
            id="tools-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="퇴직금, 주휴수당, 4대보험처럼 짧게"
            autoComplete="off"
          />
        </div>
        {!query && (
          <nav className="tools-dir__jump" aria-label="상황별 묶음">
            {groupedTools().map((g) => (
              <a key={g.id} href={`#${g.id}`}>{g.label}<span>{g.tools.length}</span></a>
            ))}
          </nav>
        )}
      </div>

      {query ? (
        <section aria-labelledby="tools-search-result">
          <h2 id="tools-search-result" className="tools-dir__group-title" aria-live="polite">
            {hits.length > 0 ? `「${query}」 도구 ${hits.length}개` : `「${query}」에 맞는 도구가 없습니다`}
          </h2>
          {hits.length > 0 ? (
            <ul className="tools-dir__grid">{hits.map((t) => <ToolItem key={t.href} t={t} />)}</ul>
          ) : (
            <p className="tools-dir__empty">
              낱말을 줄여 보거나, <button type="button" onClick={() => setQ('')}>검색을 지우고</button>{' '}
              {TOOL_GROUPS.length}개 묶음에서 고르세요.
            </p>
          )}
        </section>
      ) : (
        groupedTools().map((g) => (
          <section key={g.id} id={g.id} className="tools-dir__group" aria-labelledby={`${g.id}-title`}>
            <div className="tools-dir__group-head">
              <h2 id={`${g.id}-title`} className="tools-dir__group-title">{g.label}</h2>
              <p>{g.hint}</p>
            </div>
            <ul className="tools-dir__grid">{g.tools.map((t) => <ToolItem key={t.href} t={t} />)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
