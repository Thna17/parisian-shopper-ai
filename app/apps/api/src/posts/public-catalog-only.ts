import path from 'node:path';
import type { RequestHandler } from 'express';
/** Generated CAS media is private; only catalog paths may fall through to public static files. */
export function publicCatalogOnly(handler: RequestHandler): RequestHandler {
  return (req, res, next): void => {
    let assetPath: string;
    try {
      assetPath = path.posix
        .normalize(decodeURIComponent(req.path).replaceAll('\\', '/'))
        .toLowerCase();
    } catch {
      next();
      return;
    }
    if (assetPath === '/cas' || assetPath.startsWith('/cas/')) {
      next();
      return;
    }
    handler(req, res, next);
  };
}
