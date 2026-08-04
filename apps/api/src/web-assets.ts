import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

export async function registerWebAssets(app: FastifyInstance, directory: string): Promise<boolean> {
  const root = resolve(directory);
  const indexPath = resolve(root, 'index.html');
  try {
    await access(indexPath);
  } catch {
    app.log.info({ directory: root }, 'Production web build was not found; API-only mode enabled.');
    return false;
  }

  app.get('/*', async (request, reply) => {
    const pathname = getPathname(request.url);
    if (!pathname || pathname === '/api' || pathname.startsWith('/api/')) {
      return reply.code(404).send({ message: 'Route not found.' });
    }
    const requestedPath = pathname === '/' ? indexPath : resolve(root, `.${pathname}`);
    const assetPath = isWithinRoot(root, requestedPath) ? requestedPath : undefined;
    const isAssetRequest = extname(pathname) !== '';

    if (assetPath) {
      try {
        const details = await stat(assetPath);
        if (details.isFile()) return sendFile(reply, assetPath);
      } catch {
        // A client-side route intentionally falls back to index.html below.
      }
    }
    if (isAssetRequest) return reply.code(404).send({ message: 'Asset not found.' });
    return sendFile(reply, indexPath);
  });
  return true;
}

function getPathname(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  } catch {
    return undefined;
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !pathFromRoot.includes('../');
}

function sendFile(reply: FastifyReply, path: string) {
  const extension = extname(path).toLowerCase();
  return reply
    .header(
      'cache-control',
      extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    )
    .header('x-content-type-options', 'nosniff')
    .type(contentTypes[extension] ?? 'application/octet-stream')
    .send(createReadStream(path));
}
