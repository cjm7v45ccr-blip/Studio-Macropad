import React, { useEffect, useMemo, useState } from 'react';
import {
  DeviceConnectionInfo,
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  StudioSettings
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import {
  formatBytesCompact,
  selectPrimaryOtaBinaryAsset
} from '../services/firmwareUpdateService';
import { usbHardware } from '../services/usbHardwareService';
import {
  AlertCircle,
  Archive,
  ArrowUpCircle,
  CheckCircle2,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wifi,
  X
} from 'lucide-react';

interface FirmwareSharedProps {
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  installProgress: FirmwareInstallProgress | null;
  isUploadingFirmware: boolean;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onCheckFirmwareUpdate: (opts?: {
    force?: boolean;
    silent?: boolean;
  }) => Promise<FirmwareUpdateState>;
  onUploadFirmwareToMacropad: (opts?: {
    releaseOverride?: FirmwareReleaseInfo | null;
    method?: 'usb_serial' | 'wifi_ota';
    autoBackupBeforeFlash?: boolean;
  }) => Promise<boolean>;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onExportBackupFile?: () => Promise<void> | void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

const STAGE_LABELS: Record<FirmwareInstallProgress['stage'], string> = {
  idle: 'Ready to Install',
  backing_up: 'Backing Up',
  downloading: 'Downloading',
  verifying_hash: 'Verifying',
  flashing: 'Writing to MacroPad',
  rebooting: 'Restarting MacroPad',
  complete: 'Installation Complete',
  error: 'Update Interrupted'
};

interface BannerVisualConfig {
  statusLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
  spinIcon?: boolean;
  iconColorClass: string;
  statusTextClass: string;
  strokeClass: string;
  fillClass: string;
  compactSurfaceClass: string;
  fullSurfaceClass: string;
  dividerBorderClass: string;
}

function getBannerVisualConfig(
  activeStage: FirmwareInstallProgress['stage'] | null,
  updateStatus: FirmwareUpdateState['status']
): BannerVisualConfig {
  if (activeStage === 'complete') {
    return {
      statusLabel: 'Installation Complete',
      Icon: CheckCircle2,
      iconColorClass: 'text-emerald-400',
      statusTextClass: 'text-emerald-400',
      strokeClass: 'stroke-emerald-400',
      fillClass: 'fill-emerald-400',
      compactSurfaceClass: 'bg-emerald-500/10 border-b border-emerald-500/30',
      fullSurfaceClass: 'bg-emerald-500/10 border border-emerald-500/35',
      dividerBorderClass: 'border-emerald-500/25'
    };
  }

  if (activeStage === 'error' || (!activeStage && updateStatus === 'error')) {
    return {
      statusLabel: 'Update Interrupted',
      Icon: AlertCircle,
      iconColorClass: 'text-rose-400',
      statusTextClass: 'text-rose-400',
      strokeClass: 'stroke-rose-400',
      fillClass: 'fill-rose-400/80',
      compactSurfaceClass: 'bg-rose-500/10 border-b border-rose-500/30',
      fullSurfaceClass: 'bg-rose-500/10 border border-rose-500/35',
      dividerBorderClass: 'border-rose-500/25'
    };
  }

  if (activeStage === 'backing_up') {
    return {
      statusLabel: 'Backing Up',
      Icon: Archive,
      iconColorClass: 'text-sky-400',
      statusTextClass: 'text-sky-400',
      strokeClass: 'stroke-sky-400',
      fillClass: 'fill-sky-400',
      compactSurfaceClass: 'bg-sky-500/10 border-b border-sky-500/30',
      fullSurfaceClass: 'bg-sky-500/10 border border-sky-500/35',
      dividerBorderClass: 'border-sky-500/25'
    };
  }

  if (activeStage === 'downloading') {
    return {
      statusLabel: 'Downloading',
      Icon: Download,
      iconColorClass: 'text-sky-400',
      statusTextClass: 'text-sky-400',
      strokeClass: 'stroke-sky-400',
      fillClass: 'fill-sky-400',
      compactSurfaceClass: 'bg-sky-500/10 border-b border-sky-500/30',
      fullSurfaceClass: 'bg-sky-500/10 border border-sky-500/35',
      dividerBorderClass: 'border-sky-500/25'
    };
  }

  if (activeStage === 'verifying_hash') {
    return {
      statusLabel: 'Verifying',
      Icon: ShieldCheck,
      iconColorClass: 'text-cyan-400',
      statusTextClass: 'text-cyan-400',
      strokeClass: 'stroke-cyan-400',
      fillClass: 'fill-cyan-400',
      compactSurfaceClass: 'bg-cyan-500/10 border-b border-cyan-500/30',
      fullSurfaceClass: 'bg-cyan-500/10 border border-cyan-500/35',
      dividerBorderClass: 'border-cyan-500/25'
    };
  }

  if (activeStage === 'flashing') {
    return {
      statusLabel: 'Writing to MacroPad',
      Icon: Cpu,
      iconColorClass: 'text-[var(--accent)]',
      statusTextClass: 'text-[var(--accent)]',
      strokeClass: 'stroke-[var(--accent)]',
      fillClass: 'fill-[var(--accent)]',
      compactSurfaceClass:
        'bg-[rgba(var(--accent-rgb),0.10)] border-b border-[rgba(var(--accent-rgb),0.32)]',
      fullSurfaceClass:
        'bg-[rgba(var(--accent-rgb),0.09)] border border-[rgba(var(--accent-rgb),0.35)]',
      dividerBorderClass: 'border-[rgba(var(--accent-rgb),0.25)]'
    };
  }

  if (activeStage === 'rebooting') {
    return {
      statusLabel: 'Restarting MacroPad',
      Icon: RefreshCw,
      spinIcon: true,
      iconColorClass: 'text-violet-400',
      statusTextClass: 'text-violet-400',
      strokeClass: 'stroke-violet-400',
      fillClass: 'fill-violet-400',
      compactSurfaceClass: 'bg-violet-500/10 border-b border-violet-500/30',
      fullSurfaceClass: 'bg-violet-500/10 border border-violet-500/35',
      dividerBorderClass: 'border-violet-500/25'
    };
  }

  if (updateStatus === 'checking') {
    return {
      statusLabel: 'Checking Update',
      Icon: RefreshCw,
      spinIcon: true,
      iconColorClass: 'text-sky-400',
      statusTextClass: 'text-sky-400',
      strokeClass: 'stroke-sky-400',
      fillClass: 'fill-sky-400',
      compactSurfaceClass: 'bg-amber-500/10 border-b border-amber-500/30',
      fullSurfaceClass: 'bg-amber-500/10 border border-amber-500/35',
      dividerBorderClass: 'border-amber-500/20'
    };
  }

  return {
    statusLabel: 'Ready to Install',
    Icon: ArrowUpCircle,
    iconColorClass: 'text-amber-400',
    statusTextClass: 'text-amber-400',
    strokeClass: 'stroke-amber-400',
    fillClass: 'fill-amber-400',
    compactSurfaceClass: 'bg-amber-500/10 border-b border-amber-500/30',
    fullSurfaceClass: 'bg-amber-500/10 border border-amber-500/35',
    dividerBorderClass: 'border-amber-500/20'
  };
}

function clampProgressPercent(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

const FirmwareRadialProgress: React.FC<{
  percent: number;
  stage: FirmwareInstallProgress['stage'];
  size?: 'sm' | 'md';
}> = ({ percent, stage, size = 'md' }) => {
  const clamped = clampProgressPercent(percent);
  const arcPercent = Math.max(4, clamped);
  const visual = getBannerVisualConfig(stage, 'idle');
  const StageIcon = visual.Icon;

  const dimensions = size === 'sm' ? 'w-7 h-7' : 'w-11 h-11';

  return (
    <div
      className={`relative ${dimensions} shrink-0 inline-flex items-center justify-center select-none`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" className="w-full h-full block">
        <circle
          cx={20}
          cy={20}
          r={16.5}
          fill="none"
          strokeWidth={size === 'sm' ? 3.6 : 3.2}
          className="stroke-current text-[var(--text-muted)] opacity-25"
        />
        <circle
          cx={20}
          cy={20}
          r={16.5}
          fill="none"
          strokeWidth={size === 'sm' ? 3.6 : 3.2}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - arcPercent}
          strokeLinecap="round"
          className={`-rotate-90 origin-center transition-[stroke-dashoffset] duration-150 ease-out ${visual.strokeClass}`}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        {stage === 'complete' || stage === 'error' ? (
          <StageIcon
            className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
              visual.iconColorClass
            }`}
          />
        ) : size === 'sm' ? (
          <StageIcon
            className={`w-3 h-3 ${visual.iconColorClass} ${
              visual.spinIcon ? 'animate-spin' : ''
            }`}
          />
        ) : (
          <span className="font-mono text-[10px] font-bold text-[var(--text-primary)] tabular-nums leading-none">
            {clamped}%
          </span>
        )}
      </div>
    </div>
  );
};

const FirmwareLinearProgress: React.FC<{
  percent: number;
  stage: FirmwareInstallProgress['stage'];
  ariaLabel: string;
  thick?: boolean;
}> = ({ percent, stage, ariaLabel, thick = false }) => {
  const clamped = clampProgressPercent(percent);
  const fillWidth = Math.max(3, clamped);
  const visual = getBannerVisualConfig(stage, 'idle');

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped}% — ${STAGE_LABELS[stage]}`}
      className={`w-full ${
        thick ? 'h-2' : 'h-1.5'
      } rounded-full bg-black/25 overflow-hidden`}
    >
      <svg
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
        className="w-full h-full block"
        aria-hidden="true"
      >
        <rect
          x={0}
          y={0}
          width={fillWidth}
          height={4}
          className={`transition-all duration-150 ease-out ${visual.fillClass}`}
        />
      </svg>
    </div>
  );
};

const INSTALL_MILESTONES: {
  id: 'download' | 'verify' | 'write' | 'complete';
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'download', label: 'Downloading', Icon: Download },
  { id: 'verify', label: 'Verifying', Icon: ShieldCheck },
  { id: 'write', label: 'Writing', Icon: Cpu },
  { id: 'complete', label: 'Installation Complete', Icon: CheckCircle2 }
];

function getMilestoneRank(stage: FirmwareInstallProgress['stage']): number {
  switch (stage) {
    case 'backing_up':
    case 'downloading':
      return 0;
    case 'verifying_hash':
      return 1;
    case 'flashing':
    case 'rebooting':
      return 2;
    case 'complete':
      return 3;
    default:
      return -1;
  }
}

const FirmwareStageTrail: React.FC<{
  stage: FirmwareInstallProgress['stage'];
}> = ({ stage }) => {
  if (stage === 'idle' || stage === 'error') return null;
  const activeRank = getMilestoneRank(stage);
  const activeVisual = getBannerVisualConfig(stage, 'idle');

  return (
    <div
      aria-label="Firmware installation stages"
      className="flex items-center gap-1.5 flex-wrap text-[11px] select-none"
    >
      {INSTALL_MILESTONES.map((step, idx) => {
        const isDone = stage === 'complete' || idx < activeRank;
        const isCurrent = stage !== 'complete' && idx === activeRank;
        const StepIcon = isDone ? CheckCircle2 : step.Icon;

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <span className="text-[var(--text-muted)]" aria-hidden="true">
                →
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 ${
                isDone
                  ? 'text-emerald-400 font-medium'
                  : isCurrent
                  ? `${activeVisual.statusTextClass} font-semibold`
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <StepIcon className="w-3 h-3 shrink-0" />
              <span>
                {step.id === 'write' && stage === 'rebooting'
                  ? 'Restarting'
                  : step.label}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const FirmwareProgressBox: React.FC<{
  installProgress: FirmwareInstallProgress | null;
  isUploading: boolean;
}> = ({ installProgress, isUploading }) => {
  if (!installProgress || installProgress.stage === 'idle') return null;
  const clamped = clampProgressPercent(installProgress.percent);
  const visual = getBannerVisualConfig(installProgress.stage, 'idle');
  const StageIcon = visual.Icon;

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 text-xs ${
        installProgress.stage === 'error'
          ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
          : installProgress.stage === 'complete'
          ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
          : 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
        <span className={`font-semibold flex items-center gap-1.5 ${visual.statusTextClass}`}>
          {isUploading && visual.spinIcon ? (
            <Loader2 className={`w-3.5 h-3.5 animate-spin ${visual.iconColorClass}`} />
          ) : (
            <StageIcon className={`w-3.5 h-3.5 shrink-0 ${visual.iconColorClass}`} />
          )}
          <span>{STAGE_LABELS[installProgress.stage]}</span>
        </span>
        <span>
          {installProgress.stage === 'error'
            ? clamped > 0
              ? `Stopped at ${clamped}%`
              : ''
            : `${clamped}%`}
          {installProgress.bytesWritten !== undefined &&
            installProgress.totalBytes !== undefined &&
            installProgress.totalBytes > 0 &&
            ` · ${formatBytesCompact(installProgress.bytesWritten)} / ${formatBytesCompact(
              installProgress.totalBytes
            )}`}
        </span>
      </div>

      <FirmwareLinearProgress
        percent={clamped}
        stage={installProgress.stage}
        ariaLabel="MacroPad firmware write progress"
      />

      <div className="text-[11px] leading-relaxed opacity-90">
        {installProgress.message}
      </div>
    </div>
  );
};

export const FirmwareUpdateBanner: React.FC<{
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  installProgress: FirmwareInstallProgress | null;
  isUploadingFirmware: boolean;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onUploadToMacropad: () => void;
  onJumpToUpdater?: () => void;
  compact?: boolean;
}> = ({
  connection,
  firmwareUpdate,
  installProgress,
  isUploadingFirmware,
  isFirmwareBannerDismissed,
  onDismissFirmwareBanner,
  onUploadToMacropad,
  onJumpToUpdater,
  compact = false
}) => {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const latestRelease = firmwareUpdate.latestRelease;

  const activeStage =
    installProgress && installProgress.stage !== 'idle'
      ? installProgress.stage
      : null;

  const hasAvailableUpdate =
    connection.connected &&
    firmwareUpdate.status === 'update_available' &&
    Boolean(latestRelease) &&
    !isFirmwareBannerDismissed;

  const showActiveUploadInBanner =
    activeStage !== null && (!isFirmwareBannerDismissed || isUploadingFirmware);

  if (!hasAvailableUpdate && !showActiveUploadInBanner) return null;

  const primaryAsset = latestRelease
    ? selectPrimaryOtaBinaryAsset(latestRelease.assets) || latestRelease.assets[0] || null
    : null;

  const formattedReleaseDate = latestRelease?.publishedAt
    ? new Date(latestRelease.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;

  const clampedPercent = clampProgressPercent(installProgress?.percent);
  const targetVersion =
    installProgress?.targetVersion || latestRelease?.version || '';
  const isComplete = activeStage === 'complete';
  const isError = activeStage === 'error';
  const isWritingBinary = activeStage === 'flashing';
  const isVerifying = activeStage === 'verifying_hash';
  const isActiveTransfer = activeStage !== null && !isComplete && !isError;

  const visual = getBannerVisualConfig(activeStage, firmwareUpdate.status);
  const StatusIcon = visual.Icon;

  const hasByteTelemetry =
    installProgress?.bytesWritten !== undefined &&
    installProgress?.totalBytes !== undefined &&
    installProgress.totalBytes > 0;

  if (compact) {
    return (
      <div
        role="region"
        aria-label="MacroPad firmware update notification"
        className={`shrink-0 ${visual.compactSurfaceClass} px-3 sm:px-5 py-2.5 space-y-2 transition-colors`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeStage ? (
              <FirmwareRadialProgress
                percent={clampedPercent}
                stage={activeStage}
                size="sm"
              />
            ) : (
              <StatusIcon
                className={`w-4 h-4 ${visual.iconColorClass} shrink-0 ${
                  visual.spinIcon ? 'animate-spin' : ''
                }`}
              />
            )}

            <div className="flex items-center gap-2 flex-wrap text-xs min-w-0">
              <span className={`font-semibold ${visual.statusTextClass}`}>
                {visual.statusLabel}
              </span>

              <span className="text-[var(--text-muted)]" aria-hidden="true">
                ·
              </span>

              <span className="font-medium text-[var(--text-primary)]">
                {isComplete
                  ? `Running${targetVersion ? ` v${targetVersion}` : ' latest firmware'}`
                  : isError
                  ? installProgress?.message || 'Check USB cable and retry'
                  : activeStage
                  ? `Firmware${targetVersion ? ` v${targetVersion}` : ''}`
                  : latestRelease
                  ? `Firmware v${latestRelease.version} available`
                  : 'MacroPad firmware update'}
              </span>

              {activeStage ? (
                <>
                  {!isError && (
                    <>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[var(--text-primary)] tabular-nums">
                        {clampedPercent}%
                      </span>
                    </>
                  )}
                  {isVerifying && installProgress?.sha256 && (
                    <>
                      <span
                        className="text-[var(--text-muted)] hidden sm:inline"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums hidden sm:inline">
                        SHA-256 {installProgress.sha256.slice(0, 10)}…
                      </span>
                    </>
                  )}
                  {hasByteTelemetry && !isError && (
                    <>
                      <span
                        className="text-[var(--text-muted)] hidden sm:inline"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums hidden sm:inline">
                        {formatBytesCompact(installProgress!.bytesWritten!)} /{' '}
                        {formatBytesCompact(installProgress!.totalBytes!)}
                      </span>
                    </>
                  )}
                  {(isWritingBinary || activeStage === 'rebooting') && (
                    <>
                      <span
                        className="text-[var(--text-muted)] hidden lg:inline"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)] hidden lg:inline">
                        Keep USB cable connected
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  {latestRelease && firmwareUpdate.installedVersion && (
                    <>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        Installed {firmwareUpdate.installedVersion} → v
                        {latestRelease.version}
                      </span>
                    </>
                  )}
                  {primaryAsset && primaryAsset.sizeBytes > 0 && (
                    <>
                      <span
                        className="text-[var(--text-muted)] hidden md:inline"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums hidden md:inline">
                        {formatBytesCompact(primaryAsset.sizeBytes)}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isComplete ? (
              <button
                type="button"
                onClick={onDismissFirmwareBanner}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            ) : (hasAvailableUpdate || isActiveTransfer || isError) && (
              <button
                type="button"
                disabled={isUploadingFirmware || !primaryAsset}
                onClick={onUploadToMacropad}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity cursor-pointer whitespace-nowrap"
              >
                {isUploadingFirmware ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span className="tabular-nums">
                  {isUploadingFirmware
                    ? `${visual.statusLabel} ${clampedPercent}%…`
                    : isError
                    ? 'Retry Upload'
                    : 'Upload to MacroPad'}
                </span>
              </button>
            )}

            {onJumpToUpdater && (
              <button
                type="button"
                onClick={onJumpToUpdater}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                Details
              </button>
            )}

            {!isUploadingFirmware && (
              <button
                type="button"
                onClick={onDismissFirmwareBanner}
                aria-label="Dismiss firmware update notification"
                title="Dismiss notification"
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {activeStage && (
          <FirmwareLinearProgress
            percent={clampedPercent}
            stage={activeStage}
            ariaLabel="MacroPad firmware binary write progress"
          />
        )}
      </div>
    );
  }

  if (!latestRelease && !activeStage) return null;

  return (
    <div
      role="region"
      aria-label="MacroPad firmware update available"
      className={`p-4 sm:p-5 rounded-2xl ${visual.fullSurfaceClass} space-y-3 transition-colors`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {activeStage ? (
            <FirmwareRadialProgress
              percent={clampedPercent}
              stage={activeStage}
              size="md"
            />
          ) : (
            <StatusIcon
              className={`w-5 h-5 ${visual.iconColorClass} shrink-0 mt-0.5 ${
                visual.spinIcon ? 'animate-spin' : ''
              }`}
            />
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${visual.statusTextClass}`}
              >
                <StatusIcon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    visual.spinIcon ? 'animate-spin' : ''
                  }`}
                />
                <span>{visual.statusLabel}</span>
              </span>
              {targetVersion && (
                <>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    v{targetVersion}
                  </span>
                </>
              )}
            </div>

            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {isComplete
                ? `MacroPad updated${targetVersion ? ` to v${targetVersion}` : ''}`
                : isError
                ? 'Firmware update could not complete'
                : isVerifying
                ? `Verifying firmware${targetVersion ? ` v${targetVersion}` : ''} integrity`
                : isWritingBinary
                ? `Writing firmware${targetVersion ? ` v${targetVersion}` : ''} to MacroPad`
                : isActiveTransfer && activeStage
                ? `Installing firmware${targetVersion ? ` v${targetVersion}` : ''} on MacroPad`
                : `New MacroPad firmware update available (v${targetVersion})`}
            </div>

            <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {activeStage ? (
                <>
                  <span className="text-[var(--text-primary)] font-semibold">
                    {isError && clampedPercent > 0
                      ? `Stopped at ${clampedPercent}%`
                      : `${clampedPercent}%`}
                  </span>
                  {isVerifying && installProgress?.sha256 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>SHA-256 {installProgress.sha256.slice(0, 12)}…</span>
                    </>
                  )}
                  {hasByteTelemetry && !isError && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatBytesCompact(installProgress!.bytesWritten!)} /{' '}
                        {formatBytesCompact(installProgress!.totalBytes!)}
                      </span>
                    </>
                  )}
                  {(isWritingBinary || activeStage === 'rebooting') && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Keep USB cable connected</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span>Installed {firmwareUpdate.installedVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span>Available v{targetVersion}</span>
                  {primaryAsset && primaryAsset.sizeBytes > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formatBytesCompact(primaryAsset.sizeBytes)}</span>
                    </>
                  )}
                  {formattedReleaseDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formattedReleaseDate}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {!isUploadingFirmware && (
          <button
            type="button"
            onClick={onDismissFirmwareBanner}
            aria-label="Dismiss firmware update notification"
            title="Dismiss notification"
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {activeStage && installProgress ? (
        <div className={`space-y-2.5 border-t ${visual.dividerBorderClass} pt-3`}>
          <FirmwareStageTrail stage={activeStage} />

          <FirmwareLinearProgress
            thick
            percent={clampedPercent}
            stage={activeStage}
            ariaLabel="MacroPad firmware binary write progress"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span
              className={
                isError
                  ? 'text-rose-300'
                  : isComplete
                  ? 'text-emerald-300'
                  : 'text-[var(--text-secondary)]'
              }
            >
              {installProgress.message}
            </span>
            {hasByteTelemetry && !isError && (
              <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                {formatBytesCompact(installProgress.bytesWritten!)} written
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Press <span className="font-semibold text-[var(--text-primary)]">Upload to MacroPad</span>{' '}
          below to install the update directly over USB — saved button profiles, Bluetooth hosts, and Wi-Fi settings stay intact.
        </p>
      )}

      {!activeStage && latestRelease?.notes && (
        <div className="space-y-2 border-t border-amber-500/20 pt-2.5">
          <button
            type="button"
            onClick={() => setShowReleaseNotes(v => !v)}
            className="text-xs font-medium text-amber-400 hover:underline cursor-pointer whitespace-nowrap"
          >
            {showReleaseNotes ? 'Hide release notes' : 'View release notes'}
          </button>
          {showReleaseNotes && (
            <pre className="text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed">
              {latestRelease.notes}
            </pre>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {isComplete ? (
          <button
            type="button"
            onClick={onDismissFirmwareBanner}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isUploadingFirmware || !primaryAsset}
            onClick={onUploadToMacropad}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            {isUploadingFirmware ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span className="tabular-nums">
              {isUploadingFirmware
                ? `${visual.statusLabel} (${clampedPercent}%)…`
                : isError
                ? `Retry Upload${targetVersion ? ` (v${targetVersion})` : ''}`
                : `Upload v${targetVersion} to MacroPad`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export const FirmwareUpdaterCard: React.FC<FirmwareSharedProps> = ({
  settings,
  connection,
  firmwareUpdate,
  installProgress,
  isUploadingFirmware,
  onCheckFirmwareUpdate,
  onUploadFirmwareToMacropad,
  onUpdateSettings,
  onExportBackupFile,
  onToast
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [autoBackupBeforeFlash, setAutoBackupBeforeFlash] = useState<boolean>(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const availableReleases: FirmwareReleaseInfo[] = useMemo(() => {
    if (firmwareUpdate.recentReleases && firmwareUpdate.recentReleases.length > 0) {
      return firmwareUpdate.recentReleases;
    }
    return firmwareUpdate.latestRelease ? [firmwareUpdate.latestRelease] : [];
  }, [firmwareUpdate.latestRelease, firmwareUpdate.recentReleases]);

  useEffect(() => {
    if (availableReleases.length === 0) {
      setSelectedVersion('');
      return;
    }
    const stillExists = availableReleases.some(r => r.version === selectedVersion);
    if (!stillExists) {
      setSelectedVersion(availableReleases[0].version);
    }
  }, [availableReleases, selectedVersion]);

  const selectedRelease: FirmwareReleaseInfo | null = useMemo(() => {
    if (availableReleases.length === 0) return null;
    return (
      availableReleases.find(r => r.version === selectedVersion) || availableReleases[0]
    );
  }, [availableReleases, selectedVersion]);

  const primaryBinAsset = useMemo(
    () => selectPrimaryOtaBinaryAsset(selectedRelease?.assets),
    [selectedRelease]
  );

  const padWifiOnline = Boolean(connection.connected && connection.telemetry?.wifiConnected);
  const canFlashUsb = connection.connected || usbHardware.browserSupportsWebSerial;
  const latestRelease = firmwareUpdate.latestRelease;

  const handleManualFirmwareCheck = async () => {
    const result = await onCheckFirmwareUpdate({
      force: true,
      silent: false
    });
    if (result.status === 'error') {
      onToast(result.error || 'Firmware update check failed', 'error');
    } else if (result.status === 'update_available' && result.latestRelease) {
      onToast(
        `New update available: ${result.installedVersion} → v${result.latestRelease.version}`
      );
    } else if (result.status === 'up_to_date') {
      onToast(`MacroPad firmware (${result.installedVersion}) is up to date`);
    } else if (result.status === 'ahead' && result.latestRelease) {
      onToast(`MacroPad firmware (${result.installedVersion}) is up to date`);
    } else if (result.latestRelease) {
      onToast(
        `Firmware v${result.latestRelease.version} is ready to upload over USB`
      );
    } else {
      onToast('Your MacroPad firmware is up to date — no new update posted yet');
    }
  };

  return (
    <div
      id="firmware-updater-card"
      className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4"
    >
      {/* Header + Auto-Check + Check for Updates */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <RefreshCw
              className={`w-4 h-4 text-[var(--accent)] ${
                firmwareUpdate.status === 'checking' ? 'animate-spin' : ''
              }`}
            />
            <span>MacroPad Firmware Updates</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Flashes updates from the public folder directly via the ESP32 USB bootloader — compatible with Huge APP (3MB No OTA) while keeping saved profiles, Bluetooth hosts, and Wi-Fi intact.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isUploadingFirmware}
            onClick={() =>
              onUpdateSettings({
                autoCheckFirmwareUpdates: !settings.autoCheckFirmwareUpdates
              })
            }
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Auto-Notify</span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                settings.autoCheckFirmwareUpdates
                  ? 'text-emerald-400'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {settings.autoCheckFirmwareUpdates ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            disabled={firmwareUpdate.status === 'checking' || isUploadingFirmware}
            onClick={handleManualFirmwareCheck}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            {firmwareUpdate.status === 'checking' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)]" />
            )}
            <span>
              {firmwareUpdate.status === 'checking' ? 'Checking…' : 'Check for Updates'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Status Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-[var(--border-subtle)] text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-wrap font-mono text-[11px] tabular-nums">
          {firmwareUpdate.status === 'checking' ? (
            <span className="text-[var(--text-secondary)]">
              Checking for firmware updates…
            </span>
          ) : firmwareUpdate.status === 'error' ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300 font-sans text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{firmwareUpdate.error}</span>
            </span>
          ) : firmwareUpdate.status === 'update_available' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Update available · {firmwareUpdate.installedVersion} → v{latestRelease.version}
              </span>
            </span>
          ) : firmwareUpdate.status === 'up_to_date' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Up to date · Installed {firmwareUpdate.installedVersion}
              </span>
            </span>
          ) : firmwareUpdate.status === 'ahead' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Up to date · Installed {firmwareUpdate.installedVersion}
              </span>
            </span>
          ) : latestRelease && !connection.connected ? (
            <span className="text-[var(--text-secondary)]">
              Available firmware: v{latestRelease.version} · Connect MacroPad via USB to update
            </span>
          ) : (
            <span className="text-[var(--text-muted)] font-sans text-xs">
              {connection.connected
                ? `Installed firmware: ${connection.firmwareVersion} · Up to date`
                : 'Connect your MacroPad via USB to check your firmware version and install updates.'}
            </span>
          )}
        </div>

        {firmwareUpdate.checkedAt && (
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
            Checked {firmwareUpdate.checkedAt}
          </span>
        )}
      </div>

      {/* Upload to MacroPad Controls */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              {selectedRelease && primaryBinAsset
                ? `Firmware v${selectedRelease.version}`
                : 'No Firmware Update Posted Yet'}
            </div>
            <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums truncate">
              {selectedRelease && primaryBinAsset ? (
                <>
                  <span>{primaryBinAsset.name}</span>
                  {primaryBinAsset.sizeBytes > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span>{formatBytesCompact(primaryBinAsset.sizeBytes)}</span>
                    </>
                  )}
                  {primaryBinAsset.sha256 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span>SHA-256 {primaryBinAsset.sha256.slice(0, 10)}…</span>
                    </>
                  )}
                </>
              ) : (
                <span className="font-sans">
                  When a new firmware update is released, you will get a notification here to upload it to your MacroPad.
                </span>
              )}
            </div>
          </div>

          {availableReleases.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {availableReleases.length > 1 && (
                <select
                  aria-label="Target firmware version"
                  disabled={isUploadingFirmware}
                  value={selectedRelease?.version || ''}
                  onChange={e => setSelectedVersion(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                >
                  {availableReleases.map((rel, idx) => (
                    <option key={rel.version} value={rel.version}>
                      v{rel.version}
                      {idx === 0 ? ' (Latest)' : ''}
                    </option>
                  ))}
                </select>
              )}

              {selectedRelease?.notes && (
                <button
                  type="button"
                  onClick={() => setShowReleaseNotes(v => !v)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  {showReleaseNotes ? 'Hide notes' : 'Release notes'}
                </button>
              )}
            </div>
          )}
        </div>

        {showReleaseNotes && selectedRelease?.notes && (
          <pre className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
            {selectedRelease.notes}
          </pre>
        )}

        {onExportBackupFile && primaryBinAsset && connection.connected && (
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoBackupBeforeFlash}
              disabled={isUploadingFirmware}
              onChange={e => setAutoBackupBeforeFlash(e.target.checked)}
              className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
            />
            <span>Download profile backup automatically before updating</span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={isUploadingFirmware || !canFlashUsb || !primaryBinAsset}
            onClick={() =>
              onUploadFirmwareToMacropad({
                releaseOverride: selectedRelease,
                method: 'usb_serial',
                autoBackupBeforeFlash
              })
            }
            title={
              !canFlashUsb
                ? 'Open this site in Chrome or Edge on desktop to flash over USB'
                : !primaryBinAsset
                ? 'No firmware update available yet'
                : 'Flashes firmware directly via the ESP32 USB bootloader (supports Huge APP / No OTA)'
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            {isUploadingFirmware && installProgress?.method === 'usb_serial' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {isUploadingFirmware && installProgress?.method === 'usb_serial'
                ? 'Uploading to MacroPad…'
                : selectedRelease && primaryBinAsset
                ? !connection.connected
                  ? `Select USB Port & Upload (v${selectedRelease.version})`
                  : firmwareUpdate.status === 'update_available'
                  ? `Upload Update to MacroPad (v${selectedRelease.version})`
                  : `Upload v${selectedRelease.version} to MacroPad`
                : 'Upload to MacroPad'}
            </span>
          </button>

          {padWifiOnline && primaryBinAsset && selectedRelease && (
            <button
              type="button"
              disabled={isUploadingFirmware}
              onClick={() =>
                onUploadFirmwareToMacropad({
                  releaseOverride: selectedRelease,
                  method: 'wifi_ota',
                  autoBackupBeforeFlash
                })
              }
              title="MacroPad downloads and installs the update over Wi-Fi"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Upload via Wi-Fi</span>
            </button>
          )}
        </div>

        <FirmwareProgressBox
          installProgress={installProgress}
          isUploading={isUploadingFirmware}
        />
      </div>
    </div>
  );
};
