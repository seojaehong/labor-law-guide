import Link from "next/link";

import { PromotionInput } from "@/components/leave/PromotionInput";
import { UsageInput } from "@/components/leave/UsageInput";

export const metadata = {
  title: "사용촉진 일정 · 반차 환산 | 일의 무늬",
  description:
    "연차 사용촉진 일정이 법정 기간에 맞는지 대조하고, 반차·반반차·시간차를 일 단위로 환산합니다.",
  alternates: { canonical: "https://yellowenvelope.kr/tools/leave/advanced" },
  openGraph: {
    title: "연차 사용촉진 · 반차 환산 | 일의 무늬",
    description: "연차 사용촉진 일정을 법정 기간과 대조하고, 반차·반반차·시간차를 일수로 환산합니다.",
    url: "https://yellowenvelope.kr/tools/leave/advanced",
    siteName: "일의 무늬",
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary", title: "연차 사용촉진 · 반차 환산 | 일의 무늬", description: "연차 사용촉진 일정을 법정 기간과 대조하고, 반차·반반차·시간차를 일수로 환산합니다." },
};

export default function AdvancedPage() {
  return (
    <div className="lv-page">
      <header className="lv-head">
        <p className="lv-head__eyebrow">노무사·인사담당자를 위한 연차 점검</p>
        <h1 className="lv-head__title">사용촉진 일정 · 반차 환산</h1>
        <p className="lv-head__lede">
          촉구를 <strong>언제까지 해야 하는지</strong> 날짜로 확인하고, 반차·반반차·시간차
          사용분을 <strong>일 단위로 환산</strong>합니다.
        </p>
      </header>

      <p className="lv-terms">
        <strong>무료로 쓰실 수 있습니다.</strong> 법률 자문이 아니라 계산을 도와드리는
        도구이며, 입력값 기준의 참고 결과입니다.
      </p>

      <section className="lv-section">
        <h2 className="lv-section__title">연차 사용촉진 일정</h2>
        <p className="lv-section__lede">
          사용기간 종료일을 넣으면 1차 촉구·2차 통보 기간을 계산합니다. 실제로 보낸 날짜를
          넣으면 기간 안에 했는지 대조합니다.
        </p>
        <p className="lv-terms">기간은 법정 절차의 날짜를 확인하는 참고값입니다. 1년 미만의 9일·2일은 최대 개근 예시이며 실제 미사용일수를 뜻하지 않습니다. 첫 묶음을 놓쳐도 후발 발생분은 별도로 확인합니다. 첫해 사용기간을 연장해도 촉진 기준은 최초 1년 종료일이며, 1년 미만 계약 종료 예정·부분 회신·사용 보장·퇴직 전 미사용수당은 이 도구가 판정하지 않습니다.</p><PromotionInput />
      </section>

      <section className="lv-section">
        <h2 className="lv-section__title">반차 · 반반차 · 시간차 환산</h2>
        <p className="lv-section__lede">
          사용 기록을 일 단위로 환산하고, 사업장 규칙과 다른 기록을 짚어드립니다.
        </p>
        <UsageInput />
      </section>

      <section className="lv-how">
        <div className="lv-how__item">
          <span className="lv-how__num">촉진 기준</span>
          <p>
            근로기준법 제61조 — 1년 이상은 사용기간 끝 <strong>6개월 전 기준 10일 이내</strong>{" "}
            1차 촉구, <strong>2개월 전까지</strong> 2차 통보. 1년 미만은 기간이 다릅니다
          </p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">환산 기준</span>
          <p>
            반차 0.5일 · 반반차 0.25일 · 시간차는{" "}
            <strong>사업장 소정근로시간</strong>으로 나눕니다
          </p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">이어서</span>
          <p>
            <Link href="/tools/leave">연차 일수 계산</Link> ·{" "}
            <Link href="/tools/leave/settlement">퇴직 정산</Link>
          </p>
        </div>
      </section>

      <section className="lv-scope">
        <h2 className="lv-scope__title">계산 범위</h2>
        <ul className="lv-scope__list">
          <li>
            사용촉진은 날짜만 대조합니다. 서면 여부·도달·노무수령 거부는 별도 확인이 필요합니다
          </li>
          <li>
            근로자 응답기한은 <strong>촉구를 받은 날</strong>부터 셉니다. 수령일을 모르면 기한을
            계산하지 않습니다
          </li>
          <li>
            <strong>시간 단위 연차</strong>는 근로기준법에 규정이 없고, 행정해석은 1일 단위
            부여가 법 취지에 부합한다고 봅니다(임금근로시간과-2819)
          </li>
          <li>반차·반반차는 법정 제도가 아니라 취업규칙·노사합의 사항입니다</li>
        </ul>
        <p className="lv-scope__footer">
          입력값 기준의 참고 계산입니다. 임금채권 확정이나 분쟁 사안은 별도 검토가 필요합니다.
         개별 사안의 법적 판단이나 임금채권 확정은 <strong>담당 공인노무사</strong>의 검토를 거치시기 바랍니다.</p>
      </section>
    </div>
  );
}
