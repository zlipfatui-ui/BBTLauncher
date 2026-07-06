# Microsoft Auth Setup

The launcher currently defaults to `legacy-live`, a launcher-style Microsoft Live OAuth flow similar to older Minecraft launchers. This lets development continue while the BeforeBedtime App ID waits for Minecraft Services approval.

To force the official MSAL provider after the App ID is approved:

```powershell
$env:BBT_AUTH_PROVIDER="msal"
npm run dev:electron
```

The MSAL provider uses a public Microsoft desktop app registration. Do not create or ship a client secret.

1. Create an Entra app named `BeforeBedtime Launcher`.
2. Set supported accounts to `Personal Microsoft accounts only`.
3. Add platform `Mobile and desktop applications`.
4. Add redirect URI `http://localhost`.
5. Enable `Allow public client flows`.
6. Use scopes `XboxLive.signin offline_access`.
7. Submit the Application Client ID for Minecraft Services review: https://aka.ms/mce-reviewappid

For local MSAL development, run Electron with:

```powershell
$env:BBT_MICROSOFT_CLIENT_ID="your-application-client-id"
npm run dev:electron
```

For MSAL production, put the approved public client ID in `src/main/product-config.ts`.
Until Minecraft approves the app ID, Xbox auth can succeed while Minecraft Services returns `MINECRAFT_APP_NOT_APPROVED`.
