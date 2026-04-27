'use client';

import { useEffect, useRef, useId, useCallback } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'invisible';
          appearance?: 'always' | 'execute' | 'interaction-only';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      execute: (widgetId?: string) => void;
    };
  }
}

type Props = {
  onToken: (token: string | null) => void;
};

export default function TurnstileWidget({ onToken }: Props) {
  const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const containerId = useId().replace(/:/g, '_');
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const tryRender = useCallback(() => {
    if (!SITE_KEY) return;
    if (widgetIdRef.current) return;
    if (!window.turnstile) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      size: 'compact',
      appearance: 'interaction-only', // 평소엔 숨김, 의심 트래픽일 때만 노출
      callback: (token: string) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(null),
      'error-callback': () => onTokenRef.current(null),
    });
  }, [SITE_KEY, containerId]);

  useEffect(() => {
    // 스크립트 로드 후 turnstile 객체가 늦게 도착할 수 있어 폴링
    if (!SITE_KEY) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      tryRender();
      if (!widgetIdRef.current && tries < 40) {
        tries += 1;
        setTimeout(tick, 250);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [SITE_KEY, tryRender]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onLoad={tryRender}
      />
      <div id={containerId} aria-hidden="true" />
    </>
  );
}
