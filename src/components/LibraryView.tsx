import React, { useState, useMemo } from 'react';
import {
  PresetTemplate,
  StudioProfile,
  UserPreset
} from '../types/studio';
import { PRESET_TEMPLATES, ALL_KEY_IDS } from '../data/presetTemplates';
import { KeycapIcon } from '../data/iconRegistry';
import {
  Download,
  Upload,
  Link2,
  BookmarkPlus,
  Trash2,
  Check,
  Search
} from 'lucide-react';

interface LibraryViewProps {
  activeProfile: StudioProfile;
  userPresets: UserPreset[];
  onApplyProfileLayout: (sourceProfile: StudioProfile) => void;
  onSaveUserPreset: (name: string) => void;
  onDeleteUserPreset: (id: string) => void;
  onImportProfileJson: (profile: StudioProfile) => void;
  onToast: (msg: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  activeProfile,
  userPresets,
  onApplyProfileLayout,
  onSaveUserPreset,
  onDeleteUserPreset,
  onImportProfileJson,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'my_presets'>('templates');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [customPresetName, setCustomPresetName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const categories = ['All', 'Creative', 'Code', 'Streaming', 'Media & Comms', 'Productivity'];

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRESET_TEMPLATES.filter(t => {
      const catOk = categoryFilter === 'All' || t.category === categoryFilter;
      if (!catOk) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, query]);

  const handleExportActiveJson = () => {
    const payload = {
      schema: 'studio-pad-profile-v2',
      exportedAt: new Date().toISOString(),
      profile: activeProfile
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProfile.name.toLowerCase().replace(/\s+/g, '-')}-profile.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onToast(`Exported "${activeProfile.name}" as JSON`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const prof: StudioProfile | undefined = parsed.profile || (parsed.layers ? parsed : undefined);
        if (!prof || !Array.isArray(prof.layers) || prof.layers.length < 4) {
          onToast('Invalid Studio Pad profile JSON file');
          return;
        }
        onImportProfileJson({
          ...prof,
          id: `prof-${Date.now()}`
        });
      } catch (_) {
        onToast('Could not parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyShareLink = async () => {
    try {
      const compactJson = JSON.stringify(activeProfile);
      const encoded = btoa(encodeURIComponent(compactJson));
      const shareUrl = `${window.location.origin}${window.location.pathname}#preset=${encoded}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      onToast('Shareable profile link copied to clipboard');
    } catch (_) {
      onToast('Could not copy link to clipboard');
    }
  };

  const renderMiniGrid = (sampleProfile: StudioProfile) => {
    const l1 = sampleProfile.layers[0];
    return (
      <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        {ALL_KEY_IDS.map(kid => {
          const k = l1.keys[kid];
          return (
            <div
              key={kid}
              className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
              title={`${k.appearance.label}`}
            >
              <KeycapIcon
                icon={k.appearance.icon}
                className="w-3.5 h-3.5"
                style={{ color: k.appearance.labelColor }}
              />
              <span className="text-[9px] font-medium text-[var(--text-secondary)] truncate max-w-full">
                {k.appearance.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header + Import / Export / Share Actions */}
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Preset Library & Templates</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Apply curated workflows directly to <span className="font-semibold text-[var(--text-primary)]">{activeProfile.name}</span>, or import/share JSON profiles.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Shareable Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportActiveJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Sub-navigation: Curated Templates vs My Presets */}
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            style={
              activeTab === 'templates'
                ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                : undefined
            }
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeTab === 'templates' ? 'font-semibold' : 'text-[var(--text-secondary)]'
            }`}
          >
            Curated Templates ({PRESET_TEMPLATES.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my_presets')}
            style={
              activeTab === 'my_presets'
                ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                : undefined
            }
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeTab === 'my_presets' ? 'font-semibold' : 'text-[var(--text-secondary)]'
            }`}
          >
            My Presets ({userPresets.length})
          </button>
        </div>

        {activeTab === 'templates' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter templates…"
                className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Templates Grid */}
      {activeTab === 'templates' && (
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl: PresetTemplate) => {
            const sample = tpl.buildProfile();
            return (
              <div
                key={tpl.id}
                className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] p-5 flex flex-col justify-between gap-4 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${tpl.accentColor}22`,
                          color: tpl.accentColor
                        }}
                      >
                        <KeycapIcon icon={tpl.icon} className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {tpl.name}
                        </h3>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {tpl.category} · Encoder: {sample.layers[0].encoder.modes[0]?.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {tpl.description}
                  </p>

                  {renderMiniGrid(sample)}
                </div>

                <button
                  type="button"
                  onClick={() => onApplyProfileLayout(sample)}
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-white hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap"
                >
                  Apply to this profile
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* My Presets View */}
      {activeTab === 'my_presets' && (
        <div className="max-w-6xl mx-auto space-y-6">
          <form
            onSubmit={e => {
              e.preventDefault();
              const label = customPresetName.trim() || `${activeProfile.name} Snapshot`;
              onSaveUserPreset(label);
              setCustomPresetName('');
            }}
            className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3"
          >
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                Save Current Layout to My Presets
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Captures all 4 layers, encoder modes, and RGB lighting from "{activeProfile.name}"
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="text"
                value={customPresetName}
                onChange={e => setCustomPresetName(e.target.value)}
                placeholder={`${activeProfile.name} Preset…`}
                className="flex-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                style={{ backgroundColor: 'var(--accent)' }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Preset</span>
              </button>
            </div>
          </form>

          {userPresets.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">No Custom Presets Yet</p>
              <p className="text-xs text-[var(--text-muted)]">
                Save your customized layouts above so you can reuse them across profiles anytime.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {userPresets.map(up => (
                <div
                  key={up.id}
                  className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {up.name}
                        </h3>
                        <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                          Saved {up.createdAt}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteUserPreset(up.id)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                        title="Delete preset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {renderMiniGrid(up.profile)}
                  </div>

                  <button
                    type="button"
                    onClick={() => onApplyProfileLayout(up.profile)}
                    style={{ backgroundColor: 'var(--accent)' }}
                    className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-white cursor-pointer"
                  >
                    Apply to this profile
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
