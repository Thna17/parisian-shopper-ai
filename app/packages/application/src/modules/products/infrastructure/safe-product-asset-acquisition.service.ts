import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import {
  type AcquiredAssetPayload,
  type ProductAssetAcquisitionPort,
} from '../application/product-asset-acquisition.port.js';
import {
  ProductAssetOversizedError,
  ProductAssetSSRFViolationError,
} from '../domain/product-asset-errors.js';

export interface SafeProductAssetAcquisitionOptions {
  readonly allowedHosts?: readonly string[] | undefined;
  readonly maxFileSizeBytes?: number | undefined;
  readonly requestTimeoutMs?: number | undefined;
  readonly allowInsecureHttpForTesting?: boolean | undefined;
  readonly allowNonStandardHttpsPortsForTesting?: boolean | undefined;
  readonly maxRedirects?: number | undefined;
  readonly dnsLookupFn?: ((hostname: string) => Promise<readonly dns.LookupAddress[]>) | undefined;
  readonly fetchFn?: typeof fetch | undefined;
}

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const HARD_MAX_BYTES = 35 * 1024 * 1024; // 35 MiB absolute acquisition ceiling
const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds
const DEFAULT_MAX_REDIRECTS = 2;
const DEFAULT_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'api.mekhla.digital',
  'cdn.mekhla.digital',
  'images.mekhla.digital',
  'static.mekhla.digital',
]);

const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/jpg']);

export function sanitizeUrlForAudit(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '[invalid-url]';
  }
}

function getSingleHeader(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export class SafeProductAssetAcquisitionService implements ProductAssetAcquisitionPort {
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly maxFileSizeBytes: number;
  private readonly requestTimeoutMs: number;
  private readonly allowInsecureHttp: boolean;
  private readonly allowNonStandardHttpsPorts: boolean;
  private readonly maxRedirects: number;
  private readonly dnsLookupFn?:
    ((hostname: string) => Promise<readonly dns.LookupAddress[]>) | undefined;
  private readonly customFetchFn?: typeof fetch | undefined;

  public constructor(options?: SafeProductAssetAcquisitionOptions) {
    const customHosts = options?.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
    this.allowedHosts = new Set(customHosts.map((h) => h.toLowerCase()));
    this.maxFileSizeBytes = Math.min(
      options?.maxFileSizeBytes ?? DEFAULT_MAX_BYTES,
      HARD_MAX_BYTES,
    );
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.allowInsecureHttp = options?.allowInsecureHttpForTesting ?? false;
    this.allowNonStandardHttpsPorts = options?.allowNonStandardHttpsPortsForTesting ?? false;
    this.maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.dnsLookupFn = options?.dnsLookupFn;
    this.customFetchFn = options?.fetchFn;
  }

  public async fetchAsset(rawUrl: string, maxBytes?: number): Promise<AcquiredAssetPayload> {
    const maxLimit = Math.min(maxBytes ?? this.maxFileSizeBytes, HARD_MAX_BYTES);
    const visitedUrls = new Set<string>();

    let currentUrlStr = rawUrl;

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      let currentParsedUrl: URL;
      try {
        currentParsedUrl = new URL(currentUrlStr);
      } catch {
        throw new ProductAssetSSRFViolationError(
          sanitizeUrlForAudit(currentUrlStr),
          'Invalid URL format',
        );
      }

      const sanitizedHopUrl = sanitizeUrlForAudit(currentUrlStr);

      if (visitedUrls.has(sanitizedHopUrl)) {
        throw new ProductAssetSSRFViolationError(sanitizedHopUrl, 'Redirect loop detected');
      }
      visitedUrls.add(sanitizedHopUrl);

      // 1. Protocol check
      if (
        currentParsedUrl.protocol !== 'https:' &&
        !(this.allowInsecureHttp && currentParsedUrl.protocol === 'http:')
      ) {
        throw new ProductAssetSSRFViolationError(
          sanitizedHopUrl,
          `Forbidden protocol "${currentParsedUrl.protocol}". Only HTTPS is permitted.`,
        );
      }

      // 2. Reject credentials in URL
      if (currentParsedUrl.username || currentParsedUrl.password) {
        throw new ProductAssetSSRFViolationError(
          sanitizedHopUrl,
          'URLs containing embedded credentials are prohibited.',
        );
      }

      // 3. Port check: strictly 443 for HTTPS in production
      if (currentParsedUrl.protocol === 'https:') {
        const portStr = currentParsedUrl.port;
        if (portStr && portStr !== '443' && !this.allowNonStandardHttpsPorts) {
          throw new ProductAssetSSRFViolationError(
            sanitizedHopUrl,
            `Non-standard HTTPS port "${portStr}" is prohibited in production mode.`,
          );
        }
      }

      // 4. Host allowlist check
      const hostname = currentParsedUrl.hostname.toLowerCase();
      if (!this.isHostAllowed(hostname)) {
        throw new ProductAssetSSRFViolationError(
          sanitizedHopUrl,
          `Host "${hostname}" is not on the approved asset acquisition allowlist.`,
        );
      }

      // 5. DNS resolution & IP check to prevent SSRF and pinning
      const resolvedIps = await this.validateDnsAndIpSafety(hostname, sanitizedHopUrl);
      const pinnedIp = resolvedIps[0]!;

      // 6. Execute request via customFetchFn or native streaming pinned socket
      if (this.customFetchFn) {
        const result = await this.fetchViaCustomFetch(
          currentParsedUrl,
          sanitizedHopUrl,
          maxLimit,
          hop,
        );
        if ('redirectUrl' in result) {
          currentUrlStr = result.redirectUrl;
          continue;
        }
        return result.payload;
      }

      const result = await this.streamPinnedRequest(
        currentParsedUrl,
        pinnedIp,
        sanitizedHopUrl,
        maxLimit,
        hop,
      );
      if ('redirectUrl' in result) {
        currentUrlStr = result.redirectUrl;
        continue;
      }
      return result.payload;
    }

    throw new ProductAssetSSRFViolationError(
      sanitizeUrlForAudit(rawUrl),
      'Exceeded maximum redirects without response',
    );
  }

  private isHostAllowed(hostname: string): boolean {
    if (this.allowedHosts.has(hostname)) {
      return true;
    }
    // Check wildcard subdomains
    for (const allowed of this.allowedHosts) {
      if (allowed.startsWith('*.') && hostname.endsWith(allowed.slice(1))) {
        return true;
      }
    }
    return false;
  }

  private async validateDnsAndIpSafety(
    hostname: string,
    sanitizedUrl: string,
  ): Promise<readonly string[]> {
    // If hostname is directly an IP literal
    if (net.isIP(hostname)) {
      if (this.isRestrictedIp(hostname)) {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Direct IP address "${hostname}" resolves to a restricted network range.`,
        );
      }
      return [hostname];
    }

    // Resolve via DNS
    try {
      const addresses = this.dnsLookupFn
        ? await this.dnsLookupFn(hostname)
        : await dns.promises.lookup(hostname, { all: true });

      if (!addresses || addresses.length === 0) {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Unable to resolve DNS for host "${hostname}"`,
        );
      }

      const resolvedIps: string[] = [];
      for (const addr of addresses) {
        if (this.isRestrictedIp(addr.address)) {
          throw new ProductAssetSSRFViolationError(
            sanitizedUrl,
            `Host "${hostname}" resolved to restricted IP ${addr.address}`,
          );
        }
        resolvedIps.push(addr.address);
      }
      return resolvedIps;
    } catch (err) {
      if (err instanceof ProductAssetSSRFViolationError) throw err;
      throw new ProductAssetSSRFViolationError(
        sanitizedUrl,
        `DNS resolution failed for "${hostname}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public isRestrictedIp(ip: string): boolean {
    // Check IPv4
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return true;
      }

      const [b0, b1, b2] = parts as [number, number, number, number];

      // 0.0.0.0/8 (Current network)
      if (b0 === 0) return true;

      // Loopback: 127.0.0.0/8
      if (b0 === 127) return true;

      // RFC 1918 Private ranges:
      // 10.0.0.0/8
      if (b0 === 10) return true;
      // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
      // 192.168.0.0/16
      if (b0 === 192 && b1 === 168) return true;

      // Link-local & AWS/Cloud Metadata: 169.254.0.0/16
      if (b0 === 169 && b1 === 254) return true;

      // Carrier-Grade NAT: 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
      if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

      // Documentation / benchmark: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 198.18.0.0/15
      if (b0 === 192 && b1 === 0 && b2 === 2) return true;
      if (b0 === 198 && b1 === 51 && b2 === 100) return true;
      if (b0 === 203 && b1 === 0 && b2 === 113) return true;
      if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

      // Multicast: 224.0.0.0/4 (224.0.0.0 - 239.255.255.255)
      if (b0 >= 224 && b0 <= 239) return true;

      // Reserved: 240.0.0.0/4 (240.0.0.0 - 255.255.255.254)
      if (b0 >= 240) return true;

      // Broadcast
      if (ip === '255.255.255.255') return true;

      return false;
    }

    // Check IPv6
    if (net.isIPv6(ip)) {
      const normalized = ip.toLowerCase();

      // Loopback
      if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
      // Unspecified
      if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

      // Link-local: fe80::/10 (fe80 - febf)
      if (/^fe[89ab][0-9a-f]/i.test(normalized) || normalized.startsWith('fe80:')) {
        return true;
      }

      // Unique local: fc00::/7 (fc00 - fdff)
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
        return true;
      }

      // Multicast: ff00::/8
      if (normalized.startsWith('ff')) {
        return true;
      }

      // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:0001)
      if (normalized.startsWith('::ffff:')) {
        const v4Part = normalized.slice(7);
        if (net.isIPv4(v4Part)) {
          return this.isRestrictedIp(v4Part);
        }
        // Hex formatted IPv4-mapped IPv6: ::ffff:w.x:y.z or hex pairs
        const hexParts = v4Part.split(':');
        if (hexParts.length === 2) {
          const high = parseInt(hexParts[0]!, 16);
          const low = parseInt(hexParts[1]!, 16);
          if (!isNaN(high) && !isNaN(low)) {
            const reconstructedV4 = [
              (high >> 8) & 0xff,
              high & 0xff,
              (low >> 8) & 0xff,
              low & 0xff,
            ].join('.');
            return this.isRestrictedIp(reconstructedV4);
          }
        }
      }

      // Documentation prefix: 2001:db8::/32
      if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) {
        return true;
      }

      // Discard prefix: 100::/64
      if (normalized.startsWith('100::') || normalized.startsWith('0100::')) {
        return true;
      }

      return false;
    }

    return true; // Unknown address format is restricted
  }

  private async streamPinnedRequest(
    url: URL,
    pinnedIp: string,
    sanitizedUrl: string,
    maxLimit: number,
    currentHop: number,
  ): Promise<{ payload: AcquiredAssetPayload } | { redirectUrl: string }> {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = url.port ? parseInt(url.port, 10) : defaultPort;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let timeoutId: NodeJS.Timeout | null = null;
      let clientReq: http.ClientRequest | null = null;
      let incomingRes: http.IncomingMessage | null = null;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const fail = (err: Error): void => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        if (incomingRes) {
          incomingRes.destroy();
          incomingRes = null;
        }
        if (clientReq) {
          clientReq.destroy();
          clientReq = null;
        }
        reject(err);
      };

      timeoutId = setTimeout(() => {
        fail(
          new ProductAssetSSRFViolationError(
            sanitizedUrl,
            `Asset download timed out after ${this.requestTimeoutMs}ms`,
          ),
        );
      }, this.requestTimeoutMs);

      try {
        clientReq = transport.request(
          {
            protocol: url.protocol,
            host: pinnedIp,
            port,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
              Host: url.hostname,
              'User-Agent': 'ParisianShopper-AssetRegistry/1.0',
              Accept: 'image/png,image/webp,image/jpeg',
            },
            servername: url.hostname,
          },
          (res) => {
            incomingRes = res;
            const status = res.statusCode ?? 200;

            // Handle redirect without reading body:
            if ([301, 302, 303, 307, 308].includes(status)) {
              if (currentHop >= this.maxRedirects) {
                fail(
                  new ProductAssetSSRFViolationError(
                    sanitizedUrl,
                    `Maximum redirect limit of ${this.maxRedirects} exceeded`,
                  ),
                );
                return;
              }

              const location = getSingleHeader(res.headers, 'location');
              if (!location || location.trim() === '') {
                fail(
                  new ProductAssetSSRFViolationError(
                    sanitizedUrl,
                    `Redirect status ${status} missing Location header`,
                  ),
                );
                return;
              }

              let nextParsedUrl: URL;
              try {
                nextParsedUrl = new URL(location, url);
              } catch {
                fail(
                  new ProductAssetSSRFViolationError(
                    sanitizedUrl,
                    `Invalid redirect Location: "${location}"`,
                  ),
                );
                return;
              }

              if (url.protocol === 'https:' && nextParsedUrl.protocol !== 'https:') {
                fail(
                  new ProductAssetSSRFViolationError(
                    sanitizedUrl,
                    `Protocol downgrade from https: to ${nextParsedUrl.protocol} is prohibited on redirect`,
                  ),
                );
                return;
              }

              isSettled = true;
              cleanup();
              res.destroy(); // Destroy immediately to avoid reading/buffering body
              if (clientReq) {
                clientReq.destroy();
                clientReq = null;
              }
              resolve({ redirectUrl: nextParsedUrl.toString() });
              return;
            }

            // HTTP OK check
            if (status < 200 || status >= 300) {
              fail(
                new ProductAssetSSRFViolationError(
                  sanitizedUrl,
                  `HTTP ${status} ${res.statusMessage ?? ''} during asset download`,
                ),
              );
              return;
            }

            // Immediate Content-Length check before body consumption
            const rawContentLength = getSingleHeader(res.headers, 'content-length');
            if (rawContentLength) {
              const declared = parseInt(rawContentLength, 10);
              if (!isNaN(declared) && declared > maxLimit) {
                fail(new ProductAssetOversizedError(declared, maxLimit));
                return;
              }
            }

            // Content-Type check
            const contentTypeStr = getSingleHeader(res.headers, 'content-type');
            if (!contentTypeStr || contentTypeStr.trim() === '') {
              fail(
                new ProductAssetSSRFViolationError(
                  sanitizedUrl,
                  'Missing Content-Type header on remote asset response. Expected image/png, image/webp, or image/jpeg.',
                ),
              );
              return;
            }

            const mimeType = contentTypeStr.split(';')[0]?.trim().toLowerCase() ?? '';
            if (!ALLOWED_CONTENT_TYPES.has(mimeType)) {
              fail(
                new ProductAssetSSRFViolationError(
                  sanitizedUrl,
                  `Invalid Content-Type "${contentTypeStr}". Expected image/png, image/webp, or image/jpeg.`,
                ),
              );
              return;
            }

            // Stream chunks with running byte counter
            const chunks: Buffer[] = [];
            let totalBytes = 0;

            res.on('data', (chunk: Buffer) => {
              totalBytes += chunk.length;
              if (totalBytes > maxLimit) {
                fail(new ProductAssetOversizedError(totalBytes, maxLimit));
                return;
              }
              chunks.push(chunk);
            });

            res.on('end', () => {
              if (isSettled) return;
              isSettled = true;
              cleanup();

              const buffer = Buffer.concat(chunks);
              const etag = getSingleHeader(res.headers, 'etag');

              resolve({
                payload: {
                  buffer,
                  mimeType,
                  byteSize: buffer.length,
                  sourceUrl: sanitizedUrl,
                  ...(etag ? { etag } : {}),
                },
              });
            });

            res.on('error', (err) => {
              fail(
                new ProductAssetSSRFViolationError(
                  sanitizedUrl,
                  `Stream error during asset download: ${err.message}`,
                ),
              );
            });
          },
        );

        clientReq.on('error', (err) => {
          fail(
            new ProductAssetSSRFViolationError(
              sanitizedUrl,
              `Request error during asset download: ${err.message}`,
            ),
          );
        });

        clientReq.end();
      } catch (err: unknown) {
        fail(
          err instanceof Error
            ? err
            : new ProductAssetSSRFViolationError(
                sanitizedUrl,
                `Failed to initiate asset download: ${String(err)}`,
              ),
        );
      }
    });
  }

  private async fetchViaCustomFetch(
    url: URL,
    sanitizedUrl: string,
    maxLimit: number,
    currentHop: number,
  ): Promise<{ payload: AcquiredAssetPayload } | { redirectUrl: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await this.customFetchFn!(url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'ParisianShopper-AssetRegistry/1.0',
          Accept: 'image/png,image/webp,image/jpeg',
        },
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Asset download timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      if (
        err instanceof ProductAssetSSRFViolationError ||
        err instanceof ProductAssetOversizedError
      ) {
        throw err;
      }
      throw new ProductAssetSSRFViolationError(
        sanitizedUrl,
        `Asset download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    clearTimeout(timeoutId);

    // Handle redirects without reading body
    const status = response.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.body?.cancel().catch(() => {});

      if (currentHop >= this.maxRedirects) {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Maximum redirect limit of ${this.maxRedirects} exceeded`,
        );
      }

      const location = response.headers.get('location');
      if (!location || location.trim() === '') {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Redirect status ${status} missing Location header`,
        );
      }

      let nextParsedUrl: URL;
      try {
        nextParsedUrl = new URL(location, url);
      } catch {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Invalid redirect Location: "${location}"`,
        );
      }

      if (url.protocol === 'https:' && nextParsedUrl.protocol !== 'https:') {
        throw new ProductAssetSSRFViolationError(
          sanitizedUrl,
          `Protocol downgrade from https: to ${nextParsedUrl.protocol} is prohibited on redirect`,
        );
      }

      return { redirectUrl: nextParsedUrl.toString() };
    }

    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new ProductAssetSSRFViolationError(
        sanitizedUrl,
        `HTTP ${response.status} ${response.statusText} during asset download`,
      );
    }

    // Immediate Content-Length check before body consumption
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(declaredLength) && declaredLength > maxLimit) {
        response.body?.cancel().catch(() => {});
        throw new ProductAssetOversizedError(declaredLength, maxLimit);
      }
    }

    // Content-Type check
    const rawContentType = response.headers.get('content-type');
    if (!rawContentType || rawContentType.trim() === '') {
      response.body?.cancel().catch(() => {});
      throw new ProductAssetSSRFViolationError(
        sanitizedUrl,
        'Missing Content-Type header on remote asset response. Expected image/png, image/webp, or image/jpeg.',
      );
    }

    const mimeType = rawContentType.split(';')[0]!.trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(mimeType)) {
      response.body?.cancel().catch(() => {});
      throw new ProductAssetSSRFViolationError(
        sanitizedUrl,
        `Invalid Content-Type "${rawContentType}". Expected image/png, image/webp, or image/jpeg.`,
      );
    }

    if (!response.body) {
      throw new ProductAssetSSRFViolationError(sanitizedUrl, 'Response body is empty');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxLimit) {
          reader.cancel().catch(() => {});
          throw new ProductAssetOversizedError(totalBytes, maxLimit);
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks);
    const etag = response.headers.get('etag');

    return {
      payload: {
        buffer,
        mimeType,
        byteSize: buffer.length,
        sourceUrl: sanitizedUrl,
        ...(etag ? { etag } : {}),
      },
    };
  }
}
