import {
  FirmwareReleaseAsset,
  FirmwareReleaseInfo
} from '../types/studio';

export const DEFAULT_FIRMWARE_GITHUB_REPO: string =
  ((import.meta as any).env?.VITE_FIRMWARE_GITHUB_REPO as string | undefined)?.trim() ||
  'cjm7v45ccr-blip/Studio-Macropad';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_CACHE_PREFIX = 'studio_pad_fw_gh_cache_v1:';

interface CachedReleaseRecord {
  fetchedAt: number;
  release: FirmwareReleaseInfo | null;
}

const memoryCache = new Map<string, CachedReleaseRecord>();

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  slug: string;
}

export function parseGitHubRepoSlug(input?: string | null): ParsedGitHubRepo | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  let cleaned = raw
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

function readCachedRelease(slug: string): CachedReleaseRecord | null {
  const mem = memoryCache.get(slug);
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_MS) {
    return mem;
  }
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReleaseRecord;
    if (
      parsed &&
      typeof parsed.fetchedAt === 'number' &&
      Date.now() - parsed.fetchedAt < CACHE_TTL_MS
    ) {
      memoryCache.set(slug, parsed);
      return parsed;
    }
  } catch {}
  return null;
}

function writeCachedRelease(slug: string, release: FirmwareReleaseInfo | null) {
  const record: CachedReleaseRecord = {
    fetchedAt: Date.now(),
    release
  };
  memoryCache.set(slug, record);
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${slug}`, JSON.stringify(record));
  } catch {}
}

function isFirmwareAssetName(name: string): boolean {
  return /\.(bin|elf|uf2|hex|ino|zip)$/i.test(name);
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
  const assets: FirmwareReleaseAsset[] = rawAssets
    .filter(
      a =>
        a &&
        typeof a.name === 'string' &&
        typeof a.browser_download_url === 'string' &&
        isFirmwareAssetName(a.name)
    )
    .map(a => ({
      name: a.name,
      sizeBytes: typeof a.size === 'number' ? a.size : 0,
      downloadUrl: a.browser_download_url
    }));

  return {
    version,
    rawTag: rawTag || version,
    title: String(rel.name || rawTag || `Firmware ${version}`).trim(),
    notes: typeof rel.body === 'string' ? rel.body.trim() : '',
    publishedAt: typeof rel.published_at === 'string' ? rel.published_at : null,
    htmlUrl:
      typeof rel.html_url === 'string' && rel.html_url
        ? rel.html_url
        : `https://github.com/${repoSlug}/releases`,
    source: 'release',
    repoSlug,
    assets
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
 * Fetches the newest published ESP32 firmware version from the configured GitHub repository.
 * Checks GitHub Releases first, and also inspects default-branch `.ino` / `config.h` firmware
 * definitions and repository tags so repos with or without formal GitHub Releases work seamlessly.
 */
export async function fetchLatestGitHubFirmware(
  repoInput?: string | null,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<FirmwareReleaseInfo | null> {
  const parsedRepo = parseGitHubRepoSlug(repoInput || DEFAULT_FIRMWARE_GITHUB_REPO);
  if (!parsedRepo) {
    throw new Error('Enter a valid GitHub repository in owner/repo format.');
  }

  const { owner, repo, slug } = parsedRepo;

  if (!options?.force) {
    const cached = readCachedRelease(slug);
    if (cached) {
      return cached.release;
    }
  }

  const candidates: FirmwareReleaseInfo[] = [];

  // 1. Check latest formal GitHub Release
  const latestRelRes = await githubApiGet(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    options?.signal
  );

  if (latestRelRes.status === 403 || latestRelRes.status === 429) {
    throw new Error(buildRateLimitMessage(latestRelRes));
  }

  if (latestRelRes.ok) {
    const relJson = await latestRelRes.json();
    const parsed = parseReleaseObject(relJson, slug);
    if (parsed) candidates.push(parsed);
  } else if (latestRelRes.status === 404) {
    // Check if there are pre-releases in /releases?per_page=5
    const listRelRes = await githubApiGet(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
      options?.signal
    );
    if (listRelRes.ok) {
      const relList = await listRelRes.json();
      if (Array.isArray(relList)) {
        for (const item of relList) {
          const parsed = parseReleaseObject(item, slug);
          if (parsed) {
            candidates.push(parsed);
            break;
          }
        }
      }
    }
  }

  // 2. Verify repository metadata & scan default branch for `#define FIRMWARE_VERSION`
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
      writeCachedRelease(slug, candidates[0]);
      return candidates[0];
    }
    throw new Error(buildRateLimitMessage(repoMetaRes));
  }

  if (repoMetaRes.ok) {
    const repoMeta = await repoMetaRes.json();
    const defaultBranch = String(repoMeta.default_branch || 'main');
    const pushedAt =
      typeof repoMeta.pushed_at === 'string' ? repoMeta.pushed_at : null;

    // Inspect recursive tree on default branch to locate `.ino` or `config.h` firmware version
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
              assets: /\.ino$/i.test(fileName)
                ? [
                    {
                      name: fileName,
                      sizeBytes: typeof fileNode.size === 'number' ? fileNode.size : 0,
                      downloadUrl: rawUrl
                    }
                  ]
                : []
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
    writeCachedRelease(slug, null);
    return null;
  }

  // Pick the highest version; if tied, prefer formal GitHub Release over branch source / tag
  candidates.sort((a, b) => {
    const cmp = compareFirmwareVersions(a.version, b.version);
    if (cmp !== 0) return cmp; // if b > a, cmp === 1 -> b comes first
    const sourcePriority = (s: FirmwareReleaseInfo['source']) =>
      s === 'release' ? 0 : s === 'tag' ? 1 : 2;
    return sourcePriority(a.source) - sourcePriority(b.source);
  });

  const best = candidates[0];
  writeCachedRelease(slug, best);
  return best;
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
