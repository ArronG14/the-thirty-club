import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
/** Synthetic media is served in development only, never copied to production. */
export function screeningPreviewMedia(): Plugin {
  return {
    name: 'screening-preview-media',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match =
          /^\/media\/screening\/test-(landscape|portrait)\.mp4$/.exec(
            req.url ?? '',
          );
        if (!match) return next();
        try {
          const bytes = readFileSync(
            new URL(
              `../tests/fixtures/screening-${match[1]}.mp4`,
              import.meta.url,
            ),
          );
          const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
          const start = range ? Number(range[1]) : 0;
          const end = range?.[2]
            ? Math.min(Number(range[2]), bytes.length - 1)
            : bytes.length - 1;
          if (start > end || start >= bytes.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` });
            res.end();
            return;
          }
          res.writeHead(range ? 206 : 200, {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            ...(range
              ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` }
              : {}),
          });
          res.end(bytes.subarray(start, end + 1));
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
    },
  };
}
