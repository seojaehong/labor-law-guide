import Link from "next/link";

import { SettlementInput } from "@/components/leave/SettlementInput";

export const metadata = {
  title: "퇴직 연차 정산 | 일의 무늬",
  description:
    "회계연도로 연차를 관리하는 사업장에서 퇴사자가 생기면 입사일 기준으로 다시 계산해 부족분을 확인합니다. 연도별 발생 내역과 근거를 함께 보여드립니다.",
  alternates: { canonical: "https://yellowenvelope.kr/tools/leave/settlement" },
  openGraph: {
    title: "퇴직 연차 정산 | 일의 무늬",
    description: "회계연도로 연차를 관리하는 사업장에서 퇴사자가 생기면 입사일 기준으로 다시 계산해 부족분을 확인합니다.",
    url: "https://yellowenvelope.kr/tools/leave/settlement",
    siteName: "일의 무늬",
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary", title: "퇴직 연차 정산 | 일의 무늬", description: "회계연도로 연차를 관리하는 사업장에서 퇴사자가 생기면 입사일 기준으로 다시 계산해 부족분을 확인합니다." },
};

export default function SettlementPage() {
  return (
    <div className="lv-page">
      <header className="lv-head">
        <p className="lv-head__eyebrow">노무사·인사담당자를 위한 퇴직 정산</p>
        <h1 className="lv-head__title">
          퇴직 연차 정산
        </h1>
        <p className="lv-head__lede">
          회계연도 기준으로 연차를 부여해 왔더라도 퇴직 시점에{" "}
          <strong>입사일 기준으로 계산한 일수에 미달하면 그 차이를 정산</strong>해야 합니다.
          연도별 발생 내역을 펼쳐 두 기준을 나란히 보여드립니다.
        </p>
      </header>

      <p className="lv-terms">
        <strong>무료로 쓰실 수 있습니다.</strong> 법률 자문이 아니라 계산을 도와드리는
        도구이며, 입력값 기준의 참고 결과입니다.
      </p>

      <p className="lv-terms">퇴사일은 마지막 재직일입니다. 2026-01-01 입사 후 2026-12-31까지 재직했다면 첫해 월 연차 최대 11일이며, 2027-01-01에도 재직해야 추가 15일이 발생합니다. 출근율·휴직·월말·윤일 입사는 별도 확인이 필요합니다.</p><SettlementInput />

      <section className="lv-how">
        <div className="lv-how__item">
          <span className="lv-how__num">계산 방식</span>
          <p>
            보장선 = <strong>입사일 기준 누계와 회계연도 부여 누계 중 유리한 쪽</strong> ·
            정산 대상 = 보장선 − 이미 사용·지급한 일수
          </p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">근거</span>
          <p>
            고용노동부 <strong>근로기준과-5802</strong>(2009-12-31),{" "}
            <strong>근기 68207-620</strong>(2003-05-23)
          </p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">이어서</span>
          <p>
            <Link href="/tools/leave">연차 일수 계산</Link> ·{" "}
            <Link href="/tools/leave/advanced">반차·출근율·사용촉진</Link>
          </p>
        </div>
      </section>

      <section className="lv-scope">
        <h2 className="lv-scope__title">계산 근거</h2>
        <p className="lv-scope__footer" style={{ marginTop: 0 }}>
          회계연도로 부여했더라도 퇴직 시 총 휴가일수가 입사일 기준에 미달하면 부족분을 정산합니다.
          근거: <strong>근로기준과-5802</strong>, <strong>근기 68207-620</strong>.
        </p>
        <p className="lv-scope__footer">
          기준은 단순히 입사일로 맞추는 것이 아니라 <strong>근로자에게 유리한 쪽</strong>입니다.
        </p>
        <p className="lv-scope__footer">
          회계연도 부여분이 더 많을 때는 <strong>퇴직 시 입사일 기준 재산정 규정</strong> 유무를 함께 봅니다.
        </p>
      </section>

      <section className="lv-scope">
        <h2 className="lv-scope__title">계산 범위</h2>
        <ul className="lv-scope__list">
          <li>
            <strong>일수만</strong> 계산합니다. 통상임금 기준의 수당 금액은 포함하지 않습니다
          </li>
          <li>출근율 80% 미만 구간, 육아휴직 등 특수 출결로 발생이 달라지는 경우</li>
          <li>
            1년 미만 월 단위 연차(11일)는 회계연도 산정과 <strong>별개로</strong> 발생합니다
          </li>
          <li>
            <strong>연차 사용촉진</strong>을 적법하게 해서 수당 지급 의무가 없어진 경우 —
            적법성 판정은 사실인정이라 다루지 않습니다
          </li>
          <li>미사용수당 청구권의 소멸시효는 별도 검토가 필요합니다</li>
        </ul>
        <p className="lv-scope__footer">
          입력값 기준의 참고 계산입니다. 임금채권 확정이나 분쟁 사안은 별도 검토가 필요합니다.
         개별 사안의 법적 판단이나 임금채권 확정은 <strong>담당 공인노무사</strong>의 검토를 거치시기 바랍니다.</p>
      </section>
    </div>
  );
}
