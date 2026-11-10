import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Never connect to the real subscriber database or mail provider in these tests.
const { fromMock, query, sendWelcomeEmail } = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  return { fromMock: vi.fn(), query, sendWelcomeEmail: vi.fn() };
});

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('@/lib/rate-limit', () => ({
  extractIp: () => '192.0.2.1',
  hashIp: () => 'synthetic-ip-hash',
}));
vi.mock('@/lib/newsletter-mail', () => ({ sendWelcomeEmail }));

import { POST } from '@/app/api/subscribers/route';

const NOW = '2026-11-10T12:00:00.000Z';
const CONSENT = '매일 아침 보내드리는 노동법 뉴스레터 수신에 동의합니다.';
const SAVED = { unsubscribe_token: 'synthetic-unsubscribe-token' };
const ERROR_BODY = { error: '신청 저장에 실패했습니다.' };

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'synthetic-test' },
    body: JSON.stringify({
      email: 'Reader@Example.com',
      source: 'home-bottom',
      consent_text: CONSENT,
      ...overrides,
    }),
  });
}

function existingSubscriber(status = 'unsubscribed') {
  return {
    id: 'synthetic-subscriber',
    status,
    unsubscribed_at: '2026-11-01T00:00:00.000Z',
  };
}

function results(existing: unknown, saved: unknown = SAVED, error: unknown = null) {
  query.maybeSingle
    .mockResolvedValueOnce({ data: existing, error: null })
    .mockResolvedValueOnce({ data: saved, error });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  fromMock.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  sendWelcomeEmail.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/subscribers single opt-in', () => {
  it.each(['unsubscribed', 'pending'])('confirms %s subscribers and clears the delivery exclusion', async (status) => {
    results(existingSubscriber(status));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'confirmed',
      confirmed_at: NOW,
      unsubscribed_at: null,
      consent_at: NOW,
      consent_text: CONSENT,
      ip_hash: 'synthetic-ip-hash',
      user_agent: 'synthetic-test',
    }));
    expect(query.eq).toHaveBeenCalledWith('id', 'synthetic-subscriber');
    expect(query.select).toHaveBeenLastCalledWith('unsubscribe_token');
    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith({
      to: 'reader@example.com',
      unsubscribeToken: SAVED.unsubscribe_token,
    });
    expect(query.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['database error', null, { message: 'synthetic update failure' }],
    ['missing row', null, null],
    ['error even when data is returned', SAVED, { message: 'synthetic update failure' }],
  ])('rejects a re-subscription with %s without sending welcome mail', async (_label, saved, error) => {
    results(existingSubscriber(), saved, error);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(ERROR_BODY);
    expect(query.update).toHaveBeenCalledOnce();
    expect(query.insert).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('does not update or send another welcome email for an already confirmed subscriber', async () => {
    results(existingSubscriber('confirmed'));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, already_subscribed: true });
    expect(query.update).not.toHaveBeenCalled();
    expect(query.insert).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('confirms new subscribers with consent and uses their saved unsubscribe token', async () => {
    results(null);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      email: 'reader@example.com',
      status: 'confirmed',
      confirmed_at: NOW,
      consent_at: NOW,
      consent_text: CONSENT,
    }));
    expect(query.select).toHaveBeenLastCalledWith('unsubscribe_token');
    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith({
      to: 'reader@example.com',
      unsubscribeToken: SAVED.unsubscribe_token,
    });
    expect(query.update).not.toHaveBeenCalled();
  });

  it.each([
    ['database error', { message: 'synthetic insert failure' }],
    ['missing row', null],
  ])('rejects new subscriptions with %s', async (_label, error) => {
    results(null, null, error);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(ERROR_BODY);
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it.each([null, existingSubscriber()])('keeps a saved subscription successful when welcome email fails', async (existing) => {
    results(existing);
    sendWelcomeEmail.mockRejectedValueOnce(new Error('synthetic mail failure'));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(console.error).toHaveBeenCalledWith(
      '[subscribers] welcome email send failed:',
      expect.any(Error),
    );
  });

  it.each([
    { email: 'not-an-email' },
    { consent_text: '' },
    { source: 'unknown-source' },
  ])('rejects invalid input before persistence: %j', async (input) => {
    const response = await POST(request(input));

    expect(response.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
