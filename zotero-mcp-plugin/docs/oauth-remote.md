# Remote ChatGPT MCP via optional OAuth

This implementation follows the built-in OAuth flow in
[Yyu-ang/coding-tools-mcp](https://github.com/Yyu-ang/coding-tools-mcp/blob/main/docs/remote-mcp.md).
Cloudflare Tunnel transports HTTPS only; no Cloudflare Access service or third-party auth server is required.

## Configure Zotero

1. Keep **Allow remote access** disabled. The unauthenticated local MCP listener keeps the configured **MCP server port** (default `23120`); when OAuth is enabled that listener is forced to loopback so it is never publicly reachable.
2. Configure Cloudflare Tunnel to forward `https://zotero.example.com` to `http://127.0.0.1:<mcp-port + 1>` on the *same machine* — the **authenticated** listener, default `23121`. Do **not** point the tunnel at `<mcp-port>` (default `23120`): that listener serves local clients without a token. Replace the example hostname with your own.
3. Under Zotero MCP preferences, enter `https://zotero.example.com` as the **public HTTPS origin** (without `/mcp`).
4. Click **Generate / rotate authorization password**. The password is kept in Zotero's local password manager, so **Show password** and **Copy password** keep working after a restart — the plugin preferences store only its salted SHA-256 digest. Rotating the password invalidates existing authorizations.
5. Enable **OAuth authorization**. Leave the existing write operations disabled when only reading a literature library.
6. In a ChatGPT workspace that permits custom remote MCP, connect the Streamable HTTP URL `https://zotero.example.com/mcp`. Use OAuth, and enter the generated password on the authorization page.

Do not expose either local port — the unauthenticated `<mcp-port>` (default `23120`) or the OAuth listener `<mcp-port + 1>` (default `23121`) — through router port forwarding, and do not enable unrestricted LAN binding. The public endpoint must be HTTPS. If the public origin or password changes, existing OAuth sessions and client registrations are invalidated.

## Supported endpoints

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register` (dynamic client registration)
- `GET /oauth/authorize`, `POST /oauth/authorize` (password login + S256 PKCE)
- `POST /oauth/token` (`authorization_code`, opaque Bearer token, 24-hour TTL)

Authorization codes expire after 5 minutes and are single-use. Client registrations, pending codes and opaque access tokens are held in memory. Restarting Zotero invalidates issued tokens and requires reauthorization. These are deliberate small-scope choices, consistent with the process-local registry mode of the reference project.

OAuth is disabled by default. When it is enabled but incompletely configured, the MCP endpoint fails closed (HTTP 401). Unauthenticated MCP calls return a `WWW-Authenticate: Bearer` challenge with a resource metadata link. OAuth endpoints are unauthenticated as required for client registration and sign-in; `/ping` remains a public health check.

## Smoke checks

```bash
BASE=https://zotero.example.com
curl -i "$BASE/.well-known/oauth-protected-resource"
curl -i "$BASE/.well-known/oauth-authorization-server"
curl -i -X POST "$BASE/mcp" -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Without a valid OAuth access token the last call MUST return HTTP 401.
```

Do not publish the login password or an access token in Git, screenshots, logs, or public discussions.
