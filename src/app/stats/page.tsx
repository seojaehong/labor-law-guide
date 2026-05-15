"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/decisions-ui/card";
import { REASON_LABELS, RESULT_LABELS, type ReasonCategory, type DecisionResult } from "@/lib/types";
import Link from "next/link";

interface ReasonStat {
  reason_category: string;
  decision_result: string;
  count: number;
}

export default function StatsPage() {
  const [stats, setStats] = useState<ReasonStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("reason_stats").select("*");
      if (data) setStats(data);
      setLoading(false);
    }
    load();
  }, []);

  // 사유별 그룹
  const grouped: Record<string, { total: number; results: Record<string, number> }> = {};
  for (const s of stats) {
    if (!grouped[s.reason_category]) {
      grouped[s.reason_category] = { total: 0, results: {} };
    }
    grouped[s.reason_category].total += s.count;
    grouped[s.reason_category].results[s.decision_result] = s.count;
  }

  const sorted = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
          &larr; 홈으로
        </Link>

        <h1 className="text-2xl font-bold mb-6">사유별 판정 통계</h1>

        {loading ? (
          <p>로딩 중...</p>
        ) : (
          <div className="space-y-4">
            {sorted.map(([reason, data]) => {
              const grantedCount = (data.results["granted"] || 0) + (data.results["partial"] || 0);
              const grantedRate = data.total > 0 ? Math.round((grantedCount / data.total) * 100) : 0;

              return (
                <Card key={reason} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">
                      {REASON_LABELS[reason as ReasonCategory] || reason}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {data.total.toLocaleString()}건
                    </span>
                  </div>

                  <div className="flex h-6 rounded-full overflow-hidden bg-muted mb-2">
                    {Object.entries(data.results)
                      .sort((a, b) => b[1] - a[1])
                      .map(([result, count]) => {
                        const pct = (count / data.total) * 100;
                        const colors: Record<string, string> = {
                          granted: "bg-green-500",
                          partial: "bg-yellow-500",
                          dismissed: "bg-red-400",
                          rejected: "bg-gray-400",
                          upheld: "bg-blue-400",
                          overturned: "bg-purple-400",
                          settled: "bg-orange-400",
                        };
                        return (
                          <div
                            key={result}
                            className={`${colors[result] || "bg-gray-300"} transition-all`}
                            style={{ width: `${pct}%` }}
                            title={`${RESULT_LABELS[result as DecisionResult] || result}: ${count}건 (${Math.round(pct)}%)`}
                          />
                        );
                      })}
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>인정률: {grantedRate}%</span>
                    <div className="flex gap-3">
                      {Object.entries(data.results)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([result, count]) => (
                          <span key={result}>
                            {RESULT_LABELS[result as DecisionResult] || result} {count}
                          </span>
                        ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
