import type { AuthState, SafeMinecraftProfile } from '../../shared/types.js';
import {
  AuthServiceError,
  authenticateMinecraftSession,
  type MinecraftSession
} from './auth.js';

export const LEGACY_LIVE_CLIENT_ID = '00000000402b5328';
export const LEGACY_LIVE_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const LEGACY_LIVE_AUTHORIZE_URL = 'https://login.live.com/oauth20_authorize.srf';
const LEGACY_LIVE_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const LEGACY_LIVE_SCOPE = 'XboxLive.signin offline_access';

interface LegacyLiveTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export interface LegacyLiveAuthServiceOptions {
  clientId?: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
  openAuthWindow: (url: string, redirectUri: string) => Promise<{ code: string }>;
  exchangeSession?: (microsoftAccessToken: string) => Promise<MinecraftSession>;
  loadRefreshToken: () => Promise<string | null>;
  saveRefreshToken: (refreshToken: string) => Promise<void>;
  clearRefreshToken: () => Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function networkError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  return new AuthServiceError('NETWORK_ERROR', 'Unable to reach Microsoft or Minecraft services.');
}

export function extractLegacyLiveCode(url: string, redirectUri = LEGACY_LIVE_REDIRECT_URI): string | null {
  if (!url.startsWith(redirectUri)) return null;

  const parsed = new URL(url);
  const error = parsed.searchParams.get('error');
  if (error === 'access_denied') {
    throw new AuthServiceError('AUTH_CANCELLED', 'Microsoft login was cancelled.');
  }
  if (error) {
    throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft login did not complete.');
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft login did not return an authorization code.');
  }
  return code;
}

export class LegacyLiveAuthService {
  private profile: SafeMinecraftProfile | null = null;
  private minecraftAccessToken: string | null = null;
  private minecraftAccessTokenExpiresAt = 0;
  private restoreAttempted = false;
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly fetchImpl: typeof fetch;
  private readonly openAuthWindow: (url: string, redirectUri: string) => Promise<{ code: string }>;
  private readonly exchangeSession: (microsoftAccessToken: string) => Promise<MinecraftSession>;
  private readonly loadRefreshToken: () => Promise<string | null>;
  private readonly saveRefreshToken: (refreshToken: string) => Promise<void>;
  private readonly clearRefreshToken: () => Promise<void>;

  constructor(options: LegacyLiveAuthServiceOptions) {
    this.clientId = options.clientId || LEGACY_LIVE_CLIENT_ID;
    this.redirectUri = options.redirectUri || LEGACY_LIVE_REDIRECT_URI;
    this.fetchImpl = options.fetchImpl || fetch;
    this.openAuthWindow = options.openAuthWindow;
    this.exchangeSession =
      options.exchangeSession ||
      ((microsoftAccessToken) => authenticateMinecraftSession(microsoftAccessToken, this.fetchImpl));
    this.loadRefreshToken = options.loadRefreshToken;
    this.saveRefreshToken = options.saveRefreshToken;
    this.clearRefreshToken = options.clearRefreshToken;
  }

  private buildAuthorizeUrl(): string {
    const url = new URL(LEGACY_LIVE_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', LEGACY_LIVE_SCOPE);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  private async exchangeLiveToken(params: URLSearchParams): Promise<LegacyLiveTokenResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(LEGACY_LIVE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    } catch (error) {
      throw networkError(error);
    }

    const payload = asRecord(await response.json().catch(() => ({})));
    if (!response.ok || payload.error) {
      const error = String(payload.error || '');
      if (/access_denied/i.test(error)) {
        throw new AuthServiceError('AUTH_CANCELLED', 'Microsoft login was cancelled.');
      }
      if (/invalid_grant|expired/i.test(error)) {
        throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft session expired. Login again.');
      }
      throw new AuthServiceError('NETWORK_ERROR', 'Microsoft Live OAuth token exchange failed.');
    }

    const accessToken = String(payload.access_token || '');
    if (!accessToken) {
      throw new AuthServiceError('AUTH_REQUIRED', 'Microsoft login did not return an access token.');
    }

    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
    };
  }

  private async exchangeCode(code: string): Promise<LegacyLiveTokenResponse> {
    return this.exchangeLiveToken(new URLSearchParams({
      client_id: this.clientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    }));
  }

  private async refreshLiveToken(refreshToken: string): Promise<LegacyLiveTokenResponse> {
    return this.exchangeLiveToken(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken
    }));
  }

  private async applyMicrosoftToken(token: LegacyLiveTokenResponse): Promise<MinecraftSession> {
    if (token.refreshToken) {
      await this.saveRefreshToken(token.refreshToken);
    }
    const session = await this.exchangeSession(token.accessToken);
    this.profile = session.profile;
    this.minecraftAccessToken = session.accessToken;
    this.minecraftAccessTokenExpiresAt = session.expiresAt;
    return session;
  }

  async loginMicrosoft(): Promise<SafeMinecraftProfile> {
    const { code } = await this.openAuthWindow(this.buildAuthorizeUrl(), this.redirectUri);
    return (await this.applyMicrosoftToken(await this.exchangeCode(code))).profile;
  }

  async ensureSession(): Promise<MinecraftSession> {
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

    const refreshToken = await this.loadRefreshToken();
    if (!refreshToken) {
      throw new AuthServiceError('AUTH_REQUIRED', 'Login to Microsoft before launching Minecraft.');
    }
    return this.applyMicrosoftToken(await this.refreshLiveToken(refreshToken));
  }

  async getSession(): Promise<MinecraftSession | null> {
    try {
      return await this.ensureSession();
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === 'AUTH_REQUIRED') return null;
      throw error;
    }
  }

  async getState(): Promise<AuthState> {
    if (!this.restoreAttempted) {
      this.restoreAttempted = true;
      try {
        await this.ensureSession();
      } catch {
        this.profile = null;
        this.minecraftAccessToken = null;
        this.minecraftAccessTokenExpiresAt = 0;
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

  async logout(): Promise<void> {
    await this.clearRefreshToken();
    this.profile = null;
    this.minecraftAccessToken = null;
    this.minecraftAccessTokenExpiresAt = 0;
    this.restoreAttempted = true;
  }
}
