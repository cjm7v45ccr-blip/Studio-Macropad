import {
  FirmwareReleaseAsset,
  FirmwareReleaseInfo
} from '../types/studio';

export const PUBLIC_FIRMWARE_SOURCE_SLUG = 'public';

export interface PublicFirmwareCatalogResult {
  latestRelease: FirmwareReleaseInfo | null;
  recentReleases: FirmwareReleaseInfo[];
}

interface ParsedSemverLike {
  numbers: [number, number, number, number];
  isPrerelease: boolean;
  prereleaseRank: number;
  prereleaseNum: number;
}

export function normalizeFirmwareVersionLabel(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^(?:firmware[-_\s]*|release[-_\s]*|fw[-_\s]*)/i, '');
  const match = withoutPrefix.match(/v?(\d+(?:\.\d+)*(?:[-_+][A-Za-z0-9._-]+)?)/i);
  if (match && match[1]) {
    return match[1];
  }
  return withoutPrefix.replace(/^[vV](?=\d)/, '');
}

function parseSemverLike(raw?: string | null): ParsedSemverLike | null {
  const normalized = normalizeFirmwareVersionLabel(raw);
  if (!normalized) return null;

  const match = normalized.match(
    /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-_+.]?(.*))?$/
  );
  if (!match) return null;

  const n0 = parseInt(match[1] || '0', 10) || 0;
  const n1 = parseInt(match[2] || '0', 10) || 0;
  const n2 = parseInt(match[3] || '0', 10) || 0;
  const n3 = parseInt(match[4] || '0', 10) || 0;
  const suffix = (match[5] || '').trim().toLowerCase();

  if (!suffix) {
    return {
      numbers: [n0, n1, n2, n3],
      isPrerelease: false,
      prereleaseRank: 10,
      prereleaseNum: 0
    };
  }

  // Edition suffixes like "-PRO", "-PLUS", "-STABLE" are full releases, not pre-releases
  const prereleaseMatch = suffix.match(
    /^(alpha|a|beta|b|rc|pre|preview|dev|nightly)[-_.]?(\d*)/i
  );
  if (prereleaseMatch) {
    const tag = prereleaseMatch[1].toLowerCase();
    const num = parseInt(prereleaseMatch[2] || '0', 10) || 0;
    const rank =
      tag === 'rc'
        ? 4
        : tag === 'beta' || tag === 'b'
        ? 3
        : tag === 'preview' || tag === 'pre'
        ? 2
        : 1;
    return {
      numbers: [n0, n1, n2, n3],
      isPrerelease: true,
      prereleaseRank: rank,
      prereleaseNum: num
    };
  }

  return {
    numbers: [n0, n1, n2, n3],
    isPrerelease: false,
    prereleaseRank: 10,
    prereleaseNum: 0
  };
}

/**
 * Compares an installed ESP32 firmware version with a candidate public folder version.
 * Returns:
 *   `1`  if `candidateVersion` is strictly newer than `installedVersion`
 *   `0`  if both represent the same version
 *  `-1`  if `installedVersion` is newer than `candidateVersion`
 */
export function compareFirmwareVersions(
  installedVersion: string,
  candidateVersion: string
): -1 | 0 | 1 {
  const installed = parseSemverLike(installedVersion);
  const candidate = parseSemverLike(candidateVersion);

  if (!installed || !candidate) {
    const cleanA = normalizeFirmwareVersionLabel(installedVersion).toLowerCase();
    const cleanB = normalizeFirmwareVersionLabel(candidateVersion).toLowerCase();
    if (!cleanA || !cleanB || cleanA === cleanB) return 0;
    return cleanB > cleanA ? 1 : -1;
  }

  for (let i = 0; i < 4; i++) {
    if (candidate.numbers[i] > installed.numbers[i]) return 1;
    if (candidate.numbers[i] < installed.numbers[i]) return -1;
  }

  if (installed.isPrerelease && !candidate.isPrerelease) return 1;
  if (!installed.isPrerelease && candidate.isPrerelease) return -1;

  if (installed.isPrerelease && candidate.isPrerelease) {
    if (candidate.prereleaseRank > installed.prereleaseRank) return 1;
    if (candidate.prereleaseRank < installed.prereleaseRank) return -1;
    if (candidate.prereleaseNum > installed.prereleaseNum) return 1;
    if (candidate.prereleaseNum < installed.prereleaseNum) return -1;
  }

  return 0;
}

export function isAuxiliaryBootloaderAsset(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('bootloader') ||
    lower.includes('partitions') ||
    lower.includes('boot_app0') ||
    lower.includes('ota_data') ||
    lower.includes('merged')
  );
}

export function selectPrimaryOtaBinaryAsset(
  assets: FirmwareReleaseAsset[] | undefined | null
): FirmwareReleaseAsset | null {
  if (!assets || assets.length === 0) return null;
  const binAssets = assets.filter(a => /\.bin$/i.test(a.name));
  if (binAssets.length === 0) return null;

  const appBins = binAssets.filter(a => !isAuxiliaryBootloaderAsset(a.name));
  if (appBins.length > 0) {
    const preferred = appBins.find(a =>
      /(?:firmware|studio|macropad|pad|ota|app)/i.test(a.name)
    );
    return preferred || appBins[0];
  }
  return binAssets[0];
}

function isHtmlSpaFallbackBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 96)))
    .trimStart()
    .toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/**
 * Checks the website's static `/public` folder for any uploaded `.bin` firmware update.
 * Uses the static `firmware-catalog.json` index (auto-generated from `/public`) with a
 * direct `/firmware.json` static fallback — zero APIs or external services required.
 */
export async function fetchPublicFirmwareCatalog(options?: {
  signal?: AbortSignal;
}): Promise<PublicFirmwareCatalogResult> {
  const cacheBust = `t=${Date.now()}`;

  // 1. Check static /firmware-catalog.json generated from files in /public
  try {
    const catRes = await fetch(`/firmware-catalog.json?${cacheBust}`, {
      method: 'GET',
      cache: 'no-store',
      signal: options?.signal
    });
    const contentType = (catRes.headers.get('content-type') || '').toLowerCase();
    if (catRes.ok && !contentType.includes('text/html')) {
      const parsed = await catRes.json();
      if (parsed?.schema === 'studio-pad-public-firmware') {
        const recent: FirmwareReleaseInfo[] = Array.isArray(parsed.recentReleases)
          ? parsed.recentReleases
          : parsed.latestRelease
          ? [parsed.latestRelease]
          : [];
        return {
          latestRelease: parsed.latestRelease || recent[0] || null,
          recentReleases: recent
        };
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  // 2. Fallback: Check /firmware.json directly and verify the .bin file exists in /public
  try {
    const metaRes = await fetch(`/firmware.json?${cacheBust}`, {
      method: 'GET',
      cache: 'no-store',
      signal: options?.signal
    });
    const metaType = (metaRes.headers.get('content-type') || '').toLowerCase();
    if (metaRes.ok && !metaType.includes('text/html')) {
      const meta = await metaRes.json();
      const rawFile = String(meta?.file || meta?.binary || 'firmware.bin').trim();
      const rawVersion = normalizeFirmwareVersionLabel(
        String(meta?.version || meta?.tag || '')
      );
      if (rawFile && rawVersion) {
        const fileUrl = rawFile.startsWith('/') ? rawFile : `/${rawFile}`;
        const headRes = await fetch(`${fileUrl}?${cacheBust}`, {
          method: 'HEAD',
          cache: 'no-store',
          signal: options?.signal
        });
        const binType = (headRes.headers.get('content-type') || '').toLowerCase();
        if (headRes.ok && !binType.includes('text/html')) {
          const sizeBytes =
            Number(headRes.headers.get('content-length') || meta?.sizeBytes || 0) || 0;
          const fileName = fileUrl.split('/').pop() || 'firmware.bin';
          const release: FirmwareReleaseInfo = {
            version: rawVersion,
            rawTag: `v${rawVersion}`,
            title: String(meta?.title || `Firmware v${rawVersion}`),
            notes: String(meta?.notes || ''),
            publishedAt:
              typeof meta?.publishedAt === 'string'
                ? meta.publishedAt
                : headRes.headers.get('last-modified'),
            htmlUrl: fileUrl,
            source: 'release',
            repoSlug: PUBLIC_FIRMWARE_SOURCE_SLUG,
            assets: [
              {
                name: fileName,
                sizeBytes,
                downloadUrl: fileUrl,
                corsSafeUrl: fileUrl,
                sha256:
                  typeof meta?.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(meta.sha256)
                    ? meta.sha256.toLowerCase()
                    : undefined,
                isBinary: true
              }
            ]
          };
          return {
            latestRelease: release,
            recentReleases: [release]
          };
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  return {
    latestRelease: null,
    recentReleases: []
  };
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const safeView = new Uint8Array(bytes);
    const buf = await crypto.subtle.digest('SHA-256', safeView);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

/**
 * Downloads the `.bin` firmware file from the website's `/public` folder
 * with byte progress and SHA-256 verification before streaming to the MacroPad.
 */
export async function downloadFirmwareBinary(
  asset: FirmwareReleaseAsset,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const sep = asset.downloadUrl.includes('?') ? '&' : '?';
  const fetchUrl = `${asset.downloadUrl}${sep}t=${Date.now()}`;

  const res = await fetch(fetchUrl, {
    method: 'GET',
    cache: 'no-store',
    signal
  });

  if (!res.ok) {
    throw new Error(`Could not load ${asset.name} from public folder (HTTP ${res.status}).`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error(`Firmware file ${asset.name} was not found in the public folder.`);
  }

  const contentLen = Number(res.headers.get('content-length') || asset.sizeBytes || 0);
  let bytes: Uint8Array;

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(received, contentLen || received);
      }
    }
    bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    const ab = await res.arrayBuffer();
    bytes = new Uint8Array(ab);
    onProgress?.(bytes.byteLength, contentLen || bytes.byteLength);
  }

  if (isHtmlSpaFallbackBytes(bytes)) {
    throw new Error(`Firmware file ${asset.name} was not found in the public folder.`);
  }

  if (bytes.byteLength < 1024) {
    throw new Error(`Firmware binary ${asset.name} is too small (${bytes.byteLength} B).`);
  }

  const sha256 = await computeSha256Hex(bytes);
  if (asset.sha256 && sha256 && asset.sha256.toLowerCase() !== sha256.toLowerCase()) {
    throw new Error(
      `SHA-256 checksum mismatch for ${asset.name}. Please refresh and try again.`
    );
  }

  return { bytes, sha256 };
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
