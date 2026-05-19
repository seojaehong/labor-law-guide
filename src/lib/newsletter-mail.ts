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
// 디자인 v6 (2026-05-11 finalized): 흰색 메인 + #1b64da 강조 (toss blue700)
//   - Gmail 다크모드 색 변환 회피 위해 헤더 흰색
//   - full content (preview 아닌 본문 전체)
//   - 둘러보기 카드 + light footer
export async function sendDailyNewsletter(opts: {
  to: string;
  unsubscribeToken: string;
  article: {
    slug: string;
    title: string;
    summary: string;
    content: string; // 본문 전체 (full text, HTML 그대로)
    published_at: string;
  };
}) {
  const unsubUrl = `${SITE_URL}/api/subscribers/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const articleUrl = `${SITE_URL}/blog/${opts.article.slug}`;

  // 정확한 KST 날짜 + 요일
  const KST_DAYS = ['일', '월', '화', '수', '목', '금', '토']; // getUTCDay() 0=Sun
  const pubDt = new Date(opts.article.published_at);
  const kstMs = pubDt.getTime() + 9 * 3600 * 1000;
  const kstDt = new Date(kstMs);
  const dateLabel = `${kstDt.getUTCMonth() + 1}월 ${kstDt.getUTCDate()}일 (${KST_DAYS[kstDt.getUTCDay()]})`;

  // 제목 정리: '[5월 11일] 노동뉴스 브리핑 — ' prefix 제거 (header에 이미 있음)
  // surrogate pair 이모지를 character class에 넣으면 JS regex가 surrogate를 분리해서
  // 깨진 \uDCCC 등이 잔여로 남는 버그(2026-05-14 이메일 본문 `📰� [2026...]` 사고).
  // string-based startsWith으로 안전하게 제거.
  let cleanTitle = opts.article.title;
  const emojiPrefixes = ['📌', '📰', '⚖️', '🎯', '💰', '🤝', '🚚', '🏖️', '✏️', '📑'];
  for (const e of emojiPrefixes) {
    if (cleanTitle.startsWith(e)) {
      cleanTitle = cleanTitle.slice(e.length).trimStart();
      break;
    }
  }
  // 날짜 prefix 제거 — '[5월 11일] 노동뉴스 브리핑 — ' 또는 '[2026.05.14] 노동뉴스 브리핑 — '
  cleanTitle = cleanTitle.replace(/^\[(?:\d+년\s*)?(?:\d{4}\.)?\d+[월.]\s*\d+일?\.?\]\s*노동뉴스\s*브리핑\s*[—-]\s*/, '').trim();
  const displayTitle = cleanTitle.length <= 50 ? cleanTitle : cleanTitle.slice(0, 48) + '…';

  // 본문 sanitize (script/style 제거)
  let safeContent = opts.article.content.replace(/<script[\s\S]*?<\/script>/gi, '');
  safeContent = safeContent.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 메일 클라이언트는 base URL 없어 상대 URL이 깨짐 — 사이트 절대 URL로 자동 치환 (DB 데이터 누락 케이스 방어)
  safeContent = safeContent.replace(/href="\/(?!\/)/g, `href="${SITE_URL}/`);
  safeContent = safeContent.replace(/src="\/(?!\/)/g, `src="${SITE_URL}/`);

  // subject — 50자 제한
  let subject = `[${kstDt.getUTCMonth() + 1}월 ${kstDt.getUTCDate()}일] ${displayTitle}`;
  if (subject.length > 50) subject = subject.slice(0, 48) + '…';

  const ACCENT = '#1b64da';
  const TEXT_PRIMARY = '#191f28';
  const TEXT_SECONDARY = '#6b7684';
  const BORDER = '#e5e8eb';

  const summaryBlock = opts.article.summary
    ? `<p style="margin:0 0 28px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.6;padding-left:14px;border-left:3px solid ${ACCENT}">${opts.article.summary}</p>`
    : '';

  const html = `<div style="background:#ffffff;padding:0;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">
    <div style="padding:32px 28px 24px;text-align:center;border-bottom:1px solid ${BORDER}">
      <p style="margin:0 0 8px;color:${ACCENT};font-size:11px;letter-spacing:1.5px;font-weight:800;text-transform:uppercase">Daily Briefing · ${dateLabel}</p>
      <h1 style="margin:0;color:${TEXT_PRIMARY};font-size:20px;font-weight:800;letter-spacing:-0.3px">📬 노동법 위클리</h1>
    </div>
    <div style="padding:36px 28px;color:${TEXT_PRIMARY};line-height:1.7;font-size:15px">
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.35;letter-spacing:-0.5px">📰 ${displayTitle}</h2>
      ${summaryBlock}
      <div style="color:#374151;font-size:15px;line-height:1.85">${safeContent}</div>
      <div style="margin:36px 0 0;text-align:center">
        <a href="${articleUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">🔗 사이트에서 보기</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:24px 28px;border-top:1px solid ${BORDER}">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:${TEXT_PRIMARY}">📌 노동법 위클리 둘러보기</p>
      <p style="margin:0 0 4px;font-size:13px"><a href="${SITE_URL}/blog" style="color:${ACCENT};text-decoration:none">→ 지난 딥다이브 모음</a></p>
      <p style="margin:0 0 4px;font-size:13px"><a href="${SITE_URL}/" style="color:${ACCENT};text-decoration:none">→ AI 챗봇 (노동법 질문)</a></p>
      <p style="margin:0;font-size:13px"><a href="${SITE_URL}/sanction" style="color:${ACCENT};text-decoration:none">→ 징계/해고 AI 비교분석</a></p>
    </div>
    <div style="background:#f2f4f6;padding:24px 28px;text-align:center">
      <p style="margin:0 0 6px;color:${TEXT_PRIMARY};font-size:12px;font-weight:700">노동법 위클리</p>
      <p style="margin:0;color:${TEXT_SECONDARY};font-size:11px;line-height:1.7">
        노란봉투법 가이드 · 노무법인 위너스<br>
        발신: news@yellowenvelope.kr · 답장: ${REPLY_TO}<br>
        <a href="${SITE_URL}" style="color:${ACCENT};text-decoration:none">yellowenvelope.kr</a> ·
        <a href="${unsubUrl}" style="color:${TEXT_SECONDARY};text-decoration:underline">수신 거부</a>
      </p>
    </div>
  </div>
</div>`;

  const resend = getResend();
  return resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: opts.to,
    subject,
    html,
  });
}
