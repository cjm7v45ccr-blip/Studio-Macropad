import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

interface PublicFirmwareMetaJson {
  version?: string;
  file?: string;
  notes?: string;
  title?: string;
}

function isAuxBootloaderBin(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.includes('bootloader') ||
    lower.includes('partitions') ||
    lower.includes('boot_app0') ||
    lower.includes('ota_data')
  );
}

function extractVersionFromFilename(fileName: string): string | null {
  const cleaned = fileName
    .replace(/\.ino\.[^.]+$/i, '')
    .replace(/\.(bin|ino)$/i, '')
    .replace(
      /\b(?:esp32[-_]?s2|esp32[-_]?s3|esp32[-_]?c3|esp32[-_]?c6|esp32|xtensa|riscv)\b/gi,
      ''
    );
  const match = cleaned.match(/(?:^|[-_.\svV])v?(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)/);
  return match?.[1] || null;
}

function extractVersionFromEspBinary(buf: Buffer): string | null {
  const latin1 = buf.toString('latin1');
  const jsonFwMatch = latin1.match(
    /"firmware"\s*:\s*"v?(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)"/
  );
  if (jsonFwMatch?.[1]) {
    return jsonFwMatch[1];
  }
  const editionMatch = latin1.match(/\bv?(\d+\.\d+(?:\.\d+)?-(?:PRO|PLUS|STABLE|OTA))\b/);
  if (editionMatch?.[1]) {
    return editionMatch[1];
  }

  const scanLimit = Math.min(buf.length - 48, 512);
  for (let offset = 0; offset <= scanLimit; offset += 4) {
    if (buf.readUInt32LE(offset) === 0xabcd5432) {
      const verSlice = buf.subarray(offset + 16, offset + 48);
      const nulIdx = verSlice.indexOf(0);
      const rawVer = (nulIdx >= 0 ? verSlice.subarray(0, nulIdx) : verSlice)
        .toString('utf8')
        .trim();
      if (rawVer && /\d+\.\d+/.test(rawVer) && !/^v?[45]\.\d+\.\d+-/.test(rawVer)) {
        return rawVer.replace(/^[vV](?=\d)/, '');
      }
    }
  }
  return null;
}

function parseSimpleVersionTuple(ver: string): number[] {
  const m = ver.replace(/^[vV]/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0, 0];
  return [
    parseInt(m[1] || '0', 10) || 0,
    parseInt(m[2] || '0', 10) || 0,
    parseInt(m[3] || '0', 10) || 0,
    parseInt(m[4] || '0', 10) || 0
  ];
}

function compareSimpleVersions(a: string, b: string): number {
  const ta = parseSimpleVersionTuple(a);
  const tb = parseSimpleVersionTuple(b);
  for (let i = 0; i < 4; i++) {
    if (tb[i] !== ta[i]) return tb[i] - ta[i];
  }
  return 0;
}

function collectBinFilesRecursive(dir: string, baseDir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectBinFilesRecursive(fullPath, baseDir));
    } else if (entry.isFile() && /\.bin$/i.test(entry.name)) {
      results.push(path.relative(baseDir, fullPath).split(path.sep).join('/'));
    }
  }
  return results;
}

function buildPublicFirmwareCatalogJson(publicDir: string): string {
  let metaJson: PublicFirmwareMetaJson = {};
  const metaPath = path.join(publicDir, 'firmware.json');
  if (fs.existsSync(metaPath)) {
    try {
      metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as PublicFirmwareMetaJson;
    } catch {}
  }

  const allRelBins = collectBinFilesRecursive(publicDir, publicDir);
  const targetBins = allRelBins.filter(rel => {
    if (isAuxBootloaderBin(path.basename(rel))) return false;
    try {
      const st = fs.statSync(path.join(publicDir, rel));
      return st.size >= 32768;
    } catch {
      return false;
    }
  });

  const releases = targetBins
    .map(relPath => {
      const absPath = path.join(publicDir, relPath);
      const stat = fs.statSync(absPath);
      const buf = fs.readFileSync(absPath);
      const fileName = path.basename(relPath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

      const fromName = extractVersionFromFilename(fileName);
      const fromBin = extractVersionFromEspBinary(buf);
      const metaVersion = (metaJson.version || '').trim().replace(/^[vV](?=\d)/, '');
      const matchesMetaFile =
        !metaJson.file ||
        metaJson.file.replace(/^\/+/, '').toLowerCase() === relPath.toLowerCase() ||
        path.basename(metaJson.file).toLowerCase() === fileName.toLowerCase();

      let version = fromName || '';
      if (!version) {
        if (matchesMetaFile && metaVersion && fromBin) {
          version = compareSimpleVersions(metaVersion, fromBin) > 0 ? fromBin : metaVersion;
        } else if (matchesMetaFile && metaVersion) {
          version = metaVersion;
        } else if (fromBin) {
          version = fromBin;
        } else if (targetBins.length === 1 && metaVersion) {
          version = metaVersion;
        } else {
          const d = stat.mtime;
          version = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
        }
      }

      const encodedUrl =
        '/' +
        relPath
          .split('/')
          .map(seg => encodeURIComponent(seg))
          .join('/');

      return {
        version,
        rawTag: `v${version}`,
        title:
          (matchesMetaFile && metaJson.title?.trim()) || `Firmware v${version}`,
        notes: (matchesMetaFile && metaJson.notes?.trim()) || '',
        publishedAt: stat.mtime.toISOString(),
        htmlUrl: encodedUrl,
        source: 'release' as const,
        repoSlug: 'public',
        mtimeMs: stat.mtimeMs,
        assets: [
          {
            name: fileName,
            sizeBytes: stat.size,
            downloadUrl: encodedUrl,
            corsSafeUrl: encodedUrl,
            sha256,
            isBinary: true
          }
        ]
      };
    })
    .sort((a, b) => {
      const cmp = compareSimpleVersions(a.version, b.version);
      if (cmp !== 0) return cmp;
      return b.mtimeMs - a.mtimeMs;
    })
    .map(({ mtimeMs: _mtime, ...rest }) => rest);

  return JSON.stringify(
    {
      schema: 'studio-pad-public-firmware',
      generatedAt: new Date().toISOString(),
      latestRelease: releases[0] || null,
      recentReleases: releases
    },
    null,
    2
  );
}

function publicFirmwareCatalogPlugin(): Plugin {
  const publicDir = path.resolve(import.meta.dirname, 'public');
  return {
    name: 'public-firmware-catalog',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === '/firmware-catalog.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.end(buildPublicFirmwareCatalogJson(publicDir));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firmware-catalog.json',
        source: buildPublicFirmwareCatalogJson(publicDir)
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      publicFirmwareCatalogPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        workbox: {
          globIgnores: ['**/*.bin', '**/firmware-catalog.json', '**/firmware.json'],
          navigateFallbackDenylist: [
            /\.bin$/i,
            /firmware-catalog\.json$/i,
            /firmware\.json$/i
          ]
        },
        manifest: {
          id: '/',
          name: 'Studio MacroPad',
          short_name: 'StudioPad',
          description: 'Flagship Hardware Control Center & KeyRemapper for ESP32 MacroPad.',
          theme_color: '#08090d',
          background_color: '#08090d',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
