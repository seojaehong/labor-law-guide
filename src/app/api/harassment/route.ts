import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || "0");
    const subcategory = searchParams.get("subcategory") || "all";
    const legalFocus = searchParams.get("legalFocus") || "all";

    let query = supabaseServer
      .from("nlrc_decisions")
      .select(
        "id, title, case_number, department, decision_date, decision_result, holding_summary, legal_focus, disposition_type, tier_subcategory",
        { count: "exact" }
      )
      .eq("issue_type_primary", "workplace_harassment")
      .order("decision_date", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (subcategory !== "all") {
      query = query.eq("tier_subcategory", subcategory);
    }

    if (legalFocus !== "all") {
      query = query.contains("legal_focus", [legalFocus]);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [], count: count || 0 });
  } catch (error) {
    console.error("harassment API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cases", data: [], count: 0 },
      { status: 500 }
    );
  }
}
