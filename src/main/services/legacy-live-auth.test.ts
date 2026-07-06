import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_LIVE_CLIENT_ID,
  LEGACY_LIVE_REDIRECT_URI,
  LegacyLiveAuthService,
  extractLegacyLiveCode
} from './legacy-live-auth';
import type { MinecraftSession } from './auth';

const minecraftSession: MinecraftSession = {
  profile: {
    id: '898da750881840f09da4ea6822260b30',
    name: 'Zlevyn',
    avatarInitial: 'Z',
    provider: 'microsoft'
  },
  accessToken: 'minecraft-access-token',
  expiresAt: Date.now() + 3_600_000
};

describe('legacy Live OAuth callback parsing', () => {
  it('extracts the Microsoft auth code from the desktop redirect URI', () => {
    expect(
      extractLegacyLiveCode(`${LEGACY_LIVE_REDIRECT_URI}?code=live-code&lc=1033`, LEGACY_LIVE_REDIRECT_URI)
    ).toBe('live-code');
  });

  it('ignores navigation that is not the registered desktop redirect URI', () => {
    expect(extractLegacyLiveCode('https://login.live.com/oauth20_authorize.srf', LEGACY_LIVE_REDIRECT_URI)).toBeNull();
  });

  it('maps an access_denied redirect to AUTH_CANCELLED', () => {
    expect(() =>
      extractLegacyLiveCode(`${LEGACY_LIVE_REDIRECT_URI}?error=access_denied`, LEGACY_LIVE_REDIRECT_URI)
    ).toThrowError(expect.objectContaining({ code: 'AUTH_CANCELLED' }));
  });
});

describe('LegacyLiveAuthService', () => {
  it('opens the legacy Microsoft Live login URL and exchanges the returned code', async () => {
    let openedUrl = '';
    const openAuthWindow = vi.fn(async (url: string, redirectUri: string) => {
      openedUrl = url;
      expect(redirectUri).toBe(LEGACY_LIVE_REDIRECT_URI);
      return { code: 'live-code' };
    });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain('grant_type=authorization_code');
      expect(String(init?.body)).toContain('code=live-code');
      return new Response(JSON.stringify({
        access_token: 'microsoft-access-token',
        refresh_token: 'live-refresh-token',
        expires_in: 3600
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const saveRefreshToken = vi.fn(async () => undefined);
    const exchangeSession = vi.fn(async () => minecraftSession);
    const service = new LegacyLiveAuthService({
      openAuthWindow,
      fetchImpl,
      exchangeSession,
      loadRefreshToken: vi.fn(async () => null),
      saveRefreshToken,
      clearRefreshToken: vi.fn(async () => undefined)
    });

    await expect(service.loginMicrosoft()).resolves.toMatchObject({ name: 'Zlevyn' });

    const authUrl = new URL(openedUrl);
    expect(authUrl.origin + authUrl.pathname).toBe('https://login.live.com/oauth20_authorize.srf');
    expect(authUrl.searchParams.get('client_id')).toBe(LEGACY_LIVE_CLIENT_ID);
    expect(authUrl.searchParams.get('redirect_uri')).toBe(LEGACY_LIVE_REDIRECT_URI);
    expect(authUrl.searchParams.get('scope')).toBe('XboxLive.signin offline_access');
    expect(exchangeSession).toHaveBeenCalledWith('microsoft-access-token');
    expect(saveRefreshToken).toHaveBeenCalledWith('live-refresh-token');
  });

  it('restores a remembered account by refreshing the legacy Live token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain('grant_type=refresh_token');
      expect(String(init?.body)).toContain('refresh_token=old-refresh-token');
      return new Response(JSON.stringify({
        access_token: 'fresh-microsoft-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const saveRefreshToken = vi.fn(async () => undefined);
    const exchangeSession = vi.fn(async () => minecraftSession);
    const service = new LegacyLiveAuthService({
      openAuthWindow: vi.fn(),
      fetchImpl,
      exchangeSession,
      loadRefreshToken: vi.fn(async () => 'old-refresh-token'),
      saveRefreshToken,
      clearRefreshToken: vi.fn(async () => undefined)
    });

    await expect(service.getState()).resolves.toMatchObject({
      status: 'signed-in',
      profile: { name: 'Zlevyn' }
    });
    expect(exchangeSession).toHaveBeenCalledWith('fresh-microsoft-access-token');
    expect(saveRefreshToken).toHaveBeenCalledWith('new-refresh-token');
  });

  it('clears remembered legacy credentials on logout', async () => {
    const clearRefreshToken = vi.fn(async () => undefined);
    const service = new LegacyLiveAuthService({
      openAuthWindow: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      exchangeSession: vi.fn(),
      loadRefreshToken: vi.fn(async () => null),
      saveRefreshToken: vi.fn(async () => undefined),
      clearRefreshToken
    });

    await service.logout();

    expect(clearRefreshToken).toHaveBeenCalledOnce();
    await expect(service.getState()).resolves.toEqual({ status: 'signed-out', profile: null });
  });
});
