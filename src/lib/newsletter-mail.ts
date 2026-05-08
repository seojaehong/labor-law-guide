import { Resend } from 'resend';
import { SITE_URL } from './constants';

// Resend에 verified된 root 도메인 사용 — send. subdomain은 미인증 (2026-05-08)
const FROM = '노동법 위클리 <news@yellowenvelope.kr>';
const REPLY_TO = 'abc@winhr.co.kr';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY가 설정되지 않았습니다.');
  return new Resend(key);
}

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color: #1f2937;
  line-height: 1.7;
  font-size: 15px;
  max-width: 560px;
  margin: 0 auto;
  padding: 24px;
`;

const buttonStyle = `
  display: inline-block;
  background-color: #facc15;
  color: #1e293b;
  padding: 12px 28px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  margin: 16px 0;
`;

const footerStyle = `
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
`;

export async function sendConfirmEmail(opts: {
  to: string;
  confirmToken: string;
}) {
  const confirmUrl = `${SITE_URL}/api/subscribers/confirm?token=${encodeURIComponent(opts.confirmToken)}`;
  const html = `
    <div style="${baseStyle}">
      <p>안녕하세요 🙏</p>
      <p>노동법 위클리 신청해주셔서 감사합니다.</p>
      <p>아래 버튼을 한 번 눌러주시면 구독이 시작됩니다.<br>
        (스팸 가입 방지를 위한 절차예요.)</p>
      <p style="text-align:center">
        <a href="${confirmUrl}" style="${buttonStyle}">구독 확인하기</a>
      </p>
      <p style="font-size:13px;color:#6b7280">
        30일 안에 확인하지 않으면 자동 폐기됩니다.<br>
        이 메일을 받으신 적이 없다면 무시하셔도 좋아요.
      </p>
      <div style="${footerStyle}">
        <strong>노동법 위클리</strong> · 노란봉투법 가이드 (노무법인 위너스)<br>
        발신: news@send.yellowenvelope.kr · 답장: ${REPLY_TO}
      </div>
    </div>
  `;
  const resend = getResend();
  return resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: opts.to,
    subject: '[노동법 위클리] 구독 확인 — 한 번만 클릭해주세요',
    html,
  });
}

export async function sendWelcomeEmail(opts: {
  to: string;
  unsubscribeToken: string;
}) {
  const unsubUrl = `${SITE_URL}/api/subscribers/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const html = `
    <div style="${baseStyle}">
      <p style="font-size:18px;font-weight:600">환영합니다 🎉</p>
      <p>이제 매주 노동법 인사이트가 도착합니다:</p>
      <ul>
        <li>행정해석 변경 알림</li>
        <li>신규 판례 분석</li>
        <li>실무 체크리스트</li>
      </ul>
      <p>
        <strong>발송 일정</strong>: 주 1~2회 (월요일 오전 9시 KST)<br>
        <strong>다음 메일</strong>: 5월 둘째 주
      </p>
      <p>첫 메일이 스팸함에 들어갔으면 \"스팸 아님\" 표시 부탁드려요.</p>
      <p style="text-align:center">
        <a href="${SITE_URL}" style="${buttonStyle}">사이트 가기</a>
        <a href="${SITE_URL}/blog" style="${buttonStyle};background-color:#f3f4f6;color:#374151;margin-left:8px">지난 글 모음</a>
      </p>
      <div style="${footerStyle}">
        <strong>노동법 위클리</strong> · 노란봉투법 가이드 (노무법인 위너스)<br>
        발신: news@yellowenvelope.kr · 답장: ${REPLY_TO}<br>
        수신을 원치 않으시면 <a href="${unsubUrl}" style="color:#6b7280">여기를 클릭</a>해주세요.
      </div>
    </div>
  `;
  const resend = getResend();
  return resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: opts.to,
    subject: '[노동법 위클리] 구독 시작! 첫 인사이트 보내드릴게요',
    html,
  });
}

// 데일리 브리핑 발송 — 매일 KST 09:00 cron
// 디자인은 사이트 톤 (toss blue #3182f6 + grey neutral). 사용자 검토 v4 기반.
export async function sendDailyNewsletter(opts: {
  to: string;
  unsubscribeToken: string;
  article: {
    slug: string;
    title: string;
    summary: string;
    content_preview: string; // 본문 첫 600자 정도
    published_at: string;
  };
}) {
  const unsubUrl = `${SITE_URL}/api/subscribers/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const articleUrl = `${SITE_URL}/blog/${opts.article.slug}`;
  const dateStr = new Date(opts.article.published_at).toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  });

  const html = `
<div style="background:#f9fafb;padding:0;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">
    <div style="background:#3182f6;padding:28px 24px;text-align:center">
      <p style="margin:0 0 4px;color:#bfdbfe;font-size:12px;letter-spacing:1px;font-weight:600">📰 DAILY BRIEFING · ${dateStr}</p>
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px">노동법 위클리</h1>
    </div>
    <div style="padding:32px 28px;color:#191f28;line-height:1.7;font-size:15px">
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#191f28;letter-spacing:-0.3px">${opts.article.title}</h2>
      ${opts.article.summary ? `<p style="margin:0 0 20px;color:#3182f6;font-size:14px;font-weight:600">${opts.article.summary}</p>` : ''}
      <div style="color:#374151;font-size:15px;line-height:1.8">${opts.article.content_preview}</div>
      <div style="margin:32px 0 0;text-align:center">
        <a href="${articleUrl}" style="display:inline-block;background:#3182f6;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">전체 글 읽기 →</a>
      </div>
    </div>
    <div style="background:#191f28;padding:24px 28px;text-align:center">
      <p style="margin:0 0 6px;color:#ffffff;font-size:13px;font-weight:700">노동법 위클리</p>
      <p style="margin:0;color:#8b95a1;font-size:11px;line-height:1.7">
        노란봉투법 가이드 · 노무법인 위너스<br>
        발신: news@yellowenvelope.kr · 답장: ${REPLY_TO}<br>
        <a href="${SITE_URL}" style="color:#3182f6;text-decoration:none">yellowenvelope.kr</a> ·
        <a href="${unsubUrl}" style="color:#8b95a1;text-decoration:underline">수신 거부</a>
      </p>
    </div>
  </div>
</div>`;

  const resend = getResend();
  return resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: opts.to,
    subject: `[${dateStr}] ${opts.article.title}`,
    html,
  });
}
