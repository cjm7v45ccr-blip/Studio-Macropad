import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function isAuxBootloaderBin(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.includes('bootloader') ||
    lower.includes('partitions') ||
    lower.includes('boot_app0') ||
    lower.includes('ota_data')
  );
}

export function extractVersionFromFilename(fileName: string): string | null {
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

export function inspectEspBinaryMetadata(buf: Buffer): {
  embeddedVersion: string | null;
  supportsV45Engine: boolean;
} {
  const latin1 = buf.toString('latin1');
  const supportsV45Engine = latin1.includes('/api/macro/cancel');

  const jsonFwMatch = latin1.match(
    /"firmware"\s*:\s*"v?(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)"/
  );
  if (jsonFwMatch?.[1]) {
    return { embeddedVersion: jsonFwMatch[1], supportsV45Engine };
  }

  const editionMatch = latin1.match(/\bv?(\d+\.\d+(?:\.\d+)?-(?:PRO|PLUS|STABLE|OTA))\b/);
  if (editionMatch?.[1]) {
    return { embeddedVersion: editionMatch[1], supportsV45Engine };
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
        return {
          embeddedVersion: rawVer.replace(/^[vV](?=\d)/, ''),
          supportsV45Engine
        };
      }
    }
  }

  return { embeddedVersion: null, supportsV45Engine };
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

function compareSimpleVersionsDesc(a: string, b: string): number {
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

export function buildPublicFirmwareCatalogJson(publicDir: string): string {
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
      const { embeddedVersion, supportsV45Engine } = inspectEspBinaryMetadata(buf);

      let version = fromName || embeddedVersion || '';
      if (!version) {
        const d = stat.mtime;
        version = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
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
        title: `Firmware v${version}`,
        notes: '',
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
            isBinary: true,
            ...(embeddedVersion ? { embeddedVersion: `v${embeddedVersion}` } : {}),
            supportsV45Engine
          }
        ]
      };
    })
    .sort((a, b) => {
      const cmp = compareSimpleVersionsDesc(a.version, b.version);
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
