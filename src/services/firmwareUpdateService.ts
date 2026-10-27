import {
  FirmwareReleaseAsset,
  FirmwareReleaseInfo
} from '../types/studio';

export const DEFAULT_FIRMWARE_GITHUB_REPO: string =
  ((import.meta as any).env?.VITE_FIRMWARE_GITHUB_REPO as string | undefined)?.trim() ||
  'cjm7v45ccr-blip/Studio-Macropad';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_CACHE_PREFIX = 'studio_pad_fw_gh_cache_v2:';

export interface GitHubFirmwareCatalogResult {
  latestRelease: FirmwareReleaseInfo | null;
  recentReleases: FirmwareReleaseInfo[];
}

interface CachedCatalogRecord {
  fetchedAt: number;
  catalog: GitHubFirmwareCatalogResult;
}

const memoryCache = new Map<string, CachedCatalogRecord>();

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  slug: string;
}

export function parseGitHubRepoSlug(input?: string | null): ParsedGitHubRepo | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];
  const validToken = /^[A-Za-z0-9._-]+$/;
  if (!validToken.test(owner) || !validToken.test(repo)) return null;

  return {
    owner,
    repo,
    slug: `${owner}/${repo}`
  };
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
 * Compares an installed ESP32 firmware version with a candidate GitHub version.
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

function readCachedCatalog(slug: string): CachedCatalogRecord | null {
  const mem = memoryCache.get(slug);
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_MS) {
    return mem;
  }
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalogRecord;
    if (
      parsed &&
      typeof parsed.fetchedAt === 'number' &&
      parsed.catalog &&
      Date.now() - parsed.fetchedAt < CACHE_TTL_MS
    ) {
      memoryCache.set(slug, parsed);
      return parsed;
    }
  } catch {}
  return null;
}

function writeCachedCatalog(slug: string, catalog: GitHubFirmwareCatalogResult) {
  const record: CachedCatalogRecord = {
    fetchedAt: Date.now(),
    catalog
  };
  memoryCache.set(slug, record);
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${slug}`, JSON.stringify(record));
  } catch {}
}

function isFirmwareAssetName(name: string): boolean {
  return /\.(bin|elf|uf2|hex|ino|zip|json)$/i.test(name);
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

/**
 * Selects the primary OTA application `.bin` asset from a release's asset list,
 * automatically skipping ESP32 `bootloader.bin`, `partitions.bin`, and `boot_app0.bin`.
 */
export function selectPrimaryOtaBinaryAsset(
  assets: FirmwareReleaseAsset[] | undefined | null
): FirmwareReleaseAsset | null {
  if (!assets || assets.length === 0) return null;
  const binAssets = assets.filter(a => /\.bin$/i.test(a.name));
  if (binAssets.length === 0) return null;

  const appBins = binAssets.filter(a => !isAuxiliaryBootloaderAsset(a.name));
  if (appBins.length > 0) {
    // Prefer assets explicitly containing firmware / studio / macropad / ota
    const preferred = appBins.find(a =>
      /(?:firmware|studio|macropad|pad|ota|app)/i.test(a.name)
    );
    return preferred || appBins[0];
  }
  return binAssets[0];
}

function parseSha256Digest(rawDigest: unknown): string | undefined {
  if (typeof rawDigest !== 'string') return undefined;
  const trimmed = rawDigest.trim();
  if (/^sha256:[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.slice(7).toLowerCase();
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return undefined;
}

function parseReleaseObject(
  rel: any,
  repoSlug: string
): FirmwareReleaseInfo | null {
  if (!rel || rel.draft) return null;
  const rawTag = String(rel.tag_name || rel.name || '').trim();
  const version = normalizeFirmwareVersionLabel(rawTag || String(rel.name || ''));
  if (!version || !/\d/.test(version)) return null;

  const rawAssets: any[] = Array.isArray(rel.assets) ? rel.assets : [];
  let manifestUrl: string | null = null;

  const assets: FirmwareReleaseAsset[] = rawAssets
    .filter(
      a =>
        a &&
        typeof a.name === 'string' &&
        typeof a.browser_download_url === 'string' &&
        isFirmwareAssetName(a.name)
    )
    .map(a => {
      const name = String(a.name);
      if (/manifest\.json$/i.test(name)) {
        manifestUrl = a.browser_download_url;
      }
      return {
        name,
        sizeBytes: typeof a.size === 'number' ? a.size : 0,
        downloadUrl: a.browser_download_url,
        sha256: parseSha256Digest(a.digest),
        isBinary: /\.bin$/i.test(name)
      };
    })
    .filter(a => !/\.json$/i.test(a.name));

  // Also parse SHA-256 checksums mentioned in release notes (`<64-hex>  firmware.bin`)
  const bodyText = typeof rel.body === 'string' ? rel.body.trim() : '';
  if (bodyText && assets.length > 0) {
    for (const asset of assets) {
      if (asset.sha256) continue;
      const escapedName = asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b([0-9a-fA-F]{64})\\b[^\\n]*${escapedName}`, 'i');
      const revRe = new RegExp(`${escapedName}[^\\n]*\\b([0-9a-fA-F]{64})\\b`, 'i');
      const m = bodyText.match(re) || bodyText.match(revRe);
      if (m && m[1]) {
        asset.sha256 = m[1].toLowerCase();
      }
    }
  }

  return {
    version,
    rawTag: rawTag || version,
    title: String(rel.name || rawTag || `Firmware ${version}`).trim(),
    notes: bodyText,
    publishedAt: typeof rel.published_at === 'string' ? rel.published_at : null,
    htmlUrl:
      typeof rel.html_url === 'string' && rel.html_url
        ? rel.html_url
        : `https://github.com/${repoSlug}/releases`,
    source: 'release',
    repoSlug,
    assets,
    manifestUrl
  };
}

function extractFirmwareVersionMacroFromSource(sourceCode: string): string | null {
  const defineMatch = sourceCode.match(
    /#\s*define\s+FIRMWARE_VERSION\s+"([^"]+)"/
  );
  if (defineMatch && defineMatch[1]) {
    const clean = normalizeFirmwareVersionLabel(defineMatch[1]);
    if (clean && /\d/.test(clean)) return clean;
  }

  const constMatch = sourceCode.match(
    /FIRMWARE_VERSION\s*(?:=\s*|\[\]\s*=\s*)"([^"]+)"/
  );
  if (constMatch && constMatch[1]) {
    const clean = normalizeFirmwareVersionLabel(constMatch[1]);
    if (clean && /\d/.test(clean)) return clean;
  }

  return null;
}

function buildRateLimitMessage(res: Response): string {
  const resetEpoch = Number(res.headers.get('x-ratelimit-reset') || 0);
  if (resetEpoch > 0) {
    const resetDate = new Date(resetEpoch * 1000);
    const timeStr = resetDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `GitHub API rate limit reached. Try checking again after ${timeStr}.`;
  }
  return 'GitHub API rate limit reached. Try checking again in a few minutes.';
}

async function githubApiGet(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json'
    },
    signal
  });
}

function encodeGitHubPath(filePath: string): string {
  return filePath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

/**
 * Fetches both the newest published ESP32 firmware version and recent historical releases
 * from any public GitHub repository (supports separate dedicated firmware repositories!).
 *
 * Inspects:
 * 1. Formal GitHub Releases (`/releases?per_page=8`) including `.bin` assets and SHA-256 digests
 * 2. Default-branch `.bin` builds (e.g. `dist/*.bin`, `build/*.bin`, `firmware/*.bin` served via CORS-enabled `raw.githubusercontent.com`)
 * 3. Optional `firmware-manifest.json` / `manifest.json` in the repo root or `releases/` folder
 * 4. Default-branch `.ino` / `config.h` `#define FIRMWARE_VERSION` and Git tags
 */
export async function fetchGitHubFirmwareCatalog(
  repoInput?: string | null,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<GitHubFirmwareCatalogResult> {
  const parsedRepo = parseGitHubRepoSlug(repoInput || DEFAULT_FIRMWARE_GITHUB_REPO);
  if (!parsedRepo) {
    throw new Error('Enter a valid GitHub repository in owner/repo format.');
  }

  const { owner, repo, slug } = parsedRepo;

  if (!options?.force) {
    const cached = readCachedCatalog(slug);
    if (cached) {
      return cached.catalog;
    }
  }

  const candidates: FirmwareReleaseInfo[] = [];

  // 1. Fetch recent formal GitHub Releases (up to 8 so users can also pick/roll back versions)
  const listRelRes = await githubApiGet(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=8`,
    options?.signal
  );

  if (listRelRes.status === 403 || listRelRes.status === 429) {
    throw new Error(buildRateLimitMessage(listRelRes));
  }

  if (listRelRes.ok) {
    const relList = await listRelRes.json();
    if (Array.isArray(relList)) {
      for (const item of relList) {
        const parsed = parseReleaseObject(item, slug);
        if (parsed) candidates.push(parsed);
      }
    }
  }

  // 2. Verify repository metadata & scan default branch for CORS-friendly `.bin` files, `manifest.json`, and `#define FIRMWARE_VERSION`
  const repoMetaRes = await githubApiGet(
    `https://api.github.com/repos/${owner}/${repo}`,
    options?.signal
  );

  if (repoMetaRes.status === 404) {
    throw new Error(
      `GitHub repository "${slug}" was not found or is set to private.`
    );
  }

  if (repoMetaRes.status === 403 || repoMetaRes.status === 429) {
    if (candidates.length > 0) {
      const fallbackCatalog: GitHubFirmwareCatalogResult = {
        latestRelease: candidates[0],
        recentReleases: candidates
      };
      writeCachedCatalog(slug, fallbackCatalog);
      return fallbackCatalog;
    }
    throw new Error(buildRateLimitMessage(repoMetaRes));
  }

  if (repoMetaRes.ok) {
    const repoMeta = await repoMetaRes.json();
    const defaultBranch = String(repoMeta.default_branch || 'main');
    const pushedAt =
      typeof repoMeta.pushed_at === 'string' ? repoMeta.pushed_at : null;

    try {
      const treeRes = await githubApiGet(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
          defaultBranch
        )}?recursive=1`,
        options?.signal
      );

      if (treeRes.ok) {
        const treeData = await treeRes.json();
        const treeItems: any[] = Array.isArray(treeData?.tree) ? treeData.tree : [];

        // Discover any committed `.bin` binaries in the repository (served with `Access-Control-Allow-Origin: *` via raw.githubusercontent.com!)
        const repoBinNodes = treeItems.filter(
          node =>
            node &&
            node.type === 'blob' &&
            typeof node.path === 'string' &&
            !node.path.includes('node_modules/') &&
            /\.bin$/i.test(node.path)
        );

        const rawBinAssets: FirmwareReleaseAsset[] = repoBinNodes.map(node => {
          const fileName = node.path.split('/').pop() || node.path;
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
            defaultBranch
          )}/${encodeGitHubPath(node.path)}`;
          return {
            name: fileName,
            sizeBytes: typeof node.size === 'number' ? node.size : 0,
            downloadUrl: rawUrl,
            corsSafeUrl: rawUrl,
            isBinary: true
          };
        });

        // Attach matching `corsSafeUrl` (`raw.githubusercontent.com/<owner>/<repo>/<tag>/...`) or defaultBranch fallback
        if (repoBinNodes.length > 0 && candidates.length > 0) {
          for (const rel of candidates) {
            for (const asset of rel.assets) {
              if (!asset.isBinary || asset.corsSafeUrl) continue;
              const matchingNode = repoBinNodes.find(n => {
                const base = (n.path.split('/').pop() || '').toLowerCase();
                return base === asset.name.toLowerCase();
              });
              if (matchingNode && rel.rawTag) {
                asset.corsSafeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
                  rel.rawTag
                )}/${encodeGitHubPath(matchingNode.path)}`;
              }
            }
          }
        }

        // Check if repository publishes a `firmware-manifest.json` or `ota/manifest.json`
        const manifestNode = treeItems.find(
          node =>
            node &&
            node.type === 'blob' &&
            typeof node.path === 'string' &&
            /(?:^|\/)(?:firmware-manifest|ota-manifest|manifest)\.json$/i.test(node.path) &&
            !node.path.includes('node_modules/') &&
            !node.path.includes('public/') &&
            !node.path.includes('src/')
        );

        if (manifestNode) {
          const manifestRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
            defaultBranch
          )}/${encodeGitHubPath(manifestNode.path)}`;
          try {
            const mRes = await fetch(manifestRawUrl, { signal: options?.signal });
            if (mRes.ok) {
              const mJson = await mRes.json();
              const mVer = normalizeFirmwareVersionLabel(
                String(mJson?.version || mJson?.tag || '')
              );
              const mBinRel = typeof mJson?.bin === 'string'
                ? mJson.bin
                : typeof mJson?.url === 'string'
                ? mJson.url
                : '';
              if (mVer && /\d/.test(mVer)) {
                const resolvedBinUrl = mBinRel.startsWith('http')
                  ? mBinRel
                  : mBinRel
                  ? `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
                      defaultBranch
                    )}/${encodeGitHubPath(mBinRel.replace(/^\.?\//, ''))}`
                  : '';
                const manifestAssets: FirmwareReleaseAsset[] = resolvedBinUrl
                  ? [
                      {
                        name: resolvedBinUrl.split('/').pop() || `firmware-${mVer}.bin`,
                        sizeBytes: typeof mJson?.size === 'number' ? mJson.size : 0,
                        downloadUrl: resolvedBinUrl,
                        corsSafeUrl: resolvedBinUrl.includes('raw.githubusercontent.com')
                          ? resolvedBinUrl
                          : undefined,
                        sha256: parseSha256Digest(mJson?.sha256),
                        isBinary: true
                      }
                    ]
                  : rawBinAssets;

                candidates.push({
                  version: mVer,
                  rawTag: String(mJson?.tag || `v${mVer}`),
                  title: String(mJson?.title || `Firmware ${mVer}`),
                  notes: String(mJson?.notes || mJson?.changelog || ''),
                  publishedAt: typeof mJson?.published_at === 'string' ? mJson.published_at : pushedAt,
                  htmlUrl: `https://github.com/${slug}`,
                  source: 'release',
                  repoSlug: slug,
                  assets: manifestAssets,
                  manifestUrl: manifestRawUrl
                });
              }
            }
          } catch {}
        }

        // Inspect firmware source headers for `#define FIRMWARE_VERSION`
        const firmwareFiles = treeItems
          .filter(
            node =>
              node &&
              node.type === 'blob' &&
              typeof node.path === 'string' &&
              !node.path.includes('node_modules/') &&
              !node.path.includes('dist/') &&
              (/\.(ino|pde)$/i.test(node.path) ||
                /(?:^|\/)(?:config|version|firmware)[A-Za-z0-9_-]*\.h$/i.test(node.path))
          )
          .sort((a, b) => {
            const aIno = /\.ino$/i.test(a.path) ? 0 : 1;
            const bIno = /\.ino$/i.test(b.path) ? 0 : 1;
            if (aIno !== bIno) return aIno - bIno;
            return a.path.split('/').length - b.path.split('/').length;
          })
          .slice(0, 5);

        for (const fileNode of firmwareFiles) {
          const encodedPath = encodeGitHubPath(fileNode.path);
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
            defaultBranch
          )}/${encodedPath}`;
          const rawRes = await fetch(rawUrl, { signal: options?.signal });
          if (!rawRes.ok) continue;
          const text = await rawRes.text();
          const detectedVer = extractFirmwareVersionMacroFromSource(text);
          if (detectedVer) {
            const fileName = fileNode.path.split('/').pop() || fileNode.path;
            const branchAssets: FirmwareReleaseAsset[] = [...rawBinAssets];
            if (/\.ino$/i.test(fileName)) {
              branchAssets.push({
                name: fileName,
                sizeBytes: typeof fileNode.size === 'number' ? fileNode.size : 0,
                downloadUrl: rawUrl,
                corsSafeUrl: rawUrl,
                isBinary: false
              });
            }
            candidates.push({
              version: detectedVer,
              rawTag: detectedVer,
              title: `${defaultBranch} branch firmware (${fileName})`,
              notes: `Detected #define FIRMWARE_VERSION "${detectedVer}" in ${fileNode.path} on branch ${defaultBranch}.`,
              publishedAt: pushedAt,
              htmlUrl: `https://github.com/${slug}/blob/${encodeURIComponent(
                defaultBranch
              )}/${encodedPath}`,
              source: 'branch_source',
              repoSlug: slug,
              assets: branchAssets
            });
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }

    // 3. If neither Releases nor branch source yielded a version, check Git tags
    if (candidates.length === 0) {
      try {
        const tagsRes = await githubApiGet(
          `https://api.github.com/repos/${owner}/${repo}/tags?per_page=8`,
          options?.signal
        );
        if (tagsRes.ok) {
          const tags = await tagsRes.json();
          if (Array.isArray(tags)) {
            for (const t of tags) {
              const tagName = String(t?.name || '').trim();
              const version = normalizeFirmwareVersionLabel(tagName);
              if (version && /\d/.test(version)) {
                candidates.push({
                  version,
                  rawTag: tagName,
                  title: `Tag ${tagName}`,
                  notes: '',
                  publishedAt: pushedAt,
                  htmlUrl: `https://github.com/${slug}/releases/tag/${encodeURIComponent(
                    tagName
                  )}`,
                  source: 'tag',
                  repoSlug: slug,
                  assets: []
                });
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
      }
    }
  }

  if (candidates.length === 0) {
    const emptyCatalog: GitHubFirmwareCatalogResult = {
      latestRelease: null,
      recentReleases: []
    };
    writeCachedCatalog(slug, emptyCatalog);
    return emptyCatalog;
  }

  // Sort newest first; if versions tie, prefer formal Release with `.bin` over branch_source / tag
  candidates.sort((a, b) => {
    const cmp = compareFirmwareVersions(a.version, b.version);
    if (cmp !== 0) return cmp;
    const aHasBin = selectPrimaryOtaBinaryAsset(a.assets) ? 0 : 1;
    const bHasBin = selectPrimaryOtaBinaryAsset(b.assets) ? 0 : 1;
    if (aHasBin !== bHasBin) return aHasBin - bHasBin;
    const sourcePriority = (s: FirmwareReleaseInfo['source']) =>
      s === 'release' ? 0 : s === 'tag' ? 1 : 2;
    return sourcePriority(a.source) - sourcePriority(b.source);
  });

  // Deduplicate by normalized version so each version appears once with its richest asset list
  const deduped: FirmwareReleaseInfo[] = [];
  const seenVersions = new Set<string>();
  for (const item of candidates) {
    const key = normalizeFirmwareVersionLabel(item.version).toLowerCase();
    if (seenVersions.has(key)) continue;
    seenVersions.add(key);
    deduped.push(item);
  }

  const catalog: GitHubFirmwareCatalogResult = {
    latestRelease: deduped[0] || null,
    recentReleases: deduped.slice(0, 6)
  };
  writeCachedCatalog(slug, catalog);
  return catalog;
}

export async function fetchLatestGitHubFirmware(
  repoInput?: string | null,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<FirmwareReleaseInfo | null> {
  const catalog = await fetchGitHubFirmwareCatalog(repoInput, options);
  return catalog.latestRelease;
}

export class FirmwareCorsError extends Error {
  public readonly assetUrl: string;
  constructor(assetUrl: string, message?: string) {
    super(
      message ||
        'Browser CORS blocked direct download from GitHub Releases S3 redirect. Use Wi-Fi Direct OTA (ESP32 fetches directly from GitHub), commit a CORS-accessible binary/manifest in your firmware repo, or drop the .bin file below.'
    );
    this.name = 'FirmwareCorsError';
    this.assetUrl = assetUrl;
  }
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
 * Downloads a firmware `.bin` asset in the browser with streaming byte progress and SHA-256 verification.
 * Automatically tries `corsSafeUrl` (`raw.githubusercontent.com` / GitHub Pages) first, then `downloadUrl`.
 */
export async function downloadFirmwareBinary(
  asset: FirmwareReleaseAsset,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const urlsToTry = Array.from(
    new Set([asset.corsSafeUrl, asset.downloadUrl].filter((u): u is string => Boolean(u)))
  );

  let lastErr: any = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { method: 'GET', mode: 'cors', signal });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} when fetching ${asset.name}`);
        continue;
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

      if (bytes.byteLength < 1024) {
        throw new Error(`Downloaded ${asset.name} is unexpectedly small (${bytes.byteLength} B).`);
      }

      const sha256 = await computeSha256Hex(bytes);
      if (asset.sha256 && sha256 && asset.sha256.toLowerCase() !== sha256.toLowerCase()) {
        throw new Error(
          `SHA-256 checksum mismatch for ${asset.name} (expected ${asset.sha256.slice(0, 12)}…, got ${sha256.slice(0, 12)}…). Aborted before flashing.`
        );
      }

      return { bytes, sha256 };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (err instanceof Error && err.message.includes('SHA-256 checksum mismatch')) {
        throw err;
      }
      lastErr = err;
    }
  }

  // TypeError: Failed to fetch from browser fetch() on github.com/.../releases/download/... is caused by GitHub's 302 S3 CORS policy
  if (
    lastErr instanceof TypeError ||
    String(lastErr?.message || '').toLowerCase().includes('failed to fetch') ||
    String(lastErr?.message || '').toLowerCase().includes('networkerror')
  ) {
    throw new FirmwareCorsError(asset.downloadUrl);
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Unable to download ${asset.name} from GitHub.`);
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
