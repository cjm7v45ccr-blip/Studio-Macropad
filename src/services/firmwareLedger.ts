import { isFirmwareAtLeast } from '../data/firmwareCatalog';

export const FLASHED_LEDGER_STORAGE_KEY = 'studio-pad-flashed-fw-v1';

export interface FlashedDeviceLedgerEntry {
  /** Raw firmware version reported by the board's `/api/status` (e.g. "v2.1.0") or "*" if pending first boot */
  rawReportedVersion: string;
  /** Version label of the `.bin` image flashed onto this board (e.g. "4.5.0") */
  flashedVersion: string;
  /** SHA-256 digest of the flashed `.bin` */
  sha256?: string;
  /** ISO timestamp of when the image was flashed */
  flashedAt: string;
  /** True if the flashed `.bin` contains the v4.5+ standalone `DELAY:` / `/api/macro/cancel` engine */
  supportsV45Engine?: boolean;
}

export function normalizeFirmwareDisplayTag(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '—' || trimmed === 'Connecting…') return '';
  return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed.replace(/^V(?=\d)/, 'v');
}

function parseTuple(ver: string): [number, number, number, number] {
  const m = ver
    .replace(/^[vV]/, '')
    .trim()
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0, 0];
  return [
    parseInt(m[1] || '0', 10) || 0,
    parseInt(m[2] || '0', 10) || 0,
    parseInt(m[3] || '0', 10) || 0,
    parseInt(m[4] || '0', 10) || 0
  ];
}

/**
 * Returns `1` if `target` is newer than `installed`, `-1` if `installed` is newer, `0` if equal.
 */
function compareLedgerSemver(installed: string, target: string): -1 | 0 | 1 {
  const a = parseTuple(installed);
  const b = parseTuple(target);
  for (let i = 0; i < 4; i++) {
    if (b[i] > a[i]) return 1;
    if (b[i] < a[i]) return -1;
  }
  return 0;
}

export function extractVersionFromBinFilename(fileName: string): string | null {
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

export function inspectFirmwareBinaryCapabilities(bytes: Uint8Array): {
  embeddedVersion: string | null;
  supportsV45Engine: boolean;
} {
  try {
    const latin1 = new TextDecoder('iso-8859-1').decode(bytes);
    const supportsV45Engine =
      latin1.includes('/api/macro/cancel') ||
      latin1.includes('DELAY:') ||
      latin1.includes('tv_toggle');
    const jsonFwMatch = latin1.match(
      /"firmware"\s*:\s*"v?(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)"/
    );
    return {
      embeddedVersion: jsonFwMatch?.[1] || null,
      supportsV45Engine
    };
  } catch {
    return {
      embeddedVersion: null,
      supportsV45Engine: false
    };
  }
}

export function readFlashedLedger(deviceId: string | undefined): FlashedDeviceLedgerEntry | null {
  if (!deviceId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FLASHED_LEDGER_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, FlashedDeviceLedgerEntry>;
    return map?.[deviceId] || null;
  } catch {
    return null;
  }
}

export function writeFlashedLedger(
  deviceId: string | undefined,
  entry: FlashedDeviceLedgerEntry
): void {
  if (!deviceId || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(FLASHED_LEDGER_STORAGE_KEY);
    const map: Record<string, FlashedDeviceLedgerEntry> = raw ? JSON.parse(raw) : {};
    map[deviceId] = entry;
    localStorage.setItem(FLASHED_LEDGER_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function removeFlashedLedger(deviceId: string | undefined): void {
  if (!deviceId || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(FLASHED_LEDGER_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, FlashedDeviceLedgerEntry>;
    if (deviceId in map) {
      delete map[deviceId];
      localStorage.setItem(FLASHED_LEDGER_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

export interface ResolvedFirmwareInfo {
  /** Unified installed version displayed across Diagnostics, Updater, and Modals (e.g. "v4.5.0") */
  displayVersion: string;
  /** Raw firmware version string reported directly in `/api/status` (e.g. "v2.1.0") */
  reportedVersion: string;
  /** True if the active firmware supports native `DELAY:<ms>` tokens and 512-byte `/api/customizer/save` */
  supportsV45Engine: boolean;
  /** Active ledger entry if matched */
  ledgerEntry: FlashedDeviceLedgerEntry | null;
}

/**
 * Resolves the unified firmware version and real C++ feature flags for a connected MacroPad.
 * - Reconciles boards flashed with a `.bin` whose compiled `config.h` still contained an older `FIRMWARE_VERSION` string.
 * - Automatically clears stale ledger overrides if the board later reports a newer native firmware string.
 */
export function resolveDeviceFirmwareInfo(
  deviceId: string | undefined,
  rawReportedFw: string | undefined | null
): ResolvedFirmwareInfo {
  const reportedVersion = normalizeFirmwareDisplayTag(rawReportedFw);
  const nativeV45 = isFirmwareAtLeast(reportedVersion, 4, 5, 0);

  if (!deviceId || deviceId === 'demo-pad' || !reportedVersion) {
    return {
      displayVersion: reportedVersion,
      reportedVersion,
      supportsV45Engine: nativeV45,
      ledgerEntry: null
    };
  }

  const entry = readFlashedLedger(deviceId);
  if (!entry || !entry.flashedVersion) {
    return {
      displayVersion: reportedVersion,
      reportedVersion,
      supportsV45Engine: nativeV45,
      ledgerEntry: null
    };
  }

  const flashedTag = normalizeFirmwareDisplayTag(entry.flashedVersion);
  const entryRawTag =
    entry.rawReportedVersion === '*'
      ? '*'
      : normalizeFirmwareDisplayTag(entry.rawReportedVersion);

  // If the board now reports a strictly newer firmware version than the ledger, clear the old ledger
  if (flashedTag && compareLedgerSemver(flashedTag, reportedVersion) === 1) {
    removeFlashedLedger(deviceId);
    return {
      displayVersion: reportedVersion,
      reportedVersion,
      supportsV45Engine: nativeV45,
      ledgerEntry: null
    };
  }

  // First boot right after flashing before rawReportedVersion was captured: lock in reportedVersion
  if (entryRawTag === '*' && flashedTag) {
    const healed: FlashedDeviceLedgerEntry = {
      ...entry,
      rawReportedVersion: reportedVersion
    };
    writeFlashedLedger(deviceId, healed);
    return {
      displayVersion: flashedTag,
      reportedVersion,
      supportsV45Engine: nativeV45 || Boolean(entry.supportsV45Engine),
      ledgerEntry: healed
    };
  }

  // Standard match: board reports the same embedded version as when this .bin was flashed
  if (entryRawTag && entryRawTag === reportedVersion && flashedTag) {
    const cmp = compareLedgerSemver(reportedVersion, flashedTag);
    if (cmp >= 0) {
      return {
        displayVersion: flashedTag,
        reportedVersion,
        supportsV45Engine: nativeV45 || Boolean(entry.supportsV45Engine),
        ledgerEntry: entry
      };
    }
  }

  return {
    displayVersion: reportedVersion,
    reportedVersion,
    supportsV45Engine: nativeV45,
    ledgerEntry: null
  };
}
