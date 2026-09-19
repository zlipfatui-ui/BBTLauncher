import { describe, expect, it, vi } from 'vitest';
import {
  AuthServiceError,
  MinecraftAuthService,
  authenticateMinecraftSession,
  createLoopbackRedirectServer,
  mapMinecraftProfileToSafeProfile
} from './auth';

describe('auth profile mapping', () => {
  it('maps Minecraft Services profile to a renderer-safe account object', () => {
    expect(
      mapMinecraftProfileToSafeProfile({
        id: '898da750881840f09da4ea6822260b30',
        name: 'Zlevyn'
      })
    ).toEqual({
      id: '898da750881840f09da4ea6822260b30',
      name: 'Zlevyn',
      avatarInitial: 'Z',
      provider: 'microsoft'
    });
  });
});

describe('Minecraft auth exchange', () => {
  it('maps an XSTS authorization failure to XSTS_RESTRICTED', async () => {
    const responses = [
      new Response(JSON.stringify({ Token: 'xbl' }), { status: 200 }),
      new Response(JSON.stringify({ XErr: 2148916238, Message: 'The account is restricted.' }), {
        status: 401
      })
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(authenticateMinecraftSession('microsoft-token', fetchImpl)).rejects.toMatchObject({
      code: 'XSTS_RESTRICTED'
    });
  });

  it('maps an unapproved Minecraft application to a renderer-safe error', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('user.auth.xboxlive.com')) {
        return new Response(JSON.stringify({ Token: 'xbl', DisplayClaims: { xui: [{ uhs: 'user-hash' }] } }), { status: 200 });
      }
      if (String(url).includes('xsts.auth.xboxlive.com')) {
        return new Response(JSON.stringify({ Token: 'xsts', DisplayClaims: { xui: [{ uhs: 'user-hash' }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ errorMessage: 'Invalid app registration, see https://aka.ms/AppRegInfo' }), { status: 403 });
    }) as unknown as typeof fetch;

    await expect(authenticateMinecraftSession('microsoft-token', fetchImpl)).rejects.toMatchObject({
      code: 'MINECRAFT_APP_NOT_APPROVED'
    });
  });

  it('maps a missing Minecraft Java profile to MINECRAFT_NOT_OWNED', async () => {
    const responses = [
      new Response(JSON.stringify({ Token: 'xbl', DisplayClaims: { xui: [{ uhs: 'user-hash' }] } }), { status: 200 }),
      new Response(JSON.stringify({ Token: 'xsts', DisplayClaims: { xui: [{ uhs: 'user-hash' }] } }), { status: 200 }),
      new Response(JSON.stringify({ access_token: 'minecraft-token', expires_in: 3600 }), { status: 200 }),
      new Response('{}', { status: 404 })
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(authenticateMinecraftSession('microsoft-token', fetchImpl)).rejects.toMatchObject({
      code: 'MINECRAFT_NOT_OWNED'
    });
  });
});

describe('Microsoft loopback callback', () => {
  it('uses a root localhost redirect path for Azure public client matching', async () => {
    const loopback = await createLoopbackRedirectServer('expected-state', 1_000);

    expect(new URL(loopback.redirectUri).pathname).toBe('/');
    loopback.close();
    await expect(loopback.waitForCode).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
  });

  it('rejects a callback whose state does not match', async () => {
    const loopback = await createLoopbackRedirectServer('expected-state', 1_000);
    const callbackResult = loopback.waitForCode.catch((error) => error as AuthServiceError);

    const response = await fetch(`${loopback.redirectUri}?code=auth-code&state=wrong-state`);
    const error = await callbackResult;

    expect(response.status).toBe(400);
    expect(error.code).toBe('AUTH_CANCELLED');
    loopback.close();
  });

  it('times out when Microsoft does not call back', async () => {
    const loopback = await createLoopbackRedirectServer('expected-state', 10);

    await expect(loopback.waitForCode).rejects.toMatchObject({ code: 'AUTH_TIMEOUT' });
    loopback.close();
  });
});

describe('MinecraftAuthService', () => {
  it('closes an active callback listener on cancel, rejects promptly and ignores a late callback', async () => {
    let resolveCode!: (value: { code: string; state: string }) => void;
    let closed = false;
    let tokens = 0;
    const service = new MinecraftAuthService({
      clientId: 'test-client', openExternal: async () => undefined,
      cryptoProvider: { createNewGuid: () => 'state', generatePkceCodes: async () => ({ verifier: 'v', challenge: 'c' }) },
      loopbackFactory: async () => ({ redirectUri: 'http://localhost:1234/',
        waitForCode: new Promise((resolve) => { resolveCode = resolve; }), close: () => { closed = true; } }),
      msalClient: {
        getTokenCache: () => ({ getAllAccounts: async () => [], removeAccount: async () => undefined }),
        getAuthCodeUrl: async () => 'https://login.example.test', acquireTokenSilent: vi.fn(),
        acquireTokenByCode: async () => { tokens++; return { accessToken: 'late' }; }
      },
      exchangeSession: async () => ({ profile: mapMinecraftProfileToSafeProfile({ id: 'id', name: 'Late' }), accessToken: 'mc', expiresAt: Date.now() + 3600000 })
    });
    const login = service.loginMicrosoft().catch((error) => error);
    await vi.waitFor(() => expect(resolveCode).toBeTypeOf('function'));
    await service.cancelLogin();
    expect(closed).toBe(true);
    expect(await login).toMatchObject({ code: 'AUTH_CANCELLED' });
    resolveCode({ code: 'late', state: 'state' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tokens).toBe(0);
    expect(await service.getState()).toEqual({ status: 'signed-out', profile: null });
  });

  it('invalidates a late Minecraft exchange on logout and a fresh login stays signed in', async () => {
    let resolveOld!: (value: any) => void;
    let exchanges = 0;
    const session = (name: string) => ({ profile: mapMinecraftProfileToSafeProfile({ id: name, name }), accessToken: name, expiresAt: Date.now() + 3600000 });
    const service = new MinecraftAuthService({
      clientId: 'test-client', openExternal: async () => undefined,
      cryptoProvider: { createNewGuid: () => 'state', generatePkceCodes: async () => ({ verifier: 'v', challenge: 'c' }) },
      loopbackFactory: async () => ({ redirectUri: 'http://localhost:1234/', waitForCode: Promise.resolve({ code: 'code', state: 'state' }), close: () => undefined }),
      msalClient: {
        getTokenCache: () => ({ getAllAccounts: async () => [{ homeAccountId: 'old' }], removeAccount: async () => undefined }),
        getAuthCodeUrl: async () => 'https://login.example.test', acquireTokenSilent: async () => ({ accessToken: 'old' }),
        acquireTokenByCode: async () => ({ accessToken: 'token' })
      },
      exchangeSession: async () => ++exchanges === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : session('Fresh')
    });
    const old = service.loginMicrosoft().catch((error) => error);
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    await service.logout();
    expect(await old).toMatchObject({ code: 'AUTH_CANCELLED' });
    await expect(service.ensureSession()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(await service.loginMicrosoft()).toMatchObject({ name: 'Fresh' });
    resolveOld(session('Old'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await service.getState()).toMatchObject({ status: 'signed-in', profile: { name: 'Fresh' } });
  });

  it('blocks late MSAL cache persistence after cancellation', async () => {
    let resolveToken!: () => void;
    let persisted = '';
    const service = new MinecraftAuthService({
      clientId: 'test-client', openExternal: async () => undefined,
      tokenCachePlugin: { beforeCacheAccess: async () => undefined,
        afterCacheAccess: async () => { persisted = 'late credentials'; } },
      clearTokenCache: async () => { persisted = ''; },
      msalClientFactory: async (plugin) => ({
        getTokenCache: () => ({ getAllAccounts: async () => [], removeAccount: async () => undefined }),
        getAuthCodeUrl: async () => 'https://login.example.test', acquireTokenSilent: vi.fn(),
        acquireTokenByCode: async () => {
          await new Promise<void>((resolve) => { resolveToken = resolve; });
          await plugin?.afterCacheAccess({ cacheHasChanged: true, tokenCache: { serialize: () => 'cache' } });
          return { accessToken: 'token' };
        }
      }),
      cryptoProvider: { createNewGuid: () => 'state', generatePkceCodes: async () => ({ verifier: 'v', challenge: 'c' }) },
      loopbackFactory: async () => ({ redirectUri: 'http://localhost:1234/', waitForCode: Promise.resolve({ code: 'code', state: 'state' }), close: () => undefined }),
      exchangeSession: vi.fn()
    });
    const login = service.loginMicrosoft().catch((error) => error);
    await vi.waitFor(() => expect(resolveToken).toBeTypeOf('function'));
    await service.cancelLogin();
    resolveToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await login).toMatchObject({ code: 'AUTH_CANCELLED' });
    expect(persisted).toBe('');
    expect(await service.getState()).toEqual({ status: 'signed-out', profile: null });
  });

  it('uses S256 PKCE and the verified loopback code for interactive login', async () => {
    const getAuthCodeUrl = vi.fn(async () => 'https://login.example.test/authorize');
    const acquireTokenByCode = vi.fn(async () => ({ accessToken: 'microsoft-token' }));
    const msalClient = {
      getTokenCache: () => ({
        getAllAccounts: vi.fn(async () => []),
        removeAccount: vi.fn(async () => undefined)
      }),
      acquireTokenSilent: vi.fn(),
      getAuthCodeUrl,
      acquireTokenByCode
    };
    const close = vi.fn();
    const openExternal = vi.fn(async () => undefined);
    const exchangeSession = vi.fn(async () => ({
      profile: {
        id: '898da750881840f09da4ea6822260b30',
        name: 'Zlevyn',
        avatarInitial: 'Z',
        provider: 'microsoft' as const
      },
      accessToken: 'minecraft-token',
      expiresAt: Date.now() + 3_600_000
    }));
    const service = new MinecraftAuthService({
      clientId: '00000000-0000-4000-8000-000000000001',
      msalClient,
      cryptoProvider: {
        createNewGuid: () => 'expected-state',
        generatePkceCodes: async () => ({
          verifier: 'pkce-verifier',
          challenge: 'pkce-challenge'
        })
      },
      loopbackFactory: async () => ({
        redirectUri: 'http://localhost:43123/auth/callback',
        waitForCode: Promise.resolve({ code: 'auth-code', state: 'expected-state' }),
        close
      }),
      openExternal,
      exchangeSession
    });

    await expect(service.loginMicrosoft()).resolves.toMatchObject({ name: 'Zlevyn' });
    expect(getAuthCodeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'expected-state',
        codeChallenge: 'pkce-challenge',
        codeChallengeMethod: 'S256'
      })
    );
    expect(acquireTokenByCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'auth-code',
        state: 'expected-state',
        codeVerifier: 'pkce-verifier'
      })
    );
    expect(openExternal).toHaveBeenCalledWith('https://login.example.test/authorize');
    expect(close).toHaveBeenCalledOnce();
  });

  it('restores an account silently and removes it on logout', async () => {
    const account = { homeAccountId: 'home-account', username: 'user@example.test' };
    const removeAccount = vi.fn(async () => undefined);
    const msalClient = {
      getTokenCache: () => ({
        getAllAccounts: vi.fn(async () => [account]),
        removeAccount
      }),
      acquireTokenSilent: vi.fn(async () => ({ accessToken: 'microsoft-token', account })),
      getAuthCodeUrl: vi.fn(),
      acquireTokenByCode: vi.fn()
    };
    const exchangeSession = vi.fn(async () => ({
      profile: {
        id: '898da750881840f09da4ea6822260b30',
        name: 'Zlevyn',
        avatarInitial: 'Z',
        provider: 'microsoft' as const
      },
      accessToken: 'minecraft-token',
      expiresAt: Date.now() + 3_600_000
    }));
    const clearTokenCache = vi.fn(async () => undefined);
    const service = new MinecraftAuthService({
      clientId: '00000000-0000-4000-8000-000000000001',
      msalClient,
      exchangeSession,
      clearTokenCache
    });

    await expect(service.getState()).resolves.toMatchObject({
      status: 'signed-in',
      profile: { name: 'Zlevyn' }
    });
    await service.logout();

    expect(removeAccount).toHaveBeenCalledWith(account);
    expect(clearTokenCache).toHaveBeenCalledOnce();
    await expect(service.getState()).resolves.toEqual({ status: 'signed-out', profile: null });
  });

  it('returns AUTH_CONFIG_MISSING when no client id is configured', async () => {
    const service = new MinecraftAuthService({ clientId: '' });

    await expect(service.loginMicrosoft()).rejects.toMatchObject({
      code: 'AUTH_CONFIG_MISSING'
    } satisfies Partial<AuthServiceError>);
  });
});
