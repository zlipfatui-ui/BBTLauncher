import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { URL } from 'node:url';
import type {
  AuthErrorCode,
  AuthState,
  SafeMinecraftProfile
} from '../../shared/types.js';
import { PRODUCT_MICROSOFT_CLIENT_ID } from '../product-config.js';

const AUTH_SCOPES = ['XboxLive.signin', 'offline_access'];
const AUTHORITY = 'https://login.microsoftonline.com/consumers';
const CALLBACK_PATH = '/';
const CALLBACK_TIMEOUT_MS = 180_000;

export interface MinecraftServicesProfile {
  id: string;
  name: string;
}

export interface MinecraftSession {
  profile: SafeMinecraftProfile;
  accessToken: string;
  expiresAt: number;
}

interface MsalAccountLike {
  homeAccountId: string;
  username?: string;
}

interface MsalResultLike {
  accessToken: string;
  account?: MsalAccountLike | null;
}

interface MsalClientLike {
  getAuthCodeUrl(request: Record<string, unknown>): Promise<string>;
  acquireTokenByCode(request: Record<string, unknown>): Promise<MsalResultLike | null>;
  acquireTokenSilent(request: Record<string, unknown>): Promise<MsalResultLike>;
  getTokenCache(): {
    getAllAccounts(): Promise<MsalAccountLike[]>;
    removeAccount(account: MsalAccountLike): Promise<void>;
  };
}

interface CryptoProviderLike {
  createNewGuid(): string;
  generatePkceCodes(): Promise<{ verifier: string; challenge: string }>;
}

interface LoopbackResult {
  code: string;
  state: string;
}

interface LoopbackServer {
  redirectUri: string;
  waitForCode: Promise<LoopbackResult>;
  close(): void;
}

export interface MinecraftAuthServiceOptions {
  clientId?: string;
  fetchImpl?: typeof fetch;
  openExternal?: (url: string) => Promise<void>;
  tokenCachePlugin?: unknown;
  msalClient?: MsalClientLike;
  cryptoProvider?: CryptoProviderLike;
  loopbackFactory?: (expectedState: string, timeoutMs: number) => Promise<LoopbackServer>;
  exchangeSession?: (microsoftAccessToken: string) => Promise<MinecraftSession>;
  clearTokenCache?: () => Promise<void>;
}

export class AuthServiceError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

export function mapMinecraftProfileToSafeProfile(profile: MinecraftServicesProfile): SafeMinecraftProfile {
  return {
    id: profile.id,
    name: profile.name,
    avatarInitial: profile.name.slice(0, 1).toUpperCase() || 'B',
    provider: 'microsoft'
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function networkError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  return new AuthServiceError('NETWORK_ERROR', 'Unable to reach Microsoft or Minecraft services.');
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  serviceError?: { code: AuthErrorCode; message: string }
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw networkError(error);
  }
  const payload = await readJson(response);
  if (!response.ok) {
    const message = String(payload.errorMessage || payload.Message || '');
    if (response.status === 403 && /invalid app registration/i.test(message)) {
      throw new AuthServiceError(
        'MINECRAFT_APP_NOT_APPROVED',
        'BeforeBedtime Launcher is waiting for Minecraft Services App ID approval.'
      );
    }
    if (serviceError) {
      throw new AuthServiceError(serviceError.code, serviceError.message);
    }
    throw new AuthServiceError('NETWORK_ERROR', `Authentication service returned HTTP ${response.status}.`);
  }
  return payload;
}

export async function authenticateMinecraftSession(
  microsoftAccessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<MinecraftSession> {
  const xbox = await postJson(
    fetchImpl,
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${microsoftAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    },
    {
      code: 'XBOX_ACCOUNT_REQUIRED',
      message: 'This Microsoft account does not have an Xbox profile.'
    }
  );
  const xboxToken = String(xbox.Token || '');
  if (!xboxToken) {
    throw new AuthServiceError('XBOX_ACCOUNT_REQUIRED', 'This Microsoft account does not have an Xbox profile.');
  }

  const xsts = await postJson(
    fetchImpl,
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xboxToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    },
    {
      code: 'XSTS_RESTRICTED',
      message: 'Xbox authentication is restricted for this account.'
    }
  );
  const xui = (xsts.DisplayClaims as { xui?: Array<{ uhs?: string }> } | undefined)?.xui;
  const userHash = xui?.[0]?.uhs;
  const xstsToken = String(xsts.Token || '');
  if (!userHash || !xstsToken) {
    throw new AuthServiceError('XSTS_RESTRICTED', 'Xbox authentication is restricted for this account.');
  }

  const minecraftLogin = await postJson(
    fetchImpl,
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${userHash};${xstsToken}` }
  );
  const minecraftAccessToken = String(minecraftLogin.access_token || '');
  if (!minecraftAccessToken) {
    throw new AuthServiceError('NETWORK_ERROR', 'Minecraft Services did not return an access token.');
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetchImpl('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${minecraftAccessToken}` }
    });
  } catch (error) {
    throw networkError(error);
  }
  if (profileResponse.status === 404) {
    throw new AuthServiceError(
      'MINECRAFT_NOT_OWNED',
      'This Microsoft account does not own Minecraft: Java Edition.'
    );
  }
  if (!profileResponse.ok) {
    throw new AuthServiceError('NETWORK_ERROR', `Minecraft profile request returned HTTP ${profileResponse.status}.`);
  }

  const expiresIn = Number(minecraftLogin.expires_in || 3600);
  return {
    profile: mapMinecraftProfileToSafeProfile((await profileResponse.json()) as MinecraftServicesProfile),
    accessToken: minecraftAccessToken,
    expiresAt: Date.now() + expiresIn * 1000
  };
}

export async function authenticateMinecraftProfile(
  microsoftAccessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<SafeMinecraftProfile> {
  return (await authenticateMinecraftSession(microsoftAccessToken, fetchImpl)).profile;
}

export async function createLoopbackRedirectServer(
  expectedState: string,
  timeoutMs = CALLBACK_TIMEOUT_MS
): Promise<LoopbackServer> {
  let settled = false;
  let resolveCode!: (result: LoopbackResult) => void;
  let rejectCode!: (error: Error) => void;
  const waitForCode = new Promise<LoopbackResult>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    if (settled) {
      response.writeHead(409).end();
      return;
    }

    const requestUrl = new URL(request.url || '/', 'http://localhost');
    if (requestUrl.pathname !== CALLBACK_PATH) {
      response.writeHead(404).end();
      return;
    }

    settled = true;
    clearTimeout(timeout);
    const state = requestUrl.searchParams.get('state') || '';
    const code = requestUrl.searchParams.get('code') || '';
    const error = requestUrl.searchParams.get('error') || '';
    response.writeHead(error || !code || state !== expectedState ? 400 : 200, {
      'Content-Type': 'text/html; charset=utf-8'
    });
    response.end(
      error || !code || state !== expectedState
        ? 'Microsoft login failed. You can close this window.'
        : 'Microsoft login complete. You can close this window.'
    );

    if (error === 'access_denied') {
      rejectCode(new AuthServiceError('AUTH_CANCELLED', 'Microsoft login was cancelled.'));
    } else if (error || !code || state !== expectedState) {
      rejectCode(new AuthServiceError('AUTH_CANCELLED', 'Microsoft login response could not be verified.'));
    } else {
      resolveCode({ code, state });
    }
    server.close();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, 'localhost', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    server.close();
    rejectCode(new AuthServiceError('AUTH_TIMEOUT', 'Microsoft login timed out. Please try again.'));
  }, timeoutMs);
  timeout.unref?.();

  return {
    redirectUri: `http://localhost:${port}${CALLBACK_PATH}`,
    waitForCode,
    close: () => {
      clearTimeout(timeout);
      server.close();
    }
  };
}

export class MinecraftAuthService {
  private profile: SafeMinecraftProfile | null = null;
  private minecraftAccessToken: string | null = null;
  private minecraftAccessTokenExpiresAt = 0;
  private readonly clientId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly openExternal?: (url: string) => Promise<void>;
  private readonly tokenCachePlugin?: unknown;
  private msalClient?: MsalClientLike;
  private cryptoProvider?: CryptoProviderLike;
  private readonly loopbackFactory: (expectedState: string, timeoutMs: number) => Promise<LoopbackServer>;
  private readonly exchangeSession: (microsoftAccessToken: string) => Promise<MinecraftSession>;
  private readonly clearTokenCache: () => Promise<void>;
  private restoreAttempted = false;

  constructor(options: MinecraftAuthServiceOptions = {}) {
    this.clientId = options.clientId ?? process.env.BBT_MICROSOFT_CLIENT_ID ?? PRODUCT_MICROSOFT_CLIENT_ID;
    this.fetchImpl = options.fetchImpl || fetch;
    this.openExternal = options.openExternal;
    this.tokenCachePlugin = options.tokenCachePlugin;
    this.msalClient = options.msalClient;
    this.cryptoProvider = options.cryptoProvider;
    this.loopbackFactory = options.loopbackFactory || createLoopbackRedirectServer;
    this.exchangeSession =
      options.exchangeSession ||
      ((microsoftAccessToken) => authenticateMinecraftSession(microsoftAccessToken, this.fetchImpl));
    this.clearTokenCache = options.clearTokenCache || (async () => undefined);
  }

  private assertConfigured(): void {
    if (!this.clientId) {
      throw new AuthServiceError(
        'AUTH_CONFIG_MISSING',
        'Microsoft Login is not configured for this build of BeforeBedtime Launcher.'
      );
    }
  }

  private async getMsalClient(): Promise<MsalClientLike> {
    this.assertConfigured();
    if (this.msalClient) return this.msalClient;
    const { PublicClientApplication } = await import('@azure/msal-node');
    this.msalClient = new PublicClientApplication({
      auth: { clientId: this.clientId, authority: AUTHORITY },
      cache: this.tokenCachePlugin ? { cachePlugin: this.tokenCachePlugin as never } : undefined
    }) as unknown as MsalClientLike;
    return this.msalClient;
  }

  private async getCryptoProvider(): Promise<CryptoProviderLike> {
    if (this.cryptoProvider) return this.cryptoProvider;
    const { CryptoProvider } = await import('@azure/msal-node');
    this.cryptoProvider = new CryptoProvider();
    return this.cryptoProvider;
  }

  private applySession(session: MinecraftSession): MinecraftSession {
    this.profile = session.profile;
    this.minecraftAccessToken = session.accessToken;
    this.minecraftAccessTokenExpiresAt = session.expiresAt;
    return session;
  }

  async getState(): Promise<AuthState> {
    if (!this.restoreAttempted) {
      this.restoreAttempted = true;
      if (this.clientId) {
        try {
          await this.ensureSession();
        } catch {
          this.profile = null;
          this.minecraftAccessToken = null;
          this.minecraftAccessTokenExpiresAt = 0;
        }
      }
    }
    return {
      status: this.profile ? 'signed-in' : 'signed-out',
      profile: this.profile
    };
  }

  async getProfile(): Promise<SafeMinecraftProfile | null> {
    return (await this.getState()).profile;
  }

  async ensureSession(): Promise<MinecraftSession> {
    const client = await this.getMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    const account = accounts[0];
    if (!account) {
      throw new AuthServiceError('AUTH_REQUIRED', 'Login to Microsoft before launching Minecraft.');
    }

    try {
      const token = await client.acquireTokenSilent({ account, scopes: AUTH_SCOPES });
      if (!token?.accessToken) {
        throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft session expired. Login again.');
      }
      return this.applySession(await this.exchangeSession(token.accessToken));
    } catch (error) {
      if (error instanceof AuthServiceError) throw error;
      const errorCode = String((error as { errorCode?: string })?.errorCode || '');
      if (/interaction_required|login_required|no_tokens_found/i.test(errorCode)) {
        throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft session expired. Login again.');
      }
      throw networkError(error);
    }
  }

  async getSession(): Promise<MinecraftSession | null> {
    if (
      this.profile &&
      this.minecraftAccessToken &&
      this.minecraftAccessTokenExpiresAt > Date.now() + 60_000
    ) {
      return {
        profile: this.profile,
        accessToken: this.minecraftAccessToken,
        expiresAt: this.minecraftAccessTokenExpiresAt
      };
    }
    try {
      return await this.ensureSession();
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === 'AUTH_REQUIRED') return null;
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (this.msalClient) {
      const cache = this.msalClient.getTokenCache();
      const accounts = await cache.getAllAccounts();
      await Promise.all(accounts.map((account) => cache.removeAccount(account)));
    }
    await this.clearTokenCache();
    this.profile = null;
    this.minecraftAccessToken = null;
    this.minecraftAccessTokenExpiresAt = 0;
    this.restoreAttempted = true;
  }

  async loginMicrosoft(): Promise<SafeMinecraftProfile> {
    this.assertConfigured();
    if (!this.openExternal) {
      throw new AuthServiceError('AUTH_CONFIG_MISSING', 'System browser login is not available.');
    }

    const [client, crypto] = await Promise.all([this.getMsalClient(), this.getCryptoProvider()]);
    const state = crypto.createNewGuid();
    const pkce = await crypto.generatePkceCodes();
    const loopback = await this.loopbackFactory(state, CALLBACK_TIMEOUT_MS);

    try {
      const authCodeUrl = await client.getAuthCodeUrl({
        scopes: AUTH_SCOPES,
        redirectUri: loopback.redirectUri,
        prompt: 'select_account',
        state,
        codeChallenge: pkce.challenge,
        codeChallengeMethod: 'S256'
      });
      await this.openExternal(authCodeUrl);
      const callback = await loopback.waitForCode;
      const token = await client.acquireTokenByCode({
        code: callback.code,
        state: callback.state,
        codeVerifier: pkce.verifier,
        scopes: AUTH_SCOPES,
        redirectUri: loopback.redirectUri
      });
      if (!token?.accessToken) {
        throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft login did not return an access token.');
      }
      return this.applySession(await this.exchangeSession(token.accessToken)).profile;
    } catch (error) {
      throw networkError(error);
    } finally {
      loopback.close();
    }
  }
}
