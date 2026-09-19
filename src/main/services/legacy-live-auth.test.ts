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
  it('cancels the owned login resource promptly and ignores a late authorization code', async () => {
    let resolveCode!: (value: { code: string }) => void;
    let signal: AbortSignal | undefined;
    let stored: string | null = null;
    let exchanges = 0;
    const service = new LegacyLiveAuthService({
      openAuthWindow: (_url, _redirect, abortSignal) => {
        signal = abortSignal;
        return new Promise((resolve) => { resolveCode = resolve; });
      },
      fetchImpl: (async () => { exchanges++; return new Response(JSON.stringify({ access_token: 'late', refresh_token: 'late-refresh' })); }) as typeof fetch,
      exchangeSession: async () => minecraftSession,
      loadRefreshToken: async () => stored,
      saveRefreshToken: async (token) => { stored = token; },
      clearRefreshToken: async () => { stored = null; }
    });
    const login = service.loginMicrosoft().catch((error) => error);
    await vi.waitFor(() => expect(resolveCode).toBeTypeOf('function'));
    await service.cancelLogin();
    expect(signal?.aborted).toBe(true);
    expect(await login).toMatchObject({ code: 'AUTH_CANCELLED' });
    resolveCode({ code: 'late-code' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exchanges).toBe(0);
    expect(stored).toBeNull();
    expect(await service.getState()).toEqual({ status: 'signed-out', profile: null });
  });

  it('prevents a cancelled late Minecraft exchange from persisting and permits a new login', async () => {
    let resolveOld!: (session: MinecraftSession) => void;
    let stored: string | null = null;
    let exchanges = 0;
    const service = new LegacyLiveAuthService({
      openAuthWindow: async () => ({ code: 'code' }),
      fetchImpl: (async () => new Response(JSON.stringify({ access_token: 'ms-token', refresh_token: `refresh-${exchanges}` }))) as typeof fetch,
      exchangeSession: async () => {
        exchanges++;
        if (exchanges === 1) return new Promise((resolve) => { resolveOld = resolve; });
        return { ...minecraftSession, profile: { ...minecraftSession.profile, name: 'NewPlayer' } };
      },
      loadRefreshToken: async () => stored,
      saveRefreshToken: async (token) => { stored = token; },
      clearRefreshToken: async () => { stored = null; }
    });
    const old = service.loginMicrosoft().catch((error) => error);
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    await service.cancelLogin();
    expect(await old).toMatchObject({ code: 'AUTH_CANCELLED' });
    expect(stored).toBeNull();
    expect(await service.loginMicrosoft()).toMatchObject({ name: 'NewPlayer' });
    resolveOld(minecraftSession);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored).toBe('refresh-1');
    expect(await service.getState()).toMatchObject({ status: 'signed-in', profile: { name: 'NewPlayer' } });
  });

  it('logout invalidates an in-flight session restore and a pending credential write', async () => {
    let resolveWrite!: () => void;
    let stored: string | null = 'old';
    const service = new LegacyLiveAuthService({
      openAuthWindow: async () => ({ code: 'code' }),
      fetchImpl: (async () => new Response(JSON.stringify({ access_token: 'ms-token', refresh_token: 'late' }))) as typeof fetch,
      exchangeSession: async () => minecraftSession,
      loadRefreshToken: async () => stored,
      saveRefreshToken: async (token) => { await new Promise<void>((resolve) => { resolveWrite = resolve; }); stored = token; },
      clearRefreshToken: async () => { stored = null; }
    });
    const restore = service.getState();
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf('function'));
    const logout = service.logout();
    resolveWrite();
    await logout;
    await restore;
    expect(stored).toBeNull();
    expect(await service.getState()).toEqual({ status: 'signed-out', profile: null });
  });

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
