import Link from "next/link";

import { LeaveInput } from "@/components/leave/LeaveInput";

export const metadata = {
  title: "연차 일수 계산 | 일의 무늬",
  description:
    "이름과 입사일만 붙여넣으면 입사일 기준 연차 발생일수를 한 번에 계산합니다. 대장 값을 함께 넣으면 차이까지 대조합니다.",
  alternates: { canonical: "https://yellowenvelope.kr/tools/leave" },
  openGraph: {
    title: "연차 일수 계산 | 일의 무늬",
    description: "이름과 입사일만 붙여넣으면 입사일 기준 연차 발생일수를 한 번에 계산합니다. 대장 값을 함께 넣으면 차이까지 대조합니다.",
    url: "https://yellowenvelope.kr/tools/leave",
    siteName: "일의 무늬",
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary", title: "연차 일수 계산 | 일의 무늬", description: "이름과 입사일만 붙여넣으면 입사일 기준 연차 발생일수를 한 번에 계산합니다. 대장 값을 함께 넣으면 차이까지 대조합니다." },
};

export default function LeaveToolPage() {
  return (
    <div className="lv-page">
      <header className="lv-head">
        <p className="lv-head__eyebrow">노무사·인사담당자를 위한 연차 계산</p>
        <h1 className="lv-head__title t-hero">연차휴가 계산기</h1>
        <p className="lv-head__lede">
          한 명씩 계산기에 넣고 엑셀로 옮기는 일을 없앱니다. 명단을 그대로 붙여넣으면{" "}
          <strong>입사일 기준 연차일수</strong>를 한 번에 계산하고, 대장 값을 함께 넣으면{" "}
          <strong>어디가 다른지</strong>까지 짚어드립니다.
        </p>
      </header>

      <p className="lv-terms">
        <strong>무료로 쓰실 수 있습니다.</strong> 가입·결제가 없고 사용 횟수 제한도 없습니다.
        법률 자문이 아니라 <strong>계산을 도와드리는 도구</strong>이며, 입력값을 기준으로
        계산한 <strong>참고 결과</strong>입니다.
      </p>

      <LeaveInput />

      <section className="lv-how">
        <div className="lv-how__item">
          <span className="lv-how__num">계산 기준</span>
          <p>
            근로기준법 제60조 — 1년 미만 개월당 1일(상한 11일), 1년 이상 15일, 3년 이상
            2년마다 1일 가산(상한 25일)
          </p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">처리 방식</span>
          <p>엑셀 붙여넣기와 파일 열기를 지원하며, 결과는 바로 복사하거나 내려받을 수 있습니다</p>
        </div>
        <div className="lv-how__item">
          <span className="lv-how__num">이어서</span>
          <p>
            <Link href="/tools/leave/settlement">퇴직자 정산</Link> ·{" "}
            <Link href="/tools/leave/advanced">반차·출근율·사용촉진</Link>
          </p>
        </div>
      </section>

      <section className="lv-scope">
        <h2 className="lv-scope__title">계산 범위</h2><p className="lv-scope__footer">첫해는 매월 개근을 전제로 합니다. 1년 이상 결과는 해당 시점의 연간 발생분이며, 첫해 11일을 더한 누계나 현재 잔여일수가 아닙니다. 발생일에 재직해야 하며, 월말·2월 29일 입사와 근태 예외는 별도 검토가 필요합니다.</p>
        <ul className="lv-scope__list">
          <li>
            <strong>상시 5인 이상 사업장</strong>의 <strong>1주 소정근로시간 15시간 이상</strong>
            근로자를 전제로 합니다
          </li>
          <li>
            입사일 기준 <strong>발생일수</strong> 계산입니다. 이월·사용분을 뺀 잔여일수는
            별도로 봐야 합니다
          </li>
          <li>
            회계연도로 운영하는 사업장의 퇴직 정산은{" "}
            <Link href="/tools/leave/settlement">퇴직자 정산</Link>에서 다룹니다
          </li>
          <li>1년 이상 15일은 직전 1년 출근율 80% 이상을 전제로 합니다</li>
          <li>출근율 80% 미만, 육아휴직 등 특수 출결은 조건이 달라질 수 있습니다</li>
          <li>회사가 법정 기준에 더해 부여한 추가 연차는 반영되지 않습니다</li>
        </ul>
        <p className="lv-scope__footer">
          입력값 기준의 참고 계산입니다. 임금채권 확정이나 분쟁 사안은 별도 검토가 필요합니다.
         개별 사안의 법적 판단이나 임금채권 확정은 <strong>담당 공인노무사</strong>의 검토를 거치시기 바랍니다.</p>
      </section>

      <footer className="lv-foot">
        <p>
          개인정보는 브라우저 안에서만 처리됩니다. 파일과 붙여넣은 내용은 서버로 보내지 않습니다.
        </p>
      </footer>
    </div>
  );
}
