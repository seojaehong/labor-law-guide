import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/lib/site-contact';

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
      from: '일의 무늬 <onboarding@resend.dev>',
      to: process.env.CONTACT_ADMIN_EMAIL || CONTACT_EMAIL,
      subject: `[일의 무늬] ${safeType} - ${safeName}`,
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
        from: '일의 무늬 <onboarding@resend.dev>',
        to: email,
        subject: '[일의 무늬] 문의가 접수되었습니다',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1d4ed8">${safeName}님, 안녕하세요.</h2>
            <p>일의 무늬에 의견을 보내 주셔서 감사합니다.</p>
            <p>보내 주신 내용은 확인한 뒤 서비스 개선에 반영하고, 회신이 필요한 경우 이 메일 주소로 연락드립니다.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:4px 0"><strong>문의 유형:</strong> ${safeType}</p>
              <p style="margin:4px 0"><strong>문의 내용:</strong></p>
              <p style="margin:4px 0;white-space:pre-line">${safeMessage}</p>
            </div>
            <p>추가 자료나 정정사항이 있으면 <a href="https://yellowenvelope.kr/contact">문의 페이지</a>에 다시 남겨 주세요.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#94a3b8;font-size:13px">
              일의 무늬 | ${CONTACT_EMAIL}<br/>
              <a href="https://yellowenvelope.kr" style="color:#1d4ed8">yellowenvelope.kr</a>
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
