import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/decisions-ui/badge";
import { Card } from "@/components/decisions-ui/card";
import { Separator } from "@/components/decisions-ui/separator";
import {
  REASON_LABELS,
  RESULT_LABELS,
  SANCTION_LABELS,
  LEGAL_FOCUS_LABELS,
  DISPOSITION_TYPE_LABELS,
  type ReasonCategory,
  type DecisionResult,
  type SanctionType,
} from "@/lib/types";
import { parseHoldingText, stripMarkdownFormatting } from "@/lib/format-holding";
import { getDecisionSourceLabel, resolveDecisionSourceContract, type DecisionSourceProvider } from "@/lib/search/source-contracts";
import { cn } from "@/lib/utils";
import Link from "next/link";

// AI 분류 라벨 fallback: 미매핑 영문은 underscore→space로 보정
function getAiLabel(key: string, map: Record<string, string>): string {
  return map[key] || key.replace(/_/g, " ");
}

function getDisplayCaseNumber(caseNumber?: string | null) {
  if (!caseNumber) return "";
  return /^id_/i.test(caseNumber) ? "" : caseNumber;
}

// BigCase 페이월/네비게이션 페이지가 full_text_raw에 통째 저장된 케이스 감지.
// 키워드는 사용자가 실제로 본 페이월 페이지(bc_0004c925)에서 추출.
function isPaywallText(text: string): boolean {
  if (!text) return false;
  const signals = [
    "콘텐츠 이용량이 많아",
    "서비스 접속이 원활하지 않",
    "친구초대 30,000P",
    "MY빅케이스",
    "Law&Company Co., Ltd",
    "(C) Law",
    "슈퍼로이어",
    "로톡뉴스",
  ];
  return signals.some((s) => text.includes(s));
}

// data ingestion 단계에서 Python list[dict]를 str()로 저장한 row가 2,774건 존재.
// 본문이 "{'item': '사건', 'content': '...'}\n{'item': '원고', ...}" 형식으로 노출되는 사용자 가시 버그.
// 데이터 cleanup 전까지 frontend에서 거부 + 다음 row로 폴백.
function isPyReprText(text: string): boolean {
  if (!text) return false;
  return text.includes("'item':") && text.includes("'content':");
}

// holding_summary가 ingestion에서 "{원본}\n\n쟁점: X\n판단: Y" 형태로 저장되며
// X/Y가 동일하거나 원본과 prefix 동일한 케이스(8,271건/14%)가 다수.
// 같은 텍스트 중복 노출 방지를 위해 정규화 — 쟁점=판단이면 한 번만, intro와 같으면 intro만.
function normalizeHoldingSummary(rawSummary: string): string {
  if (!rawSummary) return "";
  const text = rawSummary.trim();
  const match = text.match(/^([\s\S]*?)\n+쟁점:\s*([\s\S]*?)\n+판단:\s*([\s\S]*)$/);
  if (!match) return text;

  const intro = match[1].trim();
  const issue = match[2].trim();
  const judgment = match[3].trim();

  // 쟁점 ≈ 판단 (정확히 같거나 한쪽이 다른 쪽 prefix)
  const issueEqJudgment =
    issue === judgment ||
    (issue.length > 20 && judgment.startsWith(issue.slice(0, Math.min(issue.length, 80)))) ||
    (judgment.length > 20 && issue.startsWith(judgment.slice(0, Math.min(judgment.length, 80))));
  const introEqIssue =
    intro === issue ||
    (intro.length > 0 && issue.startsWith(intro)) ||
    (intro.length > 0 && intro.startsWith(issue));

  if (issueEqJudgment && introEqIssue) return intro || issue;
  if (issueEqJudgment) {
    const longer = issue.length >= judgment.length ? issue : judgment;
    return intro ? `${intro}\n\n${longer}` : longer;
  }
  if (introEqIssue) return `${intro || issue}\n\n판단\n${judgment}`;
  return `${intro}\n\n쟁점\n${issue}\n\n판단\n${judgment}`.trim();
}

function getSourceStatusLabel(hasDetailedHoldingPoints: boolean, hasHoldingPoints: boolean) {
  if (hasDetailedHoldingPoints) return "서비스 내 추출 원문 제공";
  if (hasHoldingPoints) return "추출 원문 일부 제공";
  return "서비스 내 정리본 제공";
}

function getSummaryLabel(source: DecisionSourceProvider) {
  return source === "bigcase" || source === "lawgo" ? "판결요지" : "판정요지";
}

function getLeadCopy(source: DecisionSourceProvider) {
  if (source === "lawgo") {
    return "법제처 공식 API 기준으로 판시사항, 판결요지, 참조법령, 판례내용을 내부에서 확인할 수 있습니다.";
  }

  if (source === "bigcase") {
    return "법원 판례 기준으로 판결요지와 원문 출처를 내부에서 확인하세요.";
  }

  return "노동위 판정례 기준으로 판정요지와 절차 정보를 확인할 수 있습니다.";
}

function renderHoldingBlocks(text: string) {
  return parseHoldingText(text).map((block, index) => (
    <p
      key={`${block.kind}-${index}`}
      className={cn(
        "text-sm leading-relaxed whitespace-pre-wrap",
        block.kind === "level1" && "font-semibold mt-4 first:mt-0",
        block.kind === "level2" && "pl-4 mt-2",
        block.kind === "level3" && "pl-8 mt-1.5",
        block.kind === "numbered" && (block.indent === 1 ? "pl-4 mt-2" : "font-semibold mt-4 first:mt-0"),
        block.kind === "bullet" && (block.indent === 2 ? "pl-8" : "pl-4"),
        block.kind === "paragraph" && (block.indent === 2 ? "pl-8" : block.indent === 1 ? "pl-4" : "")
      )}
    >
      {block.text}
    </p>
  ));
}

type LawgoSection = {
  title?: string;
  text?: string;
  type?: string;
  index?: number;
};

function renderLawgoSections(sections: LawgoSection[]) {
  return sections.map((section, index) => (
    <div key={`${section.type || "body"}-${section.index ?? index}`} className="mb-5 last:mb-0">
      {section.title ? <h3 className="font-semibold text-sm mb-2">{section.title}</h3> : null}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{section.text || ""}</p>
    </div>
  ));
}

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ source?: string | string[] }> | { source?: string | string[] };
}) {
  const { id: rawId } = await params;
  // 한글/특수문자 ID(예: 2015부해OOO) 처리 — Next.js dynamic route param이 URL-encoded
  // 상태로 그대로 supabase 쿼리에 들어가면 DB의 한글 ID와 매칭 실패. 명시적 디코드.
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const sourceParam = Array.isArray(resolvedSearchParams?.source)
    ? resolvedSearchParams?.source[0]
    : resolvedSearchParams?.source;
  const decisionSource = resolveDecisionSourceContract({ id, sourceProvider: sourceParam }).provider;

  if (decisionSource === "lawgo") {
    const apiId = id.startsWith("prec_") ? id.replace(/^prec_/, "") : id;
    const [{ data: precedent }, { data: document }] = await Promise.all([
      supabase
        .from("lawgo_precedents")
        .select("*")
        .eq("id", id)
        .single(),
      supabase
        .from("lawgo_precedent_documents")
        .select("*")
        .eq("precedent_id", id)
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!precedent) {
      return <div className="p-8">판례를 찾을 수 없습니다.</div>;
    }

    const sections = Array.isArray(document?.body_sections) ? (document.body_sections as LawgoSection[]) : [];

    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/search" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
            &larr; 검색으로
          </Link>

          <h1 className="text-xl font-bold mb-2">{precedent.title || `법제처 판례 ${apiId}`}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {precedent.court || "-"} | {precedent.decision_date || "-"}
            {precedent.reference_number ? ` | ${precedent.reference_number}` : ""}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="outline">법제처 판례</Badge>
            {precedent.case_type_name ? <Badge variant="secondary">{precedent.case_type_name}</Badge> : null}
            {precedent.judgment_type ? <Badge variant="secondary">{precedent.judgment_type}</Badge> : null}
          </div>

          <Card className="p-4 mb-6 bg-muted/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">상세 페이지</Badge>
                  <Badge variant="outline">{getDecisionSourceLabel(decisionSource)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {getLeadCopy(decisionSource)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#decision-summary"
                  className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  요약 보기
                </a>
                <a
                  href="#source-text"
                  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  원문·출처 보기
                </a>
              </div>
            </div>
          </Card>

          <section id="decision-summary" className="scroll-mt-24 space-y-4">
            {precedent.issue_text ? (
              <Card className="p-4 bg-muted/50">
                <h3 className="font-semibold text-sm mb-2">판시사항</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{precedent.issue_text}</p>
              </Card>
            ) : null}

            {precedent.summary_text ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">판결요지</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{precedent.summary_text}</p>
              </Card>
            ) : null}

            {precedent.reference_statutes ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">참조조문</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{precedent.reference_statutes}</p>
              </Card>
            ) : null}

            {precedent.reference_cases ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">참조판례</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{precedent.reference_cases}</p>
              </Card>
            ) : null}
          </section>

          <Separator className="my-6" />

          <section id="source-text" className="scroll-mt-24">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-semibold">원문·출처</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  법제처 판례 본문과 메타 정보를 내부에서 확인하세요.
                </p>
              </div>
              <Badge variant="outline">서비스 내 원문 제공</Badge>
            </div>

            <Card className="p-4 mb-4">
              <h3 className="font-semibold text-sm mb-3">서비스 내 추출 원문</h3>
              {sections.length > 0 ? (
                <div>{renderLawgoSections(sections)}</div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{document?.body_text || "본문이 없습니다."}</p>
              )}
            </Card>

            <Card className="p-4 bg-muted/40">
              <p className="text-sm text-muted-foreground">
                위 원문은 법제처 공식 판례 API를 기준으로 수집해 사이트 내 노출하는 내용입니다.
              </p>
            </Card>
          </section>
        </div>
      </main>
    );
  }

  if (decisionSource === "bigcase") {
    // cases (legacy) → nlrc_decisions (current) fallback
    // BigCase 데이터가 nlrc_decisions로 통합되어 cases 테이블엔 bc_ ID가 0건
    type CaseLike = {
      id: string;
      title: string;
      court?: string | null;
      decision_date?: string | null;
      case_number?: string | null;
      verdict_type?: string | null;
      holding_points?: string | null;
      summary?: string | null;
      url?: string | null;
      keywords_matched?: string[] | null;
    };

    let c: CaseLike | null = null;
    const { data: legacy } = await supabase
      .from("cases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (legacy) {
      c = legacy as CaseLike;
    } else {
      const { data: d } = await supabase
        .from("nlrc_decisions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (d) {
        c = {
          id: d.id,
          title: d.title,
          court: d.department,
          decision_date: d.decision_date,
          case_number: d.case_number,
          verdict_type: d.decision_result,
          holding_points: d.holding_points,
          summary: d.holding_summary || d.summary_short,
          url: d.url,
          keywords_matched: d.tags,
        };
      }
    }

    if (!c) {
      return <div className="p-8">판결을 찾을 수 없습니다.</div>;
    }

    // 진짜 원본 본문 — decision_source_documents에 BigCase 26,498건이 raw 1,000자+ 보유.
    // nlrc_decisions의 holding_points는 AI 요약본이라 원본 노출 시 이걸 우선 사용.
    const { data: sourceDocs } = await supabase
      .from("decision_source_documents")
      .select("full_text_raw, full_text_clean, body_sections, completeness_flag, coverage_ratio")
      .eq("internal_decision_id", id)
      .eq("source_provider", "bigcase")
      .order("coverage_ratio", { ascending: false })
      .limit(5);

    const docs = sourceDocs ?? [];
    // 진짜 판결문 선택 — clean 1000자+ 또는 raw 1000자+ 중 페이월/PyRepr 거부.
    // 우선순위: (1) Array.isArray(body_sections)인 row가 가장 깨끗 (dict는 ingestion 오류 흔적, 2,453건).
    // (2) clean이 PyRepr 형식인 row(2,774건)는 다음 row로 폴백 — coverage_ratio 무시.
    // (3) full_text_raw는 페이월/네비게이션 HTML 통째 저장 케이스가 많아 후순위.
    let realFulltext = "";
    let bodySections: LawgoSection[] = [];

    const listRowFirst = [...docs].sort((a, b) => {
      const aIsList = Array.isArray(a.body_sections) && (a.body_sections as unknown[]).length > 0 ? 1 : 0;
      const bIsList = Array.isArray(b.body_sections) && (b.body_sections as unknown[]).length > 0 ? 1 : 0;
      if (aIsList !== bIsList) return bIsList - aIsList;
      const aCov = typeof a.coverage_ratio === "number" ? a.coverage_ratio : 0;
      const bCov = typeof b.coverage_ratio === "number" ? b.coverage_ratio : 0;
      return bCov - aCov;
    });

    for (const d of listRowFirst) {
      const clean = typeof d.full_text_clean === "string" ? d.full_text_clean.trim() : "";
      if (clean.length >= 1000 && !isPaywallText(clean) && !isPyReprText(clean)) {
        realFulltext = clean;
        const sections = Array.isArray(d.body_sections) ? (d.body_sections as LawgoSection[]) : [];
        if (sections.length > 0) bodySections = sections;
        break;
      }
    }
    if (!realFulltext) {
      for (const d of listRowFirst) {
        const raw = typeof d.full_text_raw === "string" ? d.full_text_raw.trim() : "";
        if (raw.length >= 1000 && !isPaywallText(raw) && !isPyReprText(raw)) {
          realFulltext = raw;
          const sections = Array.isArray(d.body_sections) ? (d.body_sections as LawgoSection[]) : [];
          if (sections.length > 0) bodySections = sections;
          break;
        }
      }
    }
    const hasRealFulltext = realFulltext.length > 0 || bodySections.length > 0;

    const holdingPointsText = typeof c.holding_points === "string" ? c.holding_points.trim() : "";
    const summaryText = typeof c.summary === "string" ? c.summary.trim() : "";
    const hasDetailedHoldingPoints = holdingPointsText.length >= 50;
    const hasHoldingPoints = holdingPointsText.length > 0;
    const hasSummary = summaryText.length > 0;
    const hasSourceSection = hasRealFulltext || hasHoldingPoints;

    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/search" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
            &larr; 검색으로
          </Link>

          <h1 className="text-xl font-bold mb-2">{c.title}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {c.court} | {c.decision_date}
            {c.case_number ? ` | ${c.case_number}` : ""}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <Badge className="bg-blue-100 text-blue-800">{c.verdict_type || "판결"}</Badge>
            <Badge variant="outline">{getDecisionSourceLabel(decisionSource)}</Badge>
            {Array.isArray(c.keywords_matched) ? c.keywords_matched.map((tag: string) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            )) : null}
          </div>

          <Card className="p-4 mb-6 bg-muted/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">상세 페이지</Badge>
                  <Badge variant="outline">{getDecisionSourceLabel(decisionSource)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {getLeadCopy(decisionSource)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#decision-summary"
                  className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  요약 보기
                </a>
                {hasSourceSection ? (
                  <a
                    href="#source-text"
                    className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  >
                    원문·출처 보기
                  </a>
                ) : null}
              </div>
            </div>
          </Card>

          <section id="decision-summary" className="scroll-mt-24 space-y-4">
            {summaryText ? (
              <Card className="p-4 bg-muted/50">
                <h3 className="font-semibold text-sm mb-2">{getSummaryLabel(decisionSource)}</h3>
                <div>{renderHoldingBlocks(summaryText)}</div>
              </Card>
            ) : null}
          </section>

          <Separator className="my-6" />

          <section id="source-text" className="scroll-mt-24">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-semibold">판결 원문</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  법원 판례 원문을 사이트 내에서 그대로 확인하세요.
                </p>
              </div>
              <Badge variant="outline">
                {hasRealFulltext ? "원본 본문" : getSourceStatusLabel(hasDetailedHoldingPoints, hasHoldingPoints)}
              </Badge>
            </div>

            {bodySections.length > 0 ? (
              <Card className="p-4 mb-4">
                <h3 className="font-semibold text-sm mb-3">법원 판례 원문</h3>
                <div>{renderLawgoSections(bodySections)}</div>
              </Card>
            ) : realFulltext ? (
              <Card className="p-4 mb-4">
                <h3 className="font-semibold text-sm mb-3">법원 판례 원문</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{realFulltext}</p>
              </Card>
            ) : hasDetailedHoldingPoints ? (
              <Card className="p-4 mb-4 bg-muted/40">
                <h3 className="font-semibold text-sm mb-2">서비스 내 정리본</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  법원 원문을 확보하지 못해 AI가 정리한 요약본으로 표시합니다.
                </p>
                <div>{renderHoldingBlocks(holdingPointsText)}</div>
              </Card>
            ) : (
              <Card className="p-4 mb-4 bg-muted/40">
                <h3 className="font-semibold text-sm mb-2">서비스 내 확인 가능한 내용</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  이 판례는 상세한 추출 원문이 충분하지 않아, 아래 요약을 제공합니다.
                </p>
                <div className="space-y-3">
                  {hasHoldingPoints ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">추출된 원문 일부</p>
                      <div>{renderHoldingBlocks(holdingPointsText)}</div>
                    </div>
                  ) : null}
                  {hasSummary ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">판결요지 정리</p>
                      <div>{renderHoldingBlocks(summaryText)}</div>
                    </div>
                  ) : null}
                </div>
              </Card>
            )}

          </section>
        </div>
      </main>
    );
  }

  const { data: d } = await supabase
    .from("nlrc_decisions")
    .select("*")
    .eq("id", id)
    .single();

  if (!d) {
    return <div className="p-8">판정례를 찾을 수 없습니다.</div>;
  }

  const displayCaseNumber = getDisplayCaseNumber(d.case_number);
  const holdingPointsText = typeof d.holding_points === "string" ? d.holding_points.trim() : "";
  const rawHoldingSummary = typeof d.holding_summary === "string" ? d.holding_summary.trim() : "";
  const holdingSummaryText = normalizeHoldingSummary(rawHoldingSummary);
  const keyIssueText = typeof d.key_issue === "string" ? d.key_issue.trim() : "";

  // 핵심쟁점 카드: 정규화된 summary/holding_points/key_issue 중 가장 긴 텍스트
  const bestKeyIssueText = [holdingSummaryText, holdingPointsText, keyIssueText]
    .reduce((longest, t) => (t.length > longest.length ? t : longest), "");
  const hasDetailedHoldingPoints = holdingPointsText.length >= 50;
  const hasHoldingPoints = holdingPointsText.length > 0;
  const hasSummary = holdingSummaryText.length > 0;
  // 핵심쟁점 ↔ 판정 요지 dedup — character-trigram Jaccard로 유사도 측정.
  // 0.5+면 같은 본문(또는 prefix/한 줄 요약+본문 변형)으로 보고 판정 요지 카드 숨김.
  const summaryDifferentFromKeyIssue = (() => {
    if (!hasSummary) return false;
    if (holdingSummaryText === bestKeyIssueText) return false;
    if (bestKeyIssueText.includes(holdingSummaryText.slice(0, 80))) return false;
    if (holdingSummaryText.includes(bestKeyIssueText.slice(0, 80))) return false;
    const trigrams = (s: string) => {
      const norm = s.replace(/\s+/g, '');
      const set = new Set<string>();
      for (let i = 0; i < norm.length - 2; i++) set.add(norm.slice(i, i + 3));
      return set;
    };
    const a = trigrams(holdingSummaryText);
    const b = trigrams(bestKeyIssueText);
    if (a.size === 0 || b.size === 0) return true;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const jaccard = inter / (a.size + b.size - inter);
    return jaccard < 0.5; // 절반 이상 겹치면 같은 내용으로 간주, 카드 숨김
  })();
  const hasSourceSection = hasHoldingPoints || Boolean(d.url);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/search" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
          &larr; 검색으로
        </Link>

        <h1 className="text-xl font-bold mb-2">{d.title}</h1>
        <p className="text-sm text-muted-foreground">
          {d.department} | {d.decision_date}
        </p>
        {displayCaseNumber && (
          <p className="text-sm font-semibold text-foreground mb-4">
            사건번호: {displayCaseNumber}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <Badge className="bg-blue-100 text-blue-800">
            {RESULT_LABELS[d.decision_result as DecisionResult] || d.decision_result}
          </Badge>
          {d.reason_category?.map((r: string) => (
            <Badge key={r} variant="outline">
              {REASON_LABELS[r as ReasonCategory] || r}
            </Badge>
          ))}
          {d.sanction_type && (
            <Badge variant="secondary">
              {SANCTION_LABELS[d.sanction_type as SanctionType] || d.sanction_type}
            </Badge>
          )}
        </div>

        {/* AI 분류 태깅 정보 */}
        {(d.legal_focus?.filter((f: string) => f !== '불명').length > 0 ||
          d.disposition_type?.filter((t: string) => t !== '불명').length > 0) && (
          <Card className="p-4 mb-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">AI 분류</p>
            <div className="flex flex-wrap gap-1.5">
              {d.disposition_type?.filter((t: string) => t !== '불명').map((t: string) => (
                <Badge key={t} className="text-xs">{getAiLabel(t, DISPOSITION_TYPE_LABELS)}</Badge>
              ))}
              {d.legal_focus?.filter((f: string) => f !== '불명').map((f: string) => (
                <Badge key={f} variant="outline" className="text-xs">{getAiLabel(f, LEGAL_FOCUS_LABELS)}</Badge>
              ))}
            </div>
          </Card>
        )}

        {bestKeyIssueText && (
          <Card id="decision-summary" className="p-4 mb-6 bg-muted/50 scroll-mt-24">
            <h3 className="font-semibold text-sm mb-1">핵심쟁점</h3>
            <div className="text-sm">{renderHoldingBlocks(bestKeyIssueText)}</div>
          </Card>
        )}

        <section id={d.key_issue ? undefined : "decision-summary"} className="scroll-mt-24">
          {d.reason_detail && (
            <Card className="p-4 mb-4">
              <h3 className="font-semibold text-sm mb-1">해고 사유</h3>
              <p className="text-sm">{stripMarkdownFormatting(d.reason_detail)}</p>
            </Card>
          )}

          <Card className="p-4 mb-4">
            <h3 className="font-semibold text-sm mb-1">절차 확인</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>{d.procedure_committee ? "✅" : "❌"} 징계위원회</div>
              <div>{d.procedure_defense ? "✅" : "❌"} 소명기회 부여</div>
              <div>{d.procedure_written_notice ? "✅" : "❌"} 서면통지</div>
              <div>{d.procedure_advance_notice ? "✅" : "❌"} 해고예고 30일</div>
            </div>
            {d.procedure_note && (
              <p className="text-xs text-muted-foreground mt-2">{d.procedure_note}</p>
            )}
          </Card>

          {hasSummary && summaryDifferentFromKeyIssue && (
            <Card id="decision-summary" className="p-5 mb-4 border-primary/30 bg-primary/5 scroll-mt-24">
              <h3 className="font-bold text-base mb-3">판정 요지</h3>
              <div>{renderHoldingBlocks(holdingSummaryText)}</div>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
