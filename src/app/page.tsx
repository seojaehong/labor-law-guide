"use client";

import { useState, useMemo } from "react";
import data1 from "@/data/개정_노동조합법_해석지침_perfect.json";
import data2 from "@/data/원·하청_상생_교섭절차_매뉴얼_perfect.json";
import { Search, Book, FileText, ChevronLeft, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const documents = [data1, data2];

export default function DocumentViewer() {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeDoc = documents[activeDocIndex];

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return activeDoc.sections;
    const q = searchQuery.toLowerCase();
    return activeDoc.sections.filter(
      (section: { header: string; content: string }) =>
        section.header.toLowerCase().includes(q) ||
        section.content.toLowerCase().includes(q)
    );
  }, [activeDoc, searchQuery]);

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-[280px]" : "w-0"
        } transition-all duration-300 overflow-hidden border-r border-stone-200 bg-white flex flex-col shrink-0`}
      >
        <div className="p-5 border-b border-stone-100">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 bg-blue-600 text-white rounded-lg">
              <Book size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-900 tracking-tight">
                노동법 가이드
              </h1>
              <p className="text-[11px] text-stone-400 tracking-wide">
                Labor Law Reference
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest px-3 mb-2">
            Documents
          </p>
          {documents.map((doc, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveDocIndex(idx);
                setSearchQuery("");
              }}
              className={`w-full text-left p-3 rounded-lg transition-all duration-200 flex items-start gap-3 mb-1 ${
                activeDocIndex === idx
                  ? "bg-blue-50 border border-blue-200 text-blue-900"
                  : "hover:bg-stone-50 border border-transparent text-stone-600 hover:text-stone-800"
              }`}
            >
              <FileText
                size={16}
                className={`mt-0.5 shrink-0 ${
                  activeDocIndex === idx
                    ? "text-blue-600"
                    : "text-stone-400"
                }`}
              />
              <div className="min-w-0">
                <h3 className="font-medium text-[13px] leading-snug">
                  {doc.title}
                </h3>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {doc.tags.slice(0, 2).map((tag: string, i: number) => (
                    <span
                      key={i}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        activeDocIndex === idx
                          ? "bg-blue-100 text-blue-700"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-stone-100 text-[11px] text-stone-400 text-center">
          {activeDoc.sections.length}개 섹션 · AI-Ready
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500 transition-colors"
            title={sidebarOpen ? "사이드바 접기" : "사이드바 열기"}
          >
            <ChevronLeft
              size={18}
              className={`transition-transform duration-300 ${
                sidebarOpen ? "" : "rotate-180"
              }`}
            />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-stone-900 truncate">
              {activeDoc.title}
            </h2>
          </div>

          <a
            href={activeDoc.source}
            target="_blank"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline shrink-0"
          >
            원문 보기 <ExternalLink size={12} />
          </a>
        </header>

        {/* Search */}
        <div className="px-6 py-3 bg-white border-b border-stone-100">
          <div className="relative max-w-2xl">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              size={16}
            />
            <Input
              type="text"
              placeholder="검색어 입력 (장, 절, 조문, 키워드...)"
              className="pl-9 pr-4 py-2 bg-stone-50 border-stone-200 text-sm rounded-lg focus-visible:ring-blue-500/30 focus-visible:border-blue-300 text-stone-800 placeholder:text-stone-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-400">
                {filteredSections.length}건
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-6 max-w-4xl">
            {filteredSections.length > 0 ? (
              <Accordion
                type="multiple"
                className="w-full space-y-2"
                defaultValue={filteredSections
                  .slice(0, 1)
                  .map((_: { header: string; content: string }, i: number) => `item-${i}`)}
              >
                {filteredSections.map((section: { header: string; content: string }, idx: number) => (
                  <AccordionItem
                    value={`item-${idx}`}
                    key={idx}
                    className="border border-stone-200 bg-white rounded-lg overflow-hidden data-[state=open]:border-blue-300 data-[state=open]:shadow-sm"
                  >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-stone-50 transition-colors text-left">
                      <span className="font-semibold text-[15px] text-stone-800">
                        {section.header}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-5 pb-6 pt-1">
                      <div className="text-stone-700 leading-[1.85] text-[14.5px] whitespace-pre-wrap break-words">
                        {section.content}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-stone-400">
                <Search size={40} className="mb-4 text-stone-300" />
                <p className="text-base font-medium text-stone-600 mb-1">
                  &ldquo;{searchQuery}&rdquo; 검색 결과 없음
                </p>
                <p className="text-sm text-stone-400 mb-4">
                  다른 키워드로 검색해보세요
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="px-4 py-2 text-sm bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
