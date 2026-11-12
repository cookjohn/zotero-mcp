/**
 * Optional, self-hosted OAuth authorization-code + PKCE for the embedded MCP server.
 * Mirrors coding-tools-mcp's standalone OAuth endpoints, without a reverse proxy.
 * Client registrations, access tokens, and rotating refresh tokens survive Zotero restarts.
 * Short-lived, single-use authorization codes remain process-local.
 */

const PREFIX = "extensions.zotero.zotero-mcp-plugin.oauth";
const CODE_TTL = 300_000;
const TOKEN_TTL = 86_400_000;
const REFRESH_TTL = 30 * 86_400_000;
const STORAGE_VERSION = 1;
const MAX_CLIENTS = 128;
const MAX_CODES = 256;
const MAX_TOKENS = 512;
const MAX_REFRESH_TOKENS = 512;
const MAX_BODY_BYTES = 8192;

type HttpResult = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

type Client = {
  redirectURIs: string[];
  authMethod: "none" | "client_secret_post" | "client_secret_basic";
  secretDigest?: string;
  grantTypes: string[];
};

type PendingCode = {
  clientID: string;
  redirectURI: string;
  challenge: string;
  resource: string;
  expires: number;
};

type AccessToken = {
  clientID: string;
  resource: string;
  expires: number;
};

type PreferenceStore = {
  get(key: string, global?: boolean): unknown;
  set(key: string, value: unknown, global?: boolean): void;
};

/** Injected only for tests; production uses the Zotero profile Login Manager. */
type PasswordVault = {
  read(): string | null;
  write(value: string): void;
};

const PASSWORD_ORIGIN = "https://zotero-mcp-plugin.invalid";
const PASSWORD_REALM = "Zotero MCP authorization password";
const PASSWORD_USERNAME = "oauth-admin";

function randomSecret(bytes = 32): string {
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  return Array.from(data, (n) => n.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char,
  );
}

function response(status: number, data: unknown, extra: Record<string, string> = {}): HttpResult {
  const names: Record<number, string> = {
    200: "OK", 201: "Created", 302: "Found", 400: "Bad Request",
    401: "Unauthorized", 404: "Not Found", 405: "Method Not Allowed",
    413: "Content Too Large", 503: "Service Unavailable",
  };
  return {
    status,
    statusText: names[status] || "Error",
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
    body: JSON.stringify(data),
  };
}

function html(status: number, body: string): HttpResult {
  const result = response(status, "");
  result.headers["Content-Type"] = "text/html; charset=utf-8";
  result.body = body;
  return result;
}

/** Public HTTPS origin; never trust inbound Host or X-Forwarded-* headers. */
export function normalizeOAuthOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validRedirects(redirects: unknown): redirects is string[] {
  if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 10) return false;
  const seen = new Set<string>();
  for (const uri of redirects) {
    if (typeof uri !== "string" || uri.length > 2048 || seen.has(uri)) return false;
    try {
      const u = new URL(uri);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname.toLowerCase());
      if (u.username || u.password || u.hash || !u.hostname ||
          !(u.protocol === "https:" || (u.protocol === "http:" && loopback))) return false;
    } catch { return false; }
    seen.add(uri);
  }
  return true;
}

function header(text: string, name: string): string {
  // Never use untrusted forwarded headers for the OAuth issuer or resource.
  const headerBlock = text.split("\r\n\r\n", 1)[0];
  const match = headerBlock.match(new RegExp(`^${name}:\\s*([^\\r\\n]*)`, "im"));
  return match ? match[1].trim() : "";
}

export class MCPAuthServer {
  private readonly settings?: PreferenceStore;
  private readonly vault?: PasswordVault;

  constructor(settings?: PreferenceStore, vault?: PasswordVault) {
    this.settings = settings;
    this.vault = vault;
  }

  /** Zotero's profile Login Manager keeps recoverable credentials out of plain preferences. */
  private readPasswordFromVault(): string | null {
    if (this.vault) return this.vault.read();
    const manager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    // nsILoginManager accepts null for the unset fields; the bundled typings
    // declare strings, so the calls are widened here rather than padded with "".
    const logins = manager.findLogins(PASSWORD_ORIGIN, null as any, PASSWORD_REALM);
    const login = Array.from(logins as unknown as Array<{username: string; password: string}>)
      .find(item => item.username === PASSWORD_USERNAME);
    return login?.password || null;
  }

  private writePasswordToVault(value: string): void {
    if (this.vault) { this.vault.write(value); return; }
    const manager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    const logins = manager.findLogins(PASSWORD_ORIGIN, null as any, PASSWORD_REALM);
    const existing = (Array.from(logins as unknown as Array<{username: string}>)
      .find(item => item.username === PASSWORD_USERNAME)) as nsILoginInfo | undefined;
    const info = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
    info.init(PASSWORD_ORIGIN, null as any, PASSWORD_REALM, PASSWORD_USERNAME, value, "", "");
    if (existing) manager.modifyLogin(existing, info);
    else (manager as any).addLogin(info);
  }

  /** Returns the existing password only after validating it against the saved digest. */
  async getStoredPassword(): Promise<string | null> {
    if (!this.configured()) return null;
    const saved = this.readPasswordFromVault();
    if (!saved) return null;
    const salt = this.pref("passwordSalt") as string;
    const expected = this.pref("passwordHash") as string;
    return constantTimeEqual(await sha256(`${salt}:${saved}`), expected) ? saved : null;
  }

  private pref(name: string): unknown {
    return (this.settings || Zotero.Prefs).get(`${PREFIX}.${name}`, true);
  }

  private setPref(name: string, value: unknown): void {
    (this.settings || Zotero.Prefs).set(`${PREFIX}.${name}`, value, true);
  }

  private clients = new Map<string, Client>();
  private codes = new Map<string, PendingCode>();
  // Maps are keyed by SHA-256 digests, never plaintext bearer/refresh tokens.
  private tokens = new Map<string, AccessToken>();
  private refreshTokens = new Map<string, AccessToken>();
  private currentSettings = "";

  isEnabled(): boolean { return this.pref("enabled") === true; }

  private origin(): string | null {
    const raw = this.pref("serverUrl");
    return typeof raw === "string" ? normalizeOAuthOrigin(raw) : null;
  }

  private resource(): string | null {
    const origin = this.origin();
    return origin ? `${origin}/mcp` : null;
  }

  /** Bind persisted sessions to the public origin and the current password digest.
   *  Changing either revokes all old sessions and registered OAuth clients.
   */
  private configKey(): string {
    return JSON.stringify([this.pref("serverUrl"), this.pref("passwordSalt"), this.pref("passwordHash")]);
  }

  private persistState(): void {
    this.setPref("persistentState", JSON.stringify({
      version: STORAGE_VERSION,
      config: this.currentSettings,
      clients: Array.from(this.clients.entries()),
      tokens: Array.from(this.tokens.entries()),
      refreshTokens: Array.from(this.refreshTokens.entries()),
    }));
  }

  private syncSettings(): void {
    const id = this.configKey();
    if (id === this.currentSettings) return;
    this.clients.clear();
    this.codes.clear(); // One-time 5-minute codes are intentionally not persisted.
    this.tokens.clear();
    this.refreshTokens.clear();
    const firstLoad = !this.currentSettings;
    this.currentSettings = id;
    if (firstLoad) {
      const raw = this.pref("persistentState");
      if (typeof raw === "string") {
        try {
          const saved = JSON.parse(raw);
          if (saved?.version === STORAGE_VERSION && saved.config === id &&
              Array.isArray(saved.clients) && Array.isArray(saved.tokens) &&
              Array.isArray(saved.refreshTokens)) {
            for (const entry of saved.clients.slice(0, MAX_CLIENTS)) {
              if (!Array.isArray(entry) || entry.length !== 2) continue;
              const [clientID, client] = entry;
              if (typeof clientID !== "string" || !/^[0-9a-f]{48}$/.test(clientID) ||
                  !client || !validRedirects(client.redirectURIs) ||
                  !["none", "client_secret_post", "client_secret_basic"].includes(client.authMethod) ||
                  !Array.isArray(client.grantTypes) || !client.grantTypes.includes("authorization_code") ||
                  client.grantTypes.some((g: unknown) => g !== "authorization_code" && g !== "refresh_token") ||
                  (client.authMethod === "none" ? client.secretDigest !== undefined :
                    typeof client.secretDigest !== "string" || !/^[0-9a-f]{64}$/.test(client.secretDigest))) continue;
              this.clients.set(clientID, client);
            }
            const restoreTokens = (entries: unknown[], target: Map<string, AccessToken>, limit: number) => {
              for (const entry of entries.slice(0, limit)) {
                if (!Array.isArray(entry) || entry.length !== 2) continue;
                const [digest, token] = entry;
                if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest) ||
                    !token || typeof token.clientID !== "string" ||
                    !this.clients.has(token.clientID) || token.resource !== this.resource() ||
                    !Number.isSafeInteger(token.expires) || token.expires <= Date.now()) continue;
                target.set(digest, token);
              }
            };
            restoreTokens(saved.tokens, this.tokens, MAX_TOKENS);
            restoreTokens(saved.refreshTokens, this.refreshTokens, MAX_REFRESH_TOKENS);
            return;
          }
        } catch { /* Malformed persisted state must never authorize a request. */ }
      }
    }
    // Password or origin changed, or no compatible state exists: fail closed.
    this.persistState();
  }

  /** Only the newly generated password is displayed; Zotero stores its salted digest. */
  async generatePassword(): Promise<string> {
    const password = randomSecret(32);
    const salt = randomSecret(16);
    const digest = await sha256(`${salt}:${password}`);
    // Save the recoverable secret first; storage failure must not rotate credentials.
    this.writePasswordToVault(password);
    this.setPref("passwordSalt", salt);
    this.setPref("passwordHash", digest);
    this.syncSettings();
    return password;
  }

  configured(): boolean {
    return Boolean(this.origin() && typeof this.pref("passwordSalt") === "string" &&
      /^[0-9a-f]{32}$/.test(this.pref("passwordSalt") as string) &&
      typeof this.pref("passwordHash") === "string" &&
      /^[0-9a-f]{64}$/.test(this.pref("passwordHash") as string));
  }

  private ready(): boolean {
    this.syncSettings();
    return this.isEnabled() && this.configured();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, item] of this.codes) if (item.expires <= now) this.codes.delete(key);
    let changed = false;
    for (const [key, item] of this.tokens) if (item.expires <= now) {
      this.tokens.delete(key); changed = true;
    }
    for (const [key, item] of this.refreshTokens) if (item.expires <= now) {
      this.refreshTokens.delete(key); changed = true;
    }
    if (changed) this.persistState();
  }

  async isAuthorized(requestText: string): Promise<boolean> {
    if (!this.ready()) return false;
    const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(header(requestText, "Authorization"));
    if (!match) return false;
    this.prune();
    const digest = await sha256(`access:${match[1].toLowerCase()}`);
    const token = this.tokens.get(digest);
    return Boolean(token && token.expires > Date.now() &&
      token.resource === this.resource() && this.clients.has(token.clientID));
  }

  /** Issue non-recoverable opaque credentials. Persist only their digests. */
  private async issueTokens(clientID: string, resource: string): Promise<HttpResult> {
    this.prune();
    while (this.tokens.size >= MAX_TOKENS) this.tokens.delete(this.tokens.keys().next().value!);
    while (this.refreshTokens.size >= MAX_REFRESH_TOKENS) this.refreshTokens.delete(this.refreshTokens.keys().next().value!);
    const access = randomSecret(32);
    const mayRefresh = this.clients.get(clientID)?.grantTypes.includes("refresh_token") === true;
    const refresh = mayRefresh ? randomSecret(32) : undefined;
    this.tokens.set(await sha256(`access:${access}`), {
      clientID, resource, expires: Date.now() + TOKEN_TTL,
    });
    if (refresh) this.refreshTokens.set(await sha256(`refresh:${refresh}`), {
      clientID, resource, expires: Date.now() + REFRESH_TTL,
    });
    this.persistState();
    return response(200, {
      access_token: access, ...(refresh ? { refresh_token: refresh } : {}),
      token_type: "Bearer", expires_in: TOKEN_TTL / 1000,
    });
  }

  unauthorized(): HttpResult {
    const origin = this.origin();
    const challenge = origin
      ? `Bearer realm="zotero-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      : 'Bearer realm="zotero-mcp"';
    return response(401, { error: "unauthorized" }, { "WWW-Authenticate": challenge });
  }

  private loginPage(form: URLSearchParams, error = ""): HttpResult {
    const fields = ["client_id", "redirect_uri", "code_challenge", "state", "resource"]
      .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(form.get(name) || "")}">`).join("");
    return html(error ? 401 : 200,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Zotero MCP</title>` +
      `<style>body{font:16px system-ui,sans-serif;max-width:460px;margin:8vh auto;padding:20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:10px 0}button{background:#1768cc;color:white;border:0;border-radius:5px}</style></head><body>` +
      `<h2>Authorize Zotero MCP</h2><p>Client: ${escapeHtml(form.get("client_id") || "")}</p>` +
      `<p>Redirect: ${escapeHtml(form.get("redirect_uri") || "")}</p>` +
      (error ? `<p role="alert">${escapeHtml(error)}</p>` : "") +
      `<form method="POST" action="/oauth/authorize">${fields}<label>Authorization password<input type="password" name="password" required autocomplete="current-password"></label>` +
      `<button type="submit">Authorize</button></form></body></html>`);
  }

  private validAuthorize(form: URLSearchParams): boolean {
    const id = form.get("client_id") || "";
    const redirect = form.get("redirect_uri") || "";
    const resource = form.get("resource") || this.resource();
    return this.clients.get(id)?.redirectURIs.includes(redirect) === true &&
      form.get("code_challenge") !== null && /^[A-Za-z0-9_-]{43}$/.test(form.get("code_challenge") || "") &&
      resource === this.resource();
  }

  /** Return null for non-OAuth paths. The caller protects other endpoints. */
  async handleRequest(method: string, path: string, query: URLSearchParams,
    body: string, requestText: string): Promise<HttpResult | null> {
    const oauthPaths = new Set([
      "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server",
      "/oauth/register", "/oauth/authorize", "/oauth/token",
    ]);
    if (!oauthPaths.has(path)) return null;
    if (!this.isEnabled()) return response(404, { error: "OAuth disabled" });
    if (!this.ready()) return response(503, { error: "OAuth configuration incomplete" });
    const origin = this.origin()!;
    const resource = this.resource()!;
    if (method === "GET" && path === "/.well-known/oauth-protected-resource") {
      return response(200, { resource, authorization_servers: [origin], bearer_methods_supported: ["header"] });
    }
    if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
      return response(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      });
    }
    if (method === "GET" && path === "/oauth/authorize") {
      if (query.get("response_type") !== "code" || query.get("code_challenge_method") !== "S256" ||
        !this.validAuthorize(query)) return html(400, "Invalid OAuth authorization request");
      const form = new URLSearchParams(query.toString());
      if (!form.has("resource")) form.set("resource", resource);
      return this.loginPage(form);
    }
    if (method !== "POST") return response(405, { error: "method_not_allowed" }, { Allow: path === "/oauth/authorize" ? "GET, POST" : "POST" });
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return response(413, { error: "request_too_large" });
    const contentType = header(requestText, "Content-Type").split(";")[0].trim().toLowerCase();

    if (path === "/oauth/register") {
      if (contentType !== "application/json") return response(400, { error: "invalid_client_metadata" });
      let metadata: any;
      try { metadata = JSON.parse(body); } catch { return response(400, { error: "invalid_client_metadata" }); }
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
        !validRedirects(metadata.redirect_uris)) return response(400, { error: "invalid_client_metadata" });
      const authMethod = metadata.token_endpoint_auth_method || "none";
      const grants = metadata.grant_types === undefined
        ? ["authorization_code", "refresh_token"] : metadata.grant_types;
      if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod) ||
        !Array.isArray(grants) || !grants.includes("authorization_code") ||
        grants.some((grant: unknown) => grant !== "authorization_code" && grant !== "refresh_token") ||
        (metadata.response_types !== undefined && (!Array.isArray(metadata.response_types) || !metadata.response_types.includes("code")))) {
        return response(400, { error: "invalid_client_metadata" });
      }
      if (this.clients.size >= MAX_CLIENTS) return response(400, { error: "registration_limit" });
      const id = randomSecret(24);
      const secret = authMethod === "none" ? undefined : randomSecret(32);
      this.clients.set(id, { redirectURIs: metadata.redirect_uris,
        authMethod, grantTypes: grants, secretDigest: secret ? await sha256(secret) : undefined });
      this.persistState();
      return response(201, {
        client_id: id, redirect_uris: metadata.redirect_uris,
        grant_types: grants, response_types: ["code"],
        token_endpoint_auth_method: authMethod, client_id_issued_at: Math.floor(Date.now() / 1000),
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      });
    }

    if (contentType !== "application/x-www-form-urlencoded") return response(400, { error: "invalid_request", error_description: "Expected form encoding" });
    const form = new URLSearchParams(body);
    if (path === "/oauth/authorize") {
      if (!this.validAuthorize(form)) return html(400, "Invalid OAuth authorization request");
      const salt = this.pref("passwordSalt") as string;
      const expected = this.pref("passwordHash") as string;
      if (!constantTimeEqual(await sha256(`${salt}:${form.get("password") || ""}`), expected)) {
        return this.loginPage(form, "Invalid authorization password");
      }
      this.prune();
      while (this.codes.size >= MAX_CODES) this.codes.delete(this.codes.keys().next().value!);
      const code = randomSecret(32);
      this.codes.set(code, {
        clientID: form.get("client_id")!, redirectURI: form.get("redirect_uri")!,
        challenge: form.get("code_challenge")!, resource: form.get("resource") || resource,
        expires: Date.now() + CODE_TTL,
      });
      const target = new URL(form.get("redirect_uri")!);
      target.searchParams.set("code", code);
      if (form.get("state")) target.searchParams.set("state", form.get("state")!);
      return { status: 302, statusText: "Found", headers: { Location: target.toString(), "Cache-Control": "no-store" }, body: "" };
    }
    if (path === "/oauth/token") {
      const grantType = form.get("grant_type");
      if (grantType !== "authorization_code" && grantType !== "refresh_token") {
        return response(400, { error: "unsupported_grant_type" });
      }
      let id = form.get("client_id") || "";
      let secret = form.get("client_secret") || "";
      let presented = secret ? "client_secret_post" : "none";
      const basic = /^Basic\s+(.+)$/i.exec(header(requestText, "Authorization"));
      if (basic) {
        try {
          const atobValue = globalThis.atob(basic[1]);
          const colon = atobValue.indexOf(":");
          if (colon < 0) throw new Error("Invalid Basic credentials");
          id = decodeURIComponent(atobValue.substring(0, colon));
          secret = decodeURIComponent(atobValue.substring(colon + 1));
          presented = "client_secret_basic";
        } catch { return response(401, { error: "invalid_client" }); }
      }
      const client = this.clients.get(id);
      if (!client || client.authMethod !== presented ||
          (client.secretDigest && !constantTimeEqual(await sha256(secret), client.secretDigest))) {
        return response(401, { error: "invalid_client" });
      }
      if (grantType === "refresh_token") {
        if (!client.grantTypes.includes("refresh_token")) return response(400, { error: "unauthorized_client" });
        const provided = form.get("refresh_token") || "";
        if (!/^[0-9a-f]{64}$/.test(provided)) return response(400, { error: "invalid_grant" });
        const digest = await sha256(`refresh:${provided}`);
        const previous = this.refreshTokens.get(digest);
        if (!previous || previous.expires <= Date.now() || previous.clientID !== id ||
            previous.resource !== (form.get("resource") || resource)) {
          return response(400, { error: "invalid_grant" });
        }
        // Rotate in one turn: a second use of the same refresh token fails.
        this.refreshTokens.delete(digest);
        this.persistState();
        return this.issueTokens(id, previous.resource);
      }
      const code = form.get("code") || "";
      const saved = this.codes.get(code);
      this.codes.delete(code); // One-time, even for invalid token requests.
      this.prune();
      const verifier = form.get("code_verifier") || "";
      if (!saved || saved.expires <= Date.now() || saved.clientID !== id ||
          saved.redirectURI !== form.get("redirect_uri") || saved.resource !== (form.get("resource") || resource) ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return response(400, { error: "invalid_grant" });
      const challengeRaw = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = globalThis.btoa(String.fromCharCode(...new Uint8Array(challengeRaw)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (!constantTimeEqual(challenge, saved.challenge)) return response(400, { error: "invalid_grant" });
      // Consume the code exactly once; the new access + refresh tokens are durable.
      return this.issueTokens(id, saved.resource);
    }
    return response(404, { error: "not_found" });
  }
}

export const oauthServer = new MCPAuthServer();
