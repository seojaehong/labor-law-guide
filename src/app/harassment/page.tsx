"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/decisions-ui/card";
import { Badge } from "@/components/decisions-ui/badge";
import { Button } from "@/components/decisions-ui/button";
import { supabase } from "@/lib/supabase";
import { stripMarkdownFormatting } from "@/lib/format-holding";
import {
  LEGAL_FOCUS_LABELS as BASE_LEGAL_FOCUS_LABELS,
  DISPOSITION_TYPE_LABELS as BASE_DISPOSITION_LABELS,
} from "@/lib/types";
import Link from "next/link";

const PAGE_SIZE = 20;

type LegalFocusFilter = string;

// 괴롭힘/성희롱 페이지 추가 토큰 (한글 합성 키 + 한글 처분 키)
const LEGAL_FOCUS_LABELS: Record<string, string> = {
  ...BASE_LEGAL_FOCUS_LABELS,
  all: "전체",
  "성립_인정": "성립 인정",
  "성립_부인": "성립 부인",
  "징계_정당": "징계 정당",
  "징계_과중": "징계 과중",
  "절차하자": "절차 하자",
};

const DISPOSITION_LABELS: Record<string, string> = {
  ...BASE_DISPOSITION_LABELS,
  "폭언": "폭언",
  "폭력": "폭력",
  "따돌림": "따돌림·배제",
  "성적_언행": "성적 언행",
  "갑질": "갑질",
  "협박": "협박",
  "업무_배제": "업무 배제",
};

// 주요 legal_focus 필터 옵션 (데이터에 실제 존재하는 것)
const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "just_cause", label: "정당한 사유" },
  { value: "proportionality", label: "비례원칙" },
  { value: "procedural_due_process", label: "절차적 정당성" },
  { value: "성립_인정", label: "성립 인정" },
  { value: "징계_정당", label: "징계 정당" },
  { value: "징계_과중", label: "징계 과중" },
];

interface Case {
  id: string;
  title: string;
  case_number: string | null;
  department: string | null;
  decision_date: string | null;
  decision_result: string | null;
  holding_summary: string | null;
  legal_focus: string[] | null;
  disposition_type: string[] | null;
  tier_subcategory: string | null;
}

function getDisplayCaseNumber(caseNumber?: string | null): string {
  if (!caseNumber) return "";
  return /^id_/i.test(caseNumber) ? "" : caseNumber;
}

function getPreview(summary: string | null): string {
  if (!summary) return "";
  const clean = stripMarkdownFormatting(summary);
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

function getLabelFor(key: string, map: Record<string, string>): string {
  return map[key] || key.replace(/_/g, " ");
}

export default function HarassmentPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [legalFocus, setLegalFocus] = useState<LegalFocusFilter>("all");

  useEffect(() => {
    setPage(0);
  }, [legalFocus]);

  useEffect(() => {
    fetchCases();
  }, [page, legalFocus]);

  async function fetchCases() {
    setLoading(true);
    try {
      let query = supabase
        .from("nlrc_decisions")
        .select(
          "id, title, case_number, department, decision_date, decision_result, holding_summary, legal_focus, disposition_type, tier_subcategory",
          { count: "exact" }
        )
        .eq("issue_type_primary", "workplace_harassment")
        .order("decision_date", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (legalFocus !== "all") {
        query = query.contains("legal_focus", [legalFocus]);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setCases(data || []);
      setTotal(count || 0);
    } catch (err) {
      console.error("fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">직장 내 괴롭힘·성희롱 판례</h1>
        <p className="text-muted-foreground text-sm mt-1">
          노동위원회·법원 판정례를 AI로 분류한 {total.toLocaleString()}건
        </p>
      </div>

      {/* 법적 쟁점 필터 */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={legalFocus === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setLegalFocus(opt.value)}
              className="text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          불러오는 중...
        </div>
      )}

      {/* 판례 목록 */}
      {!loading && cases.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          해당 조건의 판례가 없습니다.
        </div>
      )}

      {!loading && cases.map((item) => {
        const caseNum = getDisplayCaseNumber(item.case_number);
        const validDispositions = item.disposition_type?.filter(
          (d) => d !== "불명"
        ) || [];
        const validLegalFocus = item.legal_focus?.filter(
          (f) => f !== "불명"
        ) || [];

        return (
          <Link key={item.id} href={`/decisions/${item.id}?source=nlrc`}>
            <Card className="p-4 hover:border-primary transition-colors cursor-pointer mb-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-medium text-sm line-clamp-2 flex-1">
                    {item.title}
                  </h3>
                </div>

                <p className="text-xs text-muted-foreground">
                  {item.department || "-"} | {item.decision_date || "-"}
                </p>

                {caseNum && (
                  <p className="text-xs font-semibold text-foreground">
                    사건번호: {caseNum}
                  </p>
                )}

                {item.holding_summary && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {getPreview(item.holding_summary)}
                  </p>
                )}

                {/* 태깅 배지 */}
                {(validDispositions.length > 0 || validLegalFocus.length > 0) && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {validDispositions.map((d) => (
                      <Badge key={d} className="text-[10px]">
                        {getLabelFor(d, DISPOSITION_LABELS)}
                      </Badge>
                    ))}
                    {validLegalFocus.map((f) => (
                      <Badge key={f} variant="outline" className="text-[10px]">
                        {getLabelFor(f, LEGAL_FOCUS_LABELS)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        );
      })}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
