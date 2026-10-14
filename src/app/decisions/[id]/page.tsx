import { normalizeHoldingSummary, isFullyCovered } from "@/lib/holding-summary";
import OfficialSourceLink from "@/components/OfficialSourceLink";
import { realCaseNumber } from "@/app/decisions/SearchResults";
import { publicMetadata } from '@/lib/public-metadata';
import { unwrapSourceAnnotations } from "@/lib/legal-display-text";
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
import { pickReason } from "@/lib/reason-pick";
import DecisionReasonBadges from '../DecisionReasonBadges';
import {decisionDate} from '@/lib/decision-date';
import { getDecisionSourceLabel, resolveDecisionSourceContract, type DecisionSourceProvider } from "@/lib/search/source-contracts";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SubscribeForm from "@/components/SubscribeForm";
import { SITE_URL, BRAND_NAME } from "@/lib/constants";

// AI 분류 라벨 fallback: 미매핑 영문은 underscore→space로 보정
function getAiLabel(key: string, map: Record<string, string>): string {
  return map[key] || key.replace(/_/g, " ");
}

// 동적 메타 — nlrc_decisions 핵심 필드 기반 (가장 큰 트래픽 페이지의 SEO 박살 fix)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  let id: string;
  try { id = decodeURIComponent(rawId); } catch { id = rawId; }

  const canonical = `${SITE_URL}/decisions/${encodeURIComponent(id)}`;

  // nlrc_decisions만 빠르게 lookup (lawgo/bigcase는 일시 노출 중단)
  const { data: d } = await supabase
    .from("nlrc_decisions")
    .select("title, case_number, case_number_real, case_number_qualified, key_issue, holding_summary, holding_points, decision_result, reason_category, issue_type_primary")
    .eq("id", id)
    .maybeSingle();

  if (!d) {
    // 존재하지 않는(삭제/개인정보 요청 포함) 판정례는 색인 금지 — 페이지 본문도 notFound()로 404 처리.
    return publicMetadata({
      title: `판정례를 찾을 수 없습니다`,
      description: "요청하신 판정례가 존재하지 않습니다.",
      alternates: { canonical },
      robots: { index: false, follow: false },
    });
  }

  const caseNum = realCaseNumber(d.case_number_qualified, d.case_number_real, d.case_number) || "";
  const isCourtCase = resolveDecisionSourceContract({id}).provider !== "nlrc";
  const result = !isCourtCase && d.decision_result ? (RESULT_LABELS[d.decision_result as DecisionResult] || d.decision_result) : "";
  const pickedReason = pickReason(Array.isArray(d.reason_category) ? d.reason_category : null, d.issue_type_primary);
  const reasonLabel = pickedReason ? (REASON_LABELS[pickedReason as ReasonCategory] || pickedReason) : "";
  // 마크다운 잔존 제거 — key_issue/holding_summary에 #, **, - 가 들어있어 SEO title이 깨짐
  const stripMd = (s: string) => stripMarkdownFormatting(s).replace(/\s+/g, " ").trim();
  const keyIssue = typeof d.key_issue === "string" ? stripMd(d.key_issue).slice(0, 60) : "";
  const holding = typeof d.holding_summary === "string" ? stripMd(d.holding_summary).slice(0, 120) : "";

  // 본문이 비었거나 페이월/파싱실패 텍스트인 행은 색인시키지 않는다.
  // 이런 페이지가 대량으로 색인되면 사이트 전체 평가가 깎인다.
  const bodyText = `${d.holding_points || ""}${d.holding_summary || ""}`;
  if (bodyText.trim().length < 200 || isPaywallText(bodyText) || isPyReprText(bodyText)) {
    return publicMetadata({
      title: (d.title || "판정례").slice(0, 32),
      description: "본문 정비 중인 자료입니다.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    });
  }

  // 제목 전략이 소스별로 다르다.
  //  bc_ (법원 판례): 사건번호가 실명이고, GSC 실측상 실제 검색어가 사건번호다
  //    ("울산지방법원 2013구합66 해임처분"). 사건번호를 맨 앞에 둔다.
  //  id_ (노동위 판정례): 사건번호의 72%가 2018부해OOO 로 마스킹돼 있어 검색어와
  //    절대 매칭되지 않는다. 앞에 둬봐야 자리만 차지하므로 쟁점을 앞세운다.
  // 한글 SERP 는 약 35자에서 잘리므로 브랜드 접미사는 붙이지 않는다.

  // 한글 검색결과는 약 35자에서 잘린다. 앞서 34/38자로 자르고 뒤에 사건번호와
  // 판정결과를 덧붙였더니 전수 시뮬레이션에서 99%가 35자를 넘었다(중앙값 45자).
  // 그래서 "조각마다 자르기"가 아니라 "전체 35자 예산을 나눠 쓰기"로 바꾼다.
  const TITLE_BUDGET = 35;
  const clip = (str: string, max: number) => {
    const t = str.trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("·"), cut.lastIndexOf(","));
    return (boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s\-–—,·]+$/, "");
  };
  // 원문에 "존재여부징계사유가" 처럼 붙어 저장된 행이 있다(수집 단계 문제, 0.1%).
  // 데이터를 고치기 전까지 제목에서만 띄운다.
  const cleanIssue = keyIssue
    .replace(/^(결과\s*요약|사건\s*개요|판결\s*결과|주문|이유)\s*[:：-]?\s*/, "")
    .replace(/^(?:[가-하]|\d{1,2})\s*[.)]\s*/, "")
    .replace(/(여부|경우|사례)(?=[가-힣])/g, "$1 ")
    .trim();
  // "기타"는 분류가 안 됐다는 뜻이라 좁은 지면을 낭비한다. 앞에 두지 않는다.
  const leadLabel = reasonLabel && reasonLabel !== "기타" ? reasonLabel : "";
  // 앞자리는 검색어가 되는 것에 준다. bc_ 는 사건번호가 실명이고 GSC 실측상 실제
  // 검색어가 사건번호다. id_ 는 72%가 마스킹이라 쓸 수 없으므로 유형을 앞세운다.
  const prefix = isCourtCase && caseNum ? caseNum : leadLabel;
  const issueForTitle = clip(cleanIssue, Math.max(TITLE_BUDGET - prefix.length - 1, 12));
  const head = [prefix, issueForTitle || caseNum || id].filter(Boolean).join(" ").trim();
  // 판정결과("기각", "초심유지")는 검색어가 아니다. 예산 안에 남는 자리가 있을 때만
  // 붙인다. +6자를 허용해 봤더니 전수 시뮬레이션 중앙값이 35자 예산을 넘겨(38자)
  // 결국 잘렸다 — 잘릴 거면 안 붙이는 게 낫다.
  const withResult = result && head.length + result.length + 3 <= TITLE_BUDGET
    ? `${head} — ${result}`
    : head;
  // 사건번호가 비정상적으로 긴 행이 극소수 있다. 어떤 경우에도 넘지 않을 상한을 둔다.
  const title = withResult.slice(0, 45);

  const descParts = [
    caseNum ? `사건번호 ${caseNum}` : "",
    reasonLabel ? `유형 ${reasonLabel}` : "",
    result ? `판정 ${result}` : "",
    holding,
  ].filter(Boolean);
  const description = (descParts.join(" · ") || "노동위원회 판정례 상세 정보 — 핵심쟁점·절차·판정결과 정리.").slice(0, 155);

  return publicMetadata({
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      locale: "ko_KR",
      siteName: BRAND_NAME,
    },
    robots: { index: true, follow: true },
  });
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
        "reading-prose whitespace-pre-wrap",
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

function validSourceSections(value: unknown): LawgoSection[] {
  if (!Array.isArray(value)) return [];
  // Reject malformed/boilerplate sections; preserve the accepted source text verbatim.
  return value.filter((section): section is LawgoSection => section && typeof section.text === "string" && section.text.trim().length > 0 && (!section.title || typeof section.title === "string") && !isPaywallText(section.text) && !isPyReprText(section.text));
}

function renderLawgoSections(sections: LawgoSection[]) {
  return sections.filter((section) => section && typeof section.text === "string" && (!section.title || typeof section.title === "string")).map((section, index) => (
    <div key={`${section.type || "body"}-${section.index ?? index}`} className="mb-5 last:mb-0">
      {section.title ? <h3 className="font-semibold text-sm mb-2">{unwrapSourceAnnotations(section.title)}</h3> : null}
      <p className="reading-prose whitespace-pre-wrap break-words overflow-x-auto">{unwrapSourceAnnotations(section.text || "")}</p>
    </div>
  ));
}

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ source?: string | string[] }>;
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

  // 2026-05-15 d0f344b 로 bigcase/lawgo 를 "데이터 정비 중"이라며 함께 404 처리했는데,
  // SHOW_CASES 는 그 뒤로 한 번도 설정되지 않아 3개월 반 동안 20,986페이지가 죽어 있었다.
  // 2026-08-31 에 두 소스의 실제 데이터를 세어보고 판단을 갈랐다.
  //
  //   bigcase(bc_) 16,004건 — 6,400건 표본에서 98.1% 정상.
  //     사건번호 마스킹 0%(실명 사건번호 완비), 페이월 혼입 0.2%, 빈껍데기 1.7%.
  //     GSC 검색어가 "울산지방법원 2013구합66 해임처분" 같은 사건번호인데
  //     정작 그 검색어에 맞는 페이지가 이것이고, 지금까지 404였다. → 되살린다.
  //
  //   lawgo(prec_) 4,982건 — 껍데기다. title 평균 17자("근로기준법위반" 수준),
  //     decision_date 100% 비어 있고 issue_text 58%가 빈값, summary_text 중앙값 80자.
  //     제목 중복이 심해 대량 색인하면 오히려 scaled content abuse 리스크다. → 계속 막는다.
  //
  // 오염된 bigcase 행은 아래 isPaywallText / isPyReprText 가드가 이미 걸러낸다.
  if (decisionSource === 'lawgo' && process.env.SHOW_LAWGO !== 'true') {
    notFound();
  }

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

    const sections = validSourceSections(document?.body_sections);

    return (
      <main className="min-h-screen bg-background">
        <div className="layout-reading">
          <Link href="/decisions" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
            &larr; 검색으로
          </Link>

          <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>{precedent.title || `법제처 판례 ${apiId}`}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {precedent.court || "-"} | {decisionDate(precedent.decision_date) || "날짜 미확인"}
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
                  수집 본문·출처 보기
                </a>
              </div>
            </div>
          </Card>

          <section id="decision-summary" className="scroll-mt-24 space-y-4">
            {precedent.issue_text ? (
              <Card className="p-4 bg-muted/50">
                <h3 className="font-semibold text-sm mb-2">판시사항</h3>
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(precedent.issue_text)}</p>
              </Card>
            ) : null}

            {precedent.summary_text ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">판결요지</h3>
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(precedent.summary_text)}</p>
              </Card>
            ) : null}

            {precedent.reference_statutes ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">참조조문</h3>
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(precedent.reference_statutes)}</p>
              </Card>
            ) : null}

            {precedent.reference_cases ? (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">참조판례</h3>
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(precedent.reference_cases)}</p>
              </Card>
            ) : null}
          </section>

          <Separator className="my-6" />

          <section id="source-text" className="scroll-mt-24">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-semibold">원문·출처</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  확보한 본문과 출처를 확인하세요. 전문 여부와 문단·표의 원형 보존은 확인되지 않았습니다.
                </p>
              </div>
              <Badge variant="outline">수집 본문 · 완전성 미확인</Badge>
            </div>

            <Card className="p-4 mb-4">
              <OfficialSourceLink urls={[precedent.original_url, precedent.url]} />
              <h3 className="font-semibold text-sm mb-3">서비스 내 수집 본문</h3>
              {sections.length > 0 ? (
                <div>{renderLawgoSections(sections)}</div>
              ) : (
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(document?.body_text || "본문이 없습니다.")}</p>
              )}
            </Card>

            <Card className="p-4 bg-muted/40">
              <p className="text-sm text-muted-foreground">
                법제처 공식 판례 API에서 수집한 내용입니다. 앞뒤 누락 및 표·공백 변형 가능성이 있으므로 공식 출처와 대조하세요.
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
      original_url?: string | null;
      keywords_matched?: string[] | null;
      reason_category?: string[] | null;
      issue_type_primary?: string | null;
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
      if (d && id.startsWith("bc_")) {
        c = {
          id: d.id,
          title: d.title,
          court: d.department,
          decision_date: d.decision_date,
          case_number: realCaseNumber(d.case_number_qualified, d.case_number_real, d.case_number),
          // Imported values follow the NLRC result schema, not a verified court outcome.
          verdict_type: null,
          holding_points: d.holding_points,
          summary: d.holding_summary || d.summary_short,
          url: d.url,
          original_url: d.original_url,
          keywords_matched: d.tags,
          reason_category: d.reason_category,
          issue_type_primary: d.issue_type_primary,
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
      const aIsList = validSourceSections(a.body_sections).length > 0 ? 1 : 0;
      const bIsList = validSourceSections(b.body_sections).length > 0 ? 1 : 0;
      if (aIsList !== bIsList) return bIsList - aIsList;
      const aCov = typeof a.coverage_ratio === "number" ? a.coverage_ratio : 0;
      const bCov = typeof b.coverage_ratio === "number" ? b.coverage_ratio : 0;
      return bCov - aCov;
    });

    for (const d of listRowFirst) {
      const clean = typeof d.full_text_clean === "string" ? d.full_text_clean.trim() : "";
      if (clean.length >= 1000 && !isPaywallText(clean) && !isPyReprText(clean)) {
        realFulltext = clean;
        const sections = validSourceSections(d.body_sections);
        if (sections.length > 0) bodySections = sections;
        break;
      }
    }
    if (!realFulltext) {
      for (const d of listRowFirst) {
        const raw = typeof d.full_text_raw === "string" ? d.full_text_raw.trim() : "";
        if (raw.length >= 1000 && !isPaywallText(raw) && !isPyReprText(raw)) {
          realFulltext = raw;
          const sections = validSourceSections(d.body_sections);
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
        <div className="layout-reading">
          <Link href="/decisions" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
            &larr; 검색으로
          </Link>

          <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>{c.title}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {c.court} | {decisionDate(c.decision_date) || '날짜 미확인'}
            {c.case_number ? ` | ${c.case_number}` : ""}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <Badge className="bg-blue-100 text-blue-800">{c.verdict_type || "판결"}</Badge>
            <Badge variant="outline">{getDecisionSourceLabel(decisionSource)}</Badge>
            <DecisionReasonBadges categories={c.reason_category} primary={c.issue_type_primary} />
            {c.keywords_matched?.length ? <span className="self-center text-xs text-muted-foreground">관련 태그</span> : null}
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
                    수집 본문·출처 보기
                  </a>
                ) : null}
              </div>
            </div>
          </Card>

          <section id="decision-summary" className="scroll-mt-24 space-y-4">
            {summaryText ? (
              <Card className="p-4 bg-muted/50">
                <h3 className="font-semibold text-sm mb-2">{getSummaryLabel(decisionSource)} · 저장된 요약</h3>
                <p className="text-sm mb-3">원문이 아닌 정리본이며, 저장된 요약의 끝부분이 잘려 있을 수 있습니다.</p>
                <div>{renderHoldingBlocks(summaryText)}</div>
              </Card>
            ) : null}
          </section>

          <Separator className="my-6" />

          <section id="source-text" className="scroll-mt-24">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-semibold">수집 본문·요약 및 출처</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  확보한 수집 내용입니다. 전문 여부와 앞뒤 누락, 문단·표·공백의 원형 보존은 확인되지 않았습니다.
                </p>
              </div>
              <Badge variant="outline">
                {hasRealFulltext ? "수집 본문 · 완전성 미확인" : "정리본 · 원문 미확보"}
              </Badge>
            </div>

            <p className="mb-3 text-sm">
              <OfficialSourceLink urls={[c.original_url, c.url]} />
            </p>

            {bodySections.length > 0 ? (
              <Card className="p-4 mb-4">
                <h3 className="font-semibold text-sm mb-3">확보한 수집 본문</h3>
                <div>{renderLawgoSections(bodySections)}</div>
                {realFulltext ? <details className="mt-4"><summary>같은 수집본의 저장 텍스트 보기 · 완전성 미확인</summary><p className="reading-prose whitespace-pre-wrap break-words">{unwrapSourceAnnotations(realFulltext)}</p></details> : null}
              </Card>
            ) : realFulltext ? (
              <Card className="p-4 mb-4">
                <h3 className="font-semibold text-sm mb-3">확보한 수집 본문</h3>
                <p className="reading-prose whitespace-pre-wrap">{unwrapSourceAnnotations(realFulltext)}</p>
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
                      <p className="text-xs font-medium text-muted-foreground mb-1">판결요지 정리 · 원문 아님</p>
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
    // 삭제되었거나 존재하지 않는 판정례 — 200 소프트404 대신 실제 404(noindex)로 처리해 색인에서 제외.
    notFound();
  }

  const displayCaseNumber = getDisplayCaseNumber(realCaseNumber(d.case_number_qualified, d.case_number_real, d.case_number));
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
  const summaryDifferentFromKeyIssue = hasSummary && !isFullyCovered(holdingSummaryText, bestKeyIssueText);
  const hasSourceSection = hasHoldingPoints || Boolean(d.url);

  return (
    <main className="min-h-screen bg-background">
      <div className="layout-reading">
        <Link href="/decisions" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
          &larr; 검색으로
        </Link>
        <div className="mb-4"><OfficialSourceLink urls={[d.original_url,d.url]} /></div>

        <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>{d.title}</h1>
        <p className="text-sm text-muted-foreground">
          {d.department} | {decisionDate(d.decision_date) || '날짜 미확인'}
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
          <DecisionReasonBadges categories={d.reason_category} primary={d.issue_type_primary} />
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
              <p className="reading-prose">{stripMarkdownFormatting(d.reason_detail)}</p>
            </Card>
          )}

          {/*
            「절차 확인」 카드 제거 — 2026-09-19.

            procedure_committee / procedure_defense / procedure_written_notice /
            procedure_advance_notice 네 컬럼이 61,928건 **전부 false** 다. 채워진 적이 없다.
            procedure_note 도 전건 비어 있다. 그래서 이 카드는 모든 판정례 페이지에서
            ❌ 넷을 고정으로 찍고 있었다 — 「징계위원회 없었음·소명기회 없었음·서면통지 없었음」이라는
            사실 주장을 6만 페이지에 하고 있었던 셈이다.

            실측 모순 사례: id_52967 은 판정 요지가 「…절차에도 하자가 없어 정당하다고 판정한 사례」인데
            바로 아래에서 네 항목 모두 ❌ 로 표시됐다. 같은 페이지 안에서 서로를 부정한다.

            데이터가 실제로 채워지면 되살린다. 그때까지는 없는 게 맞다 —
            빈 값을 ❌(=없었다)로 렌더링하면 안 된다. 「모름」과 「없었음」은 다르다.
          */}

          {hasSummary && summaryDifferentFromKeyIssue && (
            <Card id="decision-summary" className="p-5 mb-4 border-primary/30 bg-primary/5 scroll-mt-24">
              <h3 className="font-bold text-base mb-3">판정 요지</h3>
              <div>{renderHoldingBlocks(holdingSummaryText)}</div>
            </Card>
          )}
        </section>

        {/* 판례 페이지 CTA — 유사 사례 진단 + 챗봇 + 뉴스레터 구독 */}
        <section className="mt-8 space-y-4">
          <Card className="p-5 border-primary/30 bg-primary/5">
            <h3 className="font-bold text-base mb-2">우리 사건도 비슷한 결론일까?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              이 판례와 비슷한 상황이라면 핵심 쟁점 5가지를 30초 안에 자가진단할 수 있습니다. 또는 AI 상담으로 즉시 답을 받아보세요.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/sanction"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                징계 정당성 자가진단 →
              </Link>
              <Link
                href="/ai"
                className="inline-flex items-center justify-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold transition-colors hover:bg-primary/10"
              >
                AI에게 바로 물어보기 →
              </Link>
            </div>
          </Card>

          <SubscribeForm source="decision-footer" sourceSlug={d.id ? String(d.id) : undefined} />
        </section>
      </div>
    </main>
  );
}
