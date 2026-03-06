import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '노란봉투법 완벽 가이드 - 2026 개정 노동조합법';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* 상단 배지 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '999px',
            backgroundColor: '#2563eb',
            color: '#fff',
            fontSize: '22px',
            fontWeight: 600,
            marginBottom: '24px',
          }}
        >
          2026.3.10. 시행
        </div>

        {/* 메인 타이틀 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: '72px',
              fontWeight: 800,
              color: '#1e293b',
              lineHeight: 1.2,
            }}
          >
            노란봉투법
          </div>
          <div
            style={{
              fontSize: '42px',
              fontWeight: 700,
              color: '#334155',
              lineHeight: 1.3,
            }}
          >
            완벽 가이드
          </div>
        </div>

        {/* 설명 */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '32px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['해석지침', '교섭절차', '자가진단', '판례검색', 'AI 상담'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255,255,255,0.8)',
                color: '#2563eb',
                fontSize: '22px',
                fontWeight: 600,
                border: '1px solid #93c5fd',
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* 하단 로고 */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#64748b',
            fontSize: '20px',
          }}
        >
          노무법인 위너스
        </div>
      </div>
    ),
    { ...size }
  );
}
