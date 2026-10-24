/* eslint-disable @typescript-eslint/require-await */
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  SafeProductAssetAcquisitionService,
  sanitizeUrlForAudit,
} from './safe-product-asset-acquisition.service.js';
import {
  ProductAssetOversizedError,
  ProductAssetSSRFViolationError,
} from '../domain/product-asset-errors.js';

type DnsLookupFn = (hostname: string) => Promise<readonly dns.LookupAddress[]>;

function safeDnsLookup(ip = '104.21.5.12'): DnsLookupFn {
  return async () => [{ address: ip, family: 4 }];
}

describe('SafeProductAssetAcquisitionService (SSRF & Security Protection)', () => {
  const allowedHosts = ['api.mekhla.digital', 'cdn.mekhla.digital', 'images.mekhla.digital'];

  const createService = (overrides?: {
    maxFileSizeBytes?: number;
    requestTimeoutMs?: number;
    allowInsecureHttpForTesting?: boolean;
    allowNonStandardHttpsPortsForTesting?: boolean;
    maxRedirects?: number;
    dnsLookupFn?: (hostname: string) => Promise<readonly dns.LookupAddress[]>;
    fetchFn?: typeof fetch;
  }): SafeProductAssetAcquisitionService => {
    return new SafeProductAssetAcquisitionService({
      allowedHosts,
      maxFileSizeBytes: overrides?.maxFileSizeBytes ?? 1024 * 1024,
      requestTimeoutMs: overrides?.requestTimeoutMs ?? 2000,
      allowInsecureHttpForTesting: overrides?.allowInsecureHttpForTesting ?? false,
      allowNonStandardHttpsPortsForTesting:
        overrides?.allowNonStandardHttpsPortsForTesting ?? false,
      maxRedirects: overrides?.maxRedirects ?? 2,
      dnsLookupFn: overrides?.dnsLookupFn ?? safeDnsLookup(),
      fetchFn: overrides?.fetchFn,
    });
  };

  describe('URL Sanitization for Audit and Errors', () => {
    it('strips query parameters, hashes, and embedded credentials from audit URLs', () => {
      const sanitized = sanitizeUrlForAudit(
        'https://admin:secret123@cdn.mekhla.digital/products/item.png?token=supersecret&v=1#preview',
      );
      expect(sanitized).toBe('https://cdn.mekhla.digital/products/item.png');
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).not.toContain('supersecret');
      expect(sanitized).not.toContain('preview');
    });

    it('returns [invalid-url] when raw URL cannot be parsed', () => {
      expect(sanitizeUrlForAudit('not-a-valid-url')).toBe('[invalid-url]');
    });
  });

  describe('Protocol Security', () => {
    it('rejects plain HTTP protocol when allowInsecureHttp is false', async () => {
      const service = createService({ allowInsecureHttpForTesting: false });
      await expect(
        service.fetchAsset('http://cdn.mekhla.digital/products/image.png'),
      ).rejects.toThrow(ProductAssetSSRFViolationError);
    });

    it('allows plain HTTP protocol when allowInsecureHttpForTesting is true', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(Buffer.from('png-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });

      const service = createService({ allowInsecureHttpForTesting: true, fetchFn: mockFetch });
      const result = await service.fetchAsset('http://cdn.mekhla.digital/products/image.png');
      expect(result.mimeType).toBe('image/png');
    });

    it('rejects forbidden URI schemes (file://, ftp://, javascript:, data:, blob:)', async () => {
      const service = createService({ allowInsecureHttpForTesting: true });
      await expect(service.fetchAsset('file:///etc/passwd')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(service.fetchAsset('ftp://cdn.mekhla.digital/img.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(service.fetchAsset('javascript:alert(1)')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(service.fetchAsset('data:image/png;base64,AAAA')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(service.fetchAsset('blob:https://cdn.mekhla.digital/uuid')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });
  });

  describe('Credentials in URL', () => {
    it('rejects URLs containing embedded username or password', async () => {
      const service = createService();
      await expect(
        service.fetchAsset('https://user:password@cdn.mekhla.digital/image.png'),
      ).rejects.toThrow(ProductAssetSSRFViolationError);
    });
  });

  describe('Host Allowlisting', () => {
    it('rejects domains not present in the allowed hosts list', async () => {
      const service = createService();
      await expect(service.fetchAsset('https://malicious.com/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(service.fetchAsset('https://evil-mekhla.digital/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
      await expect(
        service.fetchAsset('https://cdn.mekhla.digital.attacker.com/image.png'),
      ).rejects.toThrow(ProductAssetSSRFViolationError);
    });

    it('allows hosts present in the allowlist', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(Buffer.from('png-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });

      const service = createService({ fetchFn: mockFetch });
      const res = await service.fetchAsset('https://cdn.mekhla.digital/valid.png');
      expect(res.byteSize).toBe(9);
    });
  });

  describe('Restricted IP & Subnet Checking (isRestrictedIp)', () => {
    const service = createService();

    it('restricts IPv4 loopback (127.0.0.0/8)', () => {
      expect(service.isRestrictedIp('127.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('127.1.2.3')).toBe(true);
    });

    it('restricts RFC 1918 10.0.0.0/8', () => {
      expect(service.isRestrictedIp('10.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('10.255.255.255')).toBe(true);
    });

    it('restricts RFC 1918 172.16.0.0/12', () => {
      expect(service.isRestrictedIp('172.16.0.1')).toBe(true);
      expect(service.isRestrictedIp('172.24.10.5')).toBe(true);
      expect(service.isRestrictedIp('172.31.255.255')).toBe(true);
      expect(service.isRestrictedIp('172.32.0.1')).toBe(false);
    });

    it('restricts RFC 1918 192.168.0.0/16', () => {
      expect(service.isRestrictedIp('192.168.0.1')).toBe(true);
      expect(service.isRestrictedIp('192.168.254.254')).toBe(true);
    });

    it('restricts Carrier-Grade NAT (CGNAT 100.64.0.0/10)', () => {
      expect(service.isRestrictedIp('100.64.0.1')).toBe(true);
      expect(service.isRestrictedIp('100.127.255.255')).toBe(true);
      expect(service.isRestrictedIp('100.63.255.255')).toBe(false);
      expect(service.isRestrictedIp('100.128.0.1')).toBe(false);
    });

    it('restricts Cloud / Link-Local Metadata (169.254.0.0/16)', () => {
      expect(service.isRestrictedIp('169.254.169.254')).toBe(true);
      expect(service.isRestrictedIp('169.254.1.1')).toBe(true);
    });

    it('restricts Multicast and Reserved IPv4 ranges (224.0.0.0/4 and 240.0.0.0/4)', () => {
      expect(service.isRestrictedIp('224.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('239.255.255.255')).toBe(true);
      expect(service.isRestrictedIp('240.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('255.255.255.255')).toBe(true);
    });

    it('restricts IPv6 Loopback, Link-Local, and Unique-Local ranges', () => {
      expect(service.isRestrictedIp('::1')).toBe(true);
      expect(service.isRestrictedIp('::')).toBe(true);
      expect(service.isRestrictedIp('fe80::1')).toBe(true);
      expect(service.isRestrictedIp('fc00::1')).toBe(true);
      expect(service.isRestrictedIp('fd00::1234')).toBe(true);
      expect(service.isRestrictedIp('ff02::1')).toBe(true);
    });

    it('restricts IPv4-mapped IPv6 addresses representing private ranges', () => {
      expect(service.isRestrictedIp('::ffff:127.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('::ffff:10.0.0.1')).toBe(true);
      expect(service.isRestrictedIp('::ffff:169.254.169.254')).toBe(true);
      expect(service.isRestrictedIp('::ffff:192.168.1.1')).toBe(true);
      expect(service.isRestrictedIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('allows valid public routable IP addresses', () => {
      expect(service.isRestrictedIp('8.8.8.8')).toBe(false);
      expect(service.isRestrictedIp('1.1.1.1')).toBe(false);
      expect(service.isRestrictedIp('104.21.5.12')).toBe(false);
      expect(service.isRestrictedIp('2606:4700:4700::1111')).toBe(false);
    });

    it('restricts IPv6 Documentation prefix (2001:db8::/32) and Discard prefix (100::/64)', () => {
      expect(service.isRestrictedIp('2001:db8::1')).toBe(true);
      expect(service.isRestrictedIp('2001:db8:85a3::8a2e:370:7334')).toBe(true);
      expect(service.isRestrictedIp('100::1')).toBe(true);
    });
  });

  describe('DNS Resolution Safety', () => {
    it('fails closed when DNS resolution returns restricted IP', async () => {
      const dnsMock = async (): Promise<readonly dns.LookupAddress[]> => [
        { address: '169.254.169.254', family: 4 },
      ];
      const service = createService({ dnsLookupFn: dnsMock });

      await expect(service.fetchAsset('https://cdn.mekhla.digital/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });

    it('fails closed when DNS lookup returns zero addresses', async () => {
      const dnsMock = async (): Promise<readonly dns.LookupAddress[]> => [];
      const service = createService({ dnsLookupFn: dnsMock });

      await expect(service.fetchAsset('https://cdn.mekhla.digital/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });

    it('fails closed when DNS lookup encounters an error', async () => {
      const dnsMock = async (): Promise<readonly dns.LookupAddress[]> => {
        throw new Error('ENOTFOUND cdn.mekhla.digital');
      };
      const service = createService({ dnsLookupFn: dnsMock });

      await expect(service.fetchAsset('https://cdn.mekhla.digital/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });

    it('fails closed when DNS lookup returns a mix of public and restricted IPs (DNS rebinding)', async () => {
      const dnsMock = async (): Promise<readonly dns.LookupAddress[]> => [
        { address: '104.21.5.12', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ];
      const service = createService({ dnsLookupFn: dnsMock });

      await expect(service.fetchAsset('https://cdn.mekhla.digital/image.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });

    it('rejects redirect when target host resolves to private IP (DNS rebinding on redirect)', async () => {
      const dnsMock = async (hostname: string): Promise<readonly dns.LookupAddress[]> => {
        if (hostname === 'cdn.mekhla.digital') {
          return [{ address: '104.21.5.12', family: 4 }];
        }
        // Redirect target resolves to AWS metadata IP
        return [{ address: '169.254.169.254', family: 4 }];
      };

      const mockFetch: typeof fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://images.mekhla.digital/metadata.png' },
        });
      };

      const service = createService({ dnsLookupFn: dnsMock, fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/start.png')).rejects.toThrow(
        ProductAssetSSRFViolationError,
      );
    });
  });

  describe('Redirect Security', () => {
    it('follows safe redirect to another approved host', async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as { url: string }).url;
        if (urlStr === 'https://api.mekhla.digital/redirect-target') {
          return new Response(Buffer.from('final-image-data'), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          });
        }
        return new Response(null, {
          status: 302,
          headers: { location: 'https://api.mekhla.digital/redirect-target' },
        });
      };

      const service = createService({ fetchFn: mockFetch });
      const result = await service.fetchAsset('https://cdn.mekhla.digital/initial');
      expect(result.byteSize).toBe(16);
      expect(result.mimeType).toBe('image/png');
    });

    it('rejects redirect loop (A -> B -> A)', async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as { url: string }).url;
        const next =
          urlStr === 'https://cdn.mekhla.digital/a'
            ? 'https://cdn.mekhla.digital/b'
            : 'https://cdn.mekhla.digital/a';
        return new Response(null, {
          status: 302,
          headers: { location: next },
        });
      };

      const service = createService({ fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/a')).rejects.toThrow(
        /Redirect loop detected/,
      );
    });

    it('rejects when maximum redirect count is exceeded', async () => {
      let count = 0;
      const mockFetch: typeof fetch = async () => {
        count++;
        return new Response(null, {
          status: 302,
          headers: { location: `https://cdn.mekhla.digital/hop-${count}` },
        });
      };

      const service = createService({ maxRedirects: 2, fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/hop-0')).rejects.toThrow(
        /Maximum redirect limit/,
      );
    });

    it('rejects protocol downgrade from https to http on redirect', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://cdn.mekhla.digital/insecure.png' },
        });
      };

      const service = createService({ allowInsecureHttpForTesting: true, fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/start.png')).rejects.toThrow(
        /Protocol downgrade/,
      );
    });

    it('rejects redirect to unapproved external host', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://evil.com/payload.png' },
        });
      };

      const service = createService({ fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/start.png')).rejects.toThrow(
        /not on the approved asset acquisition allowlist/,
      );
    });

    it('rejects redirect missing Location header', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(null, { status: 302 });
      };

      const service = createService({ fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/start.png')).rejects.toThrow(
        /missing Location header/,
      );
    });
  });

  describe('Content-Type and Payload Validation', () => {
    it('rejects response missing Content-Type header', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(Buffer.from('data'), {
          status: 200,
        });

      const service = createService({ fetchFn: mockFetch });
      await expect(
        service.fetchAsset('https://cdn.mekhla.digital/no-content-type.png'),
      ).rejects.toThrow(/Missing Content-Type header/);
    });

    it('rejects forbidden non-image Content-Types (e.g. text/html, application/json)', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response('<html><body>SSRF payload</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });

      const service = createService({ fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/page.html')).rejects.toThrow(
        /Invalid Content-Type/,
      );
    });

    it('rejects response when Content-Length header exceeds maxFileSizeBytes', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': '2000000', // 2 MB
          },
        });

      const service = createService({ maxFileSizeBytes: 1000, fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/oversized.png')).rejects.toThrow(
        ProductAssetOversizedError,
      );
    });

    it('enforces the 35 MiB hard ceiling even when configuration and caller request more', async () => {
      const aboveHardLimit = 35 * 1024 * 1024 + 1;
      const mockFetch: typeof fetch = async () =>
        new Response(new Uint8Array(1), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(aboveHardLimit),
          },
        });

      const service = createService({ maxFileSizeBytes: 50 * 1024 * 1024, fetchFn: mockFetch });
      await expect(
        service.fetchAsset('https://cdn.mekhla.digital/hard-limit.png', 50 * 1024 * 1024),
      ).rejects.toMatchObject({
        details: expect.objectContaining({ maxBytes: 35 * 1024 * 1024 }),
      });
    });

    it('rejects response when streamed body bytes exceed maxFileSizeBytes', async () => {
      const largePayload = new Uint8Array(500);
      const mockFetch: typeof fetch = async () =>
        new Response(largePayload, {
          status: 200,
          headers: {
            'content-type': 'image/png',
            // No content-length header
          },
        });

      const service = createService({ maxFileSizeBytes: 200, fetchFn: mockFetch });
      await expect(
        service.fetchAsset('https://cdn.mekhla.digital/stream-oversized.png'),
      ).rejects.toThrow(ProductAssetOversizedError);
    });

    it('rejects HTTP non-OK status codes (404, 500, etc.)', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response('Not found', { status: 404, statusText: 'Not Found' });

      const service = createService({ fetchFn: mockFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/missing.png')).rejects.toThrow(
        /HTTP 404/,
      );
    });

    it('successfully acquires valid image payload when safe and permitted', async () => {
      const validPng = Buffer.from('png-valid-image-bytes');
      const mockFetch: typeof fetch = async () =>
        new Response(validPng, {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(validPng.length),
            etag: '"etag-12345"',
          },
        });

      const service = createService({ fetchFn: mockFetch });
      const acquired = await service.fetchAsset('https://cdn.mekhla.digital/valid.png');
      expect(acquired.buffer).toEqual(validPng);
      expect(acquired.mimeType).toBe('image/png');
      expect(acquired.byteSize).toBe(validPng.length);
      expect(acquired.etag).toBe('"etag-12345"');
    });
  });

  describe('Timeout Handling', () => {
    it('aborts and fails closed when server hangs beyond requestTimeoutMs', async () => {
      const hangingFetch: typeof fetch = (_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      };

      const service = createService({ requestTimeoutMs: 50, fetchFn: hangingFetch });
      await expect(service.fetchAsset('https://cdn.mekhla.digital/hang.png')).rejects.toThrow(
        /Asset download timed out/,
      );
    });
  });

  describe('Port Security & Strict HTTPS Port 443', () => {
    it('rejects nonstandard port 8443 on HTTPS in production mode', async () => {
      const service = createService({ allowNonStandardHttpsPortsForTesting: false });
      await expect(service.fetchAsset('https://cdn.mekhla.digital:8443/image.png')).rejects.toThrow(
        /Non-standard HTTPS port "8443"/,
      );
    });

    it('permits standard port 443 on HTTPS', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(Buffer.from('png-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });

      const service = createService({ fetchFn: mockFetch });
      const res = await service.fetchAsset('https://cdn.mekhla.digital:443/valid.png');
      expect(res.byteSize).toBe(9);
    });

    it('permits nonstandard port 8443 when allowNonStandardHttpsPortsForTesting is true', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(Buffer.from('png-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });

      const service = createService({
        allowNonStandardHttpsPortsForTesting: true,
        fetchFn: mockFetch,
      });
      const res = await service.fetchAsset('https://cdn.mekhla.digital:8443/valid.png');
      expect(res.byteSize).toBe(9);
    });
  });

  describe('Native Streaming Socket Download & Limit Enforcement (Objective 3)', () => {
    let server: http.Server | null = null;

    const startServer = async (handler: http.RequestListener): Promise<number> => {
      return new Promise((resolve) => {
        server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
          const addr = server!.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });
    };

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = null;
      }
    });

    it('rejects oversized response immediately via Content-Length before reading body', async () => {
      let clientSocketClosed = false;
      const port = await startServer((req, res) => {
        req.socket.on('close', () => {
          clientSocketClosed = true;
        });
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': '500000', // 500 KB
        });
        setTimeout(() => {
          if (!req.socket.destroyed) {
            res.write(Buffer.alloc(1000));
            res.end();
          }
        }, 50);
      });

      class TestableService extends SafeProductAssetAcquisitionService {
        public override isRestrictedIp(): boolean {
          return false;
        }
      }

      const service = new TestableService({
        allowedHosts: ['cdn.mekhla.digital'],
        maxFileSizeBytes: 1000,
        allowInsecureHttpForTesting: true,
        dnsLookupFn: async (): Promise<readonly dns.LookupAddress[]> => [
          { address: '127.0.0.1', family: 4 },
        ],
      });

      await expect(
        service.fetchAsset(`http://cdn.mekhla.digital:${port}/oversized-content-length.png`),
      ).rejects.toThrow(ProductAssetOversizedError);

      await new Promise((r) => setTimeout(r, 60));
      expect(clientSocketClosed).toBe(true);
    });

    it('streams chunks and destroys socket as soon as running byte count exceeds maxFileSizeBytes', async () => {
      let socketDestroyed = false;
      const port = await startServer((req, res) => {
        req.socket.on('close', () => {
          socketDestroyed = true;
        });
        res.writeHead(200, {
          'Content-Type': 'image/png',
        });
        res.write(Buffer.alloc(150, 0x01));
        setTimeout(() => {
          if (!res.writableEnded) {
            res.write(Buffer.alloc(150, 0x02));
            res.end();
          }
        }, 30);
      });

      class TestableService extends SafeProductAssetAcquisitionService {
        public override isRestrictedIp(): boolean {
          return false;
        }
      }

      const service = new TestableService({
        allowedHosts: ['cdn.mekhla.digital'],
        maxFileSizeBytes: 200,
        allowInsecureHttpForTesting: true,
        dnsLookupFn: async (): Promise<readonly dns.LookupAddress[]> => [
          { address: '127.0.0.1', family: 4 },
        ],
      });

      await expect(
        service.fetchAsset(`http://cdn.mekhla.digital:${port}/stream-oversized.png`),
      ).rejects.toThrow(ProductAssetOversizedError);

      await new Promise((r) => setTimeout(r, 60));
      expect(socketDestroyed).toBe(true);
    });

    it('successfully acquires and buffers streamed chunks within size limit', async () => {
      const pngPayload = Buffer.from('hello-world-transparent-png-content');
      const port = await startServer((_req, res) => {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          ETag: '"test-etag-123"',
        });
        res.write(pngPayload.subarray(0, 10));
        setTimeout(() => {
          res.write(pngPayload.subarray(10));
          res.end();
        }, 10);
      });

      class TestableService extends SafeProductAssetAcquisitionService {
        public override isRestrictedIp(): boolean {
          return false;
        }
      }

      const service = new TestableService({
        allowedHosts: ['cdn.mekhla.digital'],
        maxFileSizeBytes: 10000,
        allowInsecureHttpForTesting: true,
        dnsLookupFn: async (): Promise<readonly dns.LookupAddress[]> => [
          { address: '127.0.0.1', family: 4 },
        ],
      });

      const acquired = await service.fetchAsset(`http://cdn.mekhla.digital:${port}/valid.png`);
      expect(acquired.buffer).toEqual(pngPayload);
      expect(acquired.byteSize).toBe(pngPayload.length);
      expect(acquired.mimeType).toBe('image/png');
      expect(acquired.etag).toBe('"test-etag-123"');
    });
  });
});
