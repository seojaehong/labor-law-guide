import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY가 설정되지 않았습니다.');
  return new Resend(key);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, email, type, message } = await req.json();

    if (!name || !phone || !message) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    const resend = getResend();

    const safeName = escapeHtml(name);
    const safePhone = escapeHtml(phone);
    const safeEmail = email ? escapeHtml(email) : '미입력';
    const safeType = escapeHtml(type || '일반');
    const safeMessage = escapeHtml(message);

    // 1. 관리자에게 문의 알림
    await resend.emails.send({
      from: '노란봉투법 가이드 <onboarding@resend.dev>',
      to: process.env.CONTACT_ADMIN_EMAIL || 'iceamericano9@gmail.com',
      subject: `[노란봉투법] ${safeType} - ${safeName}`,
      html: `
        <h2>새 문의가 접수되었습니다</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:100px">이름</td><td style="padding:8px;border:1px solid #ddd">${safeName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">연락처</td><td style="padding:8px;border:1px solid #ddd">${safePhone}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">이메일</td><td style="padding:8px;border:1px solid #ddd">${safeEmail}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">유형</td><td style="padding:8px;border:1px solid #ddd">${safeType}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">내용</td><td style="padding:8px;border:1px solid #ddd;white-space:pre-line">${safeMessage}</td></tr>
        </table>
      `,
    });

    // 2. 고객에게 자동 회신 (이메일이 있을 경우)
    if (email) {
      await resend.emails.send({
        from: '노무법인 위너스 <onboarding@resend.dev>',
        to: email,
        subject: '[노무법인 위너스] 문의가 접수되었습니다',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1d4ed8">${safeName}님, 안녕하세요.</h2>
            <p>노무법인 위너스에 문의해 주셔서 감사합니다.</p>
            <p>접수하신 내용을 확인 후 <strong>영업일 기준 1~2일 이내</strong>에 연락드리겠습니다.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:4px 0"><strong>문의 유형:</strong> ${safeType}</p>
              <p style="margin:4px 0"><strong>문의 내용:</strong></p>
              <p style="margin:4px 0;white-space:pre-line">${safeMessage}</p>
            </div>
            <p>추가 자료나 정정사항이 있으면 <a href="https://www.xn--o80bk8isxeinax68f.com/contact">문의 페이지</a>에 다시 남겨 주세요.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#94a3b8;font-size:13px">
              노무법인 위너스 | 서울시 서초구 나루터로 61, 402호<br/>
              <a href="https://winhr.co.kr" style="color:#1d4ed8">winhr.co.kr</a>
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Contact API error:', error);
    return NextResponse.json(
      { error: '전송에 실패했습니다.' },
      { status: 500 }
    );
  }
}
