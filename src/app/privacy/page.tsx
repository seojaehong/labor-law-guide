import { publicMetadata } from '@/lib/public-metadata';
import { CONTACT_EMAIL } from '@/lib/site-contact';
import { RETENTION } from '@/lib/privacy-retention';
import type { Metadata } from 'next';

export const metadata: Metadata = publicMetadata({
  title: '개인정보처리방침 | 일의 무늬',
  description: '일의 무늬 개인정보처리방침',
});

// 근거: 개인정보 보호법 제30조(처리방침)·제28조의8(국외 이전). 보유기간 = src/lib/privacy-retention.ts.

const h2 = 'mt-10 text-base font-bold';
const link = { color: 'var(--color-accent-ink)' } as const;

export default function PrivacyPage() {
  return (
    <main className="layout-reading">
      <h1 className="t-h2" style={{ color: 'var(--color-text-primary)' }}>개인정보처리방침</h1>
      <p className="mt-4 text-sm text-gray-600">시행일: 2026-11-05</p>

      <div className="mt-8 space-y-4 text-sm leading-7 text-gray-800">
        <p>
          일의 무늬(yellowenvelope.kr, 이하 &lsquo;사이트&rsquo;)는 도구와 안내를 제공하는 데 필요한
          개인정보만 처리합니다. 회원가입은 없습니다. 계산기와 서식 도구 대부분은 이용자의 브라우저 안에서만
          계산하며, 입력값을 서버로 보내지 않습니다.
        </p>

        <h2 className={h2}>1. 처리하는 개인정보와 목적</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>AI 질문(/ai)</strong>: 대화 내용, 세션 ID. 답변을 만들고 답변 품질을 고치기 위해 씁니다.
            질문 앞부분 500자와 IP 해시를 저장하고, 대화에서 정리된 상황 정보(사업장 규모·근속·월급·고용형태 등)를
            세션 단위로 저장합니다.
          </li>
          <li>
            <strong>검색·징계 사례 찾기</strong>: 검색어와 입력한 사건 설명. 결과를 찾기 위해 AI 업체로 보내며
            저장하지 않습니다.
          </li>
          <li>
            <strong>근로계약서 파일 자동 입력</strong>: 올린 사진·파일. 계약 조건(기간·근로시간·임금·조항)을 읽기 위해
            AI 업체로 보내며 저장하지 않습니다. <strong>파일은 통째로 전송되므로</strong> 이름·주민등록번호·주소는
            가린 뒤 올려 주세요. 자동 입력을 쓰지 않으면 계약 내용은 서버로 가지 않습니다.
          </li>
          <li>
            <strong>규정 정비 스캔 쪽 읽기</strong>: 읽기에 동의한 쪽의 이미지만 AI 업체로 보내며 저장하지 않습니다.
          </li>
          <li>
            <strong>취업규칙 점검(/laws)</strong>: 취업규칙 본문과 점검 요청. 점검 결과를 만들기 위해 AI 업체로
            보냅니다. 점검 기록은 남기며, 본문은 이용자가 보관에 동의한 경우에만 저장합니다.
          </li>
          <li>
            <strong>사업장 관할 찾기</strong>: 사업자등록번호·주소. 공공데이터포털(근로복지공단) 조회에만 쓰고
            저장하지 않습니다. 4대보험 서식의 주민등록번호는 브라우저 밖으로 나가지 않습니다.
          </li>
          <li>
            <strong>소식지 구독</strong>: 이메일, 동의 문구, 유입 경로(이전 페이지·광고 표시값), IP 해시, 브라우저
            정보. 소식지를 보내고 수신 상태를 관리하기 위해 씁니다.
          </li>
          <li>
            <strong>문의(/contact)</strong>: 이름, 연락처, 이메일, 문의 내용. 답변하기 위해 씁니다.
          </li>
          <li>
            <strong>자동 수집</strong>: 접속 IP, 브라우저 정보, 접속 기록. 사이트 운영·보안과 이용 통계에 씁니다.
            IP는 이용 한도 계산을 위해 해시(되돌릴 수 없는 값)로 바꿔 저장합니다.
          </li>
        </ul>

        <h2 className={h2}>2. 보유기간과 파기</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b"><th className="py-2 pr-4">항목</th><th className="py-2">보유기간</th></tr>
          </thead>
          <tbody>
            {RETENTION.map((r) => (
              <tr key={r.item} className="border-b"><td className="py-2 pr-4">{r.item}</td><td className="py-2">{r.period}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          기간이 지나면 매일 도는 삭제 작업이 데이터베이스에서 지웁니다. 문의 메일은 메일함에서 직접 지웁니다.
          AI 업체로 보낸 내용은 사이트가 저장하지 않으며, 업체 쪽 보관은 아래 각 업체의 정책을 따릅니다.
        </p>

        <h2 className={h2}>3. 제3자 제공</h2>
        <p>개인정보를 제3자에게 제공하지 않습니다. 법령에 따른 요청이 있는 경우는 예외입니다.</p>

        <h2 className={h2}>4. 처리 위탁과 국외 이전</h2>
        <p>
          아래 업체에 처리를 맡기며, 대부분 국외에서 처리됩니다. 이전 시점은 이용자가 해당 기능을 쓸 때이고,
          방법은 암호화된 네트워크 전송입니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Vercel Inc.</strong>(미국 법인, 서버 싱가포르) — 사이트 운영. 모든 요청과 접속 기록.</li>
          <li><strong>Supabase Inc.</strong>(미국 법인, 서버 싱가포르) — 데이터 저장. 2절의 저장 항목.</li>
          <li><strong>Cloudflare, Inc.</strong>(미국) — 네트워크 전달, 자동화(봇) 차단. 접속 IP와 브라우저 신호. AI 질문·계약서 파일·규정 정비·취업규칙 점검 화면은 접속만으로 봇 확인이 동작합니다.</li>
          <li><strong>Anthropic PBC</strong>(미국) — AI 답변·문서 읽기. 대화 내용, 검색어, 사건 설명, 계약서 파일, 스캔 쪽 이미지, 취업규칙 본문.</li>
          <li><strong>OpenAI, L.L.C.</strong>(미국) — AI 답변·검색. 질문, 검색어, 사건 설명.</li>
          <li><strong>Google LLC</strong>(미국 법인) — AI 답변(Vertex AI·Gemini, 대화 내용·사건 설명), 이용 통계(Google Analytics, 접속 정보).</li>
          <li><strong>Resend, Inc.</strong>(미국) — 메일 발송. 이메일 주소, 문의 내용, 소식지 수신 기록.</li>
        </ul>
        <p>
          국외 이전을 원하지 않으면 해당 기능(AI 질문, 검색, 파일 자동 입력, 취업규칙 점검, 소식지, 문의)을 쓰지
          않으면 됩니다. 브라우저 안에서 도는 계산기와 서식 도구는 그대로 쓸 수 있습니다. 다만 사이트 접속 자체는
          위 운영·전달 업체를 거칩니다.
        </p>

        <h2 className={h2}>5. 브라우저에 남는 정보와 쿠키</h2>
        <p>
          일부 도구는 다시 열 때 입력값을 채우려고 이용자 브라우저(localStorage 등)에 값을 남깁니다. 연차 도구에서
          &lsquo;기억하기&rsquo;를 켠 직원 명단, 퇴직금 계산기의 입력값이 그렇습니다. 이 값은 서버로 가지 않으며,
          브라우저의 사이트 데이터 삭제로 지울 수 있습니다. AI 질문의 세션 ID는 브라우저에 남고 질문할 때 서버로
          보냅니다.
        </p>
        <p>
          이용 통계에 Google Analytics 쿠키를 씁니다. 브라우저 설정에서 쿠키를 막거나 Google의 차단 부가 기능을
          쓰면 수집되지 않으며, 사이트 이용에는 지장이 없습니다.
        </p>

        <h2 className={h2}>6. 이용자의 권리</h2>
        <p>
          이용자는 자기 개인정보의 열람·정정·삭제·처리정지를 요구할 수 있습니다. 아래 이메일로 요청하면 지체 없이
          처리합니다. 소식지는 메일 하단 링크로 바로 해지할 수 있고, AI 질문 화면의 상황 정보는 화면에서 지울 수
          있습니다. 회원가입이 없어 본인 확인이 어려운 기록(세션 ID·IP 해시로만 남은 기록)은 요청 시 확인 가능한
          범위에서 처리합니다.
        </p>

        <h2 className={h2}>7. 안전성 확보 조치</h2>
        <p>
          전송 구간 암호화, 데이터베이스 접근 권한 제한, 관리 키의 서버 환경 보관, IP 해시 저장, 보유기간 경과 자동
          삭제를 적용합니다.
        </p>

        <h2 className={h2}>8. 개인정보 보호책임자</h2>
        <p>
          서재홍 · <a className="underline underline-offset-2" style={link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          개인정보 침해는 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118),
          개인정보분쟁조정위원회(kopico.go.kr, 1833-6972), 대검찰청(1301), 경찰청(ecrm.police.go.kr, 국번없이 182)에
          신고할 수 있습니다.
        </p>

        <h2 className={h2}>9. 변경</h2>
        <p>이 방침을 바꾸면 시행일과 함께 이 화면에 알립니다. 이전 방침: 2026-04-20.</p>
      </div>
    </main>
  );
}
