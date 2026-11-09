import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Grid3X3,
  Bluetooth,
  Compass,
  Zap,
  CheckCircle2,
  Play
} from 'lucide-react';
import { soundEngine } from '../services/soundEffects';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSetupWizard?: () => void;
}

interface TourStep {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  description: string;
  highlights: string[];
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to BertoPad Studio',
    subtitle: 'Your Flagship Mechanical Macro Pad & Studio',
    icon: Sparkles,
    accentColor: '#F2A33A',
    description:
      'Experience the pinnacle of macro control. Configure 9 mechanical keycaps, dual knurled rotary encoders with click-and-spin actions, and real-time gyro motion tracking.',
    highlights: [
      'Zero-latency simulated & USB WebSerial hardware connection',
      'Instant acoustic switch audio synthesis (Thock, Click, Tactile)',
      '128x64 OLED monochrome preview HUD'
    ],
    tip: 'Press numbers 1 through 9 on your keyboard anytime to trigger keys directly.'
  },
  {
    title: 'Multi-Host Bluetooth Engine',
    subtitle: '3 Independent Profiles with Smart OS Mapping',
    icon: Bluetooth,
    accentColor: '#38BDF8',
    description:
      'BertoPad features 3 independent Bluetooth host profiles. Switch instantly between your Mac, Windows workstation, and Linux rig with automatic shortcut translation (⌘C ⇄ Ctrl+C).',
    highlights: [
      'Per-host OS mapping (macOS, Windows, Linux)',
      'Quick profile switching via Alt + 1/2/3',
      'Standalone or paired BLE operation'
    ],
    tip: 'Click any [H1]–[H3] badge on the OLED strip to switch hosts instantly.'
  },
  {
    title: '3D Tactile View & Gyro Motion',
    subtitle: 'GY-521 Motion Tracking & 4-Axis Calibration',
    icon: Compass,
    accentColor: '#10B981',
    description:
      'Activate 3D Tactile view to watch your virtual pad react in real time to physical GY-521 gyro tilts, shakes, and face-up/face-down gestures.',
    highlights: [
      'Real-time isometric pitch, roll, and yaw rendering',
      'Guided 5-step flat & 4-axis directional calibration wizard',
      'Motion gesture bindings for shake, face up, and face down'
    ],
    tip: 'Click "3D View" in the top bar to immerse yourself in the tactile 3D model.'
  },
  {
    title: 'Macro Sequence Builder',
    subtitle: 'Multi-Step Actions, Text Typing & Loops',
    icon: Zap,
    accentColor: '#A855F7',
    description:
      'Build powerful automated macros with multi-step delays, modifier holds, text strings, and repeat loops. Dry run your actions safely offline before testing.',
    highlights: [
      'Visual timeline builder with live step previews',
      'Instant safety dry run mode with zero device output',
      'Exportable printable cheat sheets for desk reference'
    ],
    tip: 'Select any key in Edit mode and click "Open Macro Builder" to get started.'
  }
];

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  onOpenSetupWizard
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < TOUR_STEPS.length - 1) {
          e.preventDefault();
          soundEngine.playKeyClick();
          setCurrentStep(s => s + 1);
        } else if (currentStep === TOUR_STEPS.length - 1) {
          e.preventDefault();
          soundEngine.playSuccessChime();
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStep > 0) {
          e.preventDefault();
          soundEngine.playKeyClick();
          setCurrentStep(s => s - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, onClose]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-panel-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--bg-input)]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300 ease-out"
            style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
              style={{
                backgroundColor: 'rgba(var(--accent-rgb), 0.18)',
                color: 'var(--accent)',
                border: '1px solid rgba(var(--accent-rgb), 0.35)'
              }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--accent)]">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </div>
              <h2 id="onboarding-tour-title" className="text-lg font-bold text-[var(--text-primary)]">
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Skip tour"
            className="p-2 rounded-xl hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-[var(--text-secondary)] leading-relaxed">
            {step.description}
          </p>

          <div className="space-y-2 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4">
            <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">
              Key Capabilities:
            </div>
            {step.highlights.map(h => (
              <div key={h} className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <span>{h}</span>
              </div>
            ))}
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-xs text-[var(--text-primary)] flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span><strong>Pro Tip:</strong> {step.tip}</span>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              soundEngine.playKeyClick();
              setCurrentStep(s => Math.max(0, s - 1));
            }}
            disabled={currentStep === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  soundEngine.playKeyClick();
                  setCurrentStep(idx);
                }}
                aria-label={`Go to step ${idx + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentStep === idx
                    ? 'w-6 bg-[var(--accent)]'
                    : 'w-2 bg-[var(--border-strong)] hover:bg-[var(--text-muted)]'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {isLast && onOpenSetupWizard && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSetupWizard();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <span>Setup Wizard</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundEngine.playKeyClick();
                if (isLast) {
                  soundEngine.playSuccessChime();
                  onClose();
                } else {
                  setCurrentStep(s => s + 1);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <span>{isLast ? 'Get Started' : 'Next'}</span>
              {!isLast ? <ChevronRight className="w-4 h-4" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
