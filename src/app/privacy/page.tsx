import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 노란봉투법 가이드',
  description: '노란봉투법 가이드 개인정보처리방침',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold tracking-tight">개인정보처리방침</h1>
      <p className="mt-4 text-sm text-gray-600">최종 업데이트: 2026-04-20</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-gray-800">
        <p>
          노란봉투법 가이드는 서비스 제공 및 상담 접수 처리에 필요한 최소한의 개인정보만 수집·이용합니다.
          수집된 정보는 관련 법령 및 내부 보관 기준에 따라 안전하게 관리합니다.
        </p>
        <p>
          수집 항목: 이름(또는 회사명), 연락처, 문의 내용<br />
          이용 목적: 문의 응대, 상담 진행, 서비스 품질 개선
        </p>
        <p>
          보유 기간: 목적 달성 후 지체 없이 파기하되, 관계 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.
        </p>
        <p>
          <strong>근로계약서 자가진단 도구(/tools/contract-check)</strong>: 폼에 입력한 계약 내용은 서버로
          전송되지 않고 이용자의 브라우저 안에서만 계산됩니다. 다만 &lsquo;계약서 사진으로 자동 입력&rsquo;
          기능을 이용하는 경우에 한해 업로드한 이미지가 판독(분석) 목적으로만 서버를 거쳐 인공지능
          모델에 전달되며, 이미지와 판독 결과는 저장하지 않고 응답 후 즉시 폐기합니다. 판독 항목은 계약
          조건(기간·근로시간·임금·조항)에 한정하며 성명·생년월일·주민등록번호·주소·연락처는 수집하지
          않습니다. 사진 기능을 이용하지 않으면 어떤 계약 정보도 서버로 전송되지 않습니다.
        </p>
        <p>
          개인정보 관련 문의는 <a className="underline" href="/contact">상담 문의 페이지</a>를 통해 접수할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
