import { Resend } from 'resend';
import { SITE_URL } from './constants';

const FROM = '노동법 위클리 <news@send.yellowenvelope.kr>';
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
        발신: news@send.yellowenvelope.kr · 답장: ${REPLY_TO}<br>
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
