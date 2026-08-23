import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AccountConnectionForm } from '../components/forms/AccountConnectionForm';
import { M3uSourceForm } from '../components/forms/M3uSourceForm';
import { FileText, Radio, X } from 'lucide-react';
import { PageTransition } from '../components/layout/PageTransition';
import { AboutSettingsSection } from '../components/settings/AboutSettingsSection';
import { AppearanceSettingsSection } from '../components/settings/AppearanceSettingsSection';
import { ComingUpSettingsSection } from '../components/settings/ComingUpSettingsSection';
import { DeveloperSettingsSection } from '../components/settings/DeveloperSettingsSection';
import { ConfigSettingsSection } from '../components/settings/ConfigSettingsSection';
import { GeneralSettingsSection } from '../components/settings/GeneralSettingsSection';
import { LibraryMetadataSettingsSection } from '../components/settings/LibraryMetadataSettingsSection';
import { NotificationSettingsSection } from '../components/settings/NotificationSettingsSection';
import { PictureSettingsSection } from '../components/settings/PictureSettingsSection';
import { PlaybackSettingsSection } from '../components/settings/PlaybackSettingsSection';
import { StorageSettingsSection } from '../components/settings/StorageSettingsSection';
import { SettingsNavigation } from '../components/settings/SettingsNavigation';
import { ShortcutSettingsSection } from '../components/settings/ShortcutSettingsSection';
import { SourcesSettingsSection } from '../components/settings/SourcesSettingsSection';
import { SubtitleAudioSettingsSection } from '../components/settings/SubtitleAudioSettingsSection';
import { IconButton } from '../components/common/Button';
import { useModalFocus } from '../hooks/useModalFocus';
import { MOTION_DURATION, MOTION_EASE } from '../design/motion';
import {
  resolveSettingsSectionId,
  type SettingsSectionId,
} from '../utils/settingsNavigation';
import styles from '../App.module.css';
import settingsStyles from './Settings.module.css';
import { useI18n } from '../i18n';

export function Settings() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sourceEditor, setSourceEditor] = useState<
    | { kind: 'choose' }
    | { kind: 'xtream'; sourceId?: string }
    | { kind: 'm3u'; sourceId?: string }
    | null
  >(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const activeSection = resolveSettingsSectionId(sectionParam);
  const closeSourceEditor = useCallback(() => setSourceEditor(null), []);
  const sourceEditorKey = sourceEditor
    ? `${sourceEditor.kind}-${'sourceId' in sourceEditor ? sourceEditor.sourceId ?? 'new' : 'choose'}`
    : 'closed';
  const sourceDialogRef = useModalFocus<HTMLDivElement>({
    enabled: sourceEditor !== null,
    onClose: closeSourceEditor,
    initialFocusSelector: sourceEditor?.kind === 'choose'
      ? '[data-modal-initial-focus]'
      : 'input:not([disabled])',
    focusKey: sourceEditorKey,
  });

  const selectSection = (section: SettingsSectionId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', section);
    setSearchParams(nextParams, { replace: true });
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'sources':
        return (
          <SourcesSettingsSection
            onAddSource={() => setSourceEditor({ kind: 'choose' })}
            onEditXtream={(sourceId) => setSourceEditor({ kind: 'xtream', sourceId })}
            onEditM3u={(sourceId) => setSourceEditor({ kind: 'm3u', sourceId })}
            onOpenM3uEditor={(sourceId) => navigate(sourceId ? `/m3u-editor/${sourceId}` : '/m3u-editor')}
          />
        );
      case 'general':
        return <GeneralSettingsSection />;
      case 'appearance':
        return <AppearanceSettingsSection />;
      case 'library-metadata':
        return <LibraryMetadataSettingsSection />;
      case 'coming-up':
        return <ComingUpSettingsSection />;
      case 'notifications':
        return <NotificationSettingsSection />;
      case 'storage':
        return <StorageSettingsSection />;
      case 'config':
        return <ConfigSettingsSection />;
      case 'shortcuts':
        return <ShortcutSettingsSection />;
      case 'playback':
        return <PlaybackSettingsSection />;
      case 'subtitles-audio':
        return <SubtitleAudioSettingsSection />;
      case 'picture':
        return <PictureSettingsSection />;
      case 'developer':
        return <DeveloperSettingsSection />;
      case 'about':
        return <AboutSettingsSection />;
    }
  };

  return (
    <>
      <PageTransition>
        <div className={`${styles.page} ${settingsStyles.settingsPage}`}>
          <SettingsNavigation activeSection={activeSection} onSelect={selectSection} />

          <div className={settingsStyles.rightColumn}>
            <div className={`${settingsStyles.scrollContainer} subtle-scrollbar`}>
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={activeSection}
                  className={settingsStyles.sectionTransition}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
                >
                  {renderSection()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </PageTransition>

      {createPortal(
        <AnimatePresence>
          {sourceEditor && (
            <motion.div
              className="uiModalOverlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeSourceEditor}
            >
              <motion.div
                ref={sourceDialogRef}
                className={`${settingsStyles.accountModal} uiModalPanel`}
                role="dialog"
                aria-modal="true"
                aria-label={sourceEditor.kind === 'choose'
                  ? t('Add media source')
                  : sourceEditor.sourceId
                    ? t(sourceEditor.kind === 'xtream' ? 'Edit Xtream source' : 'Edit M3U source')
                    : t(sourceEditor.kind === 'xtream' ? 'Add Xtream source' : 'Add M3U source')}
                tabIndex={-1}
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
                onClick={(event) => event.stopPropagation()}
              >
                {sourceEditor.kind === 'choose' ? (
                  <div className={settingsStyles.sourceChooser}>
                    <div className={settingsStyles.sourceChooserHeader}>
                      <div>
                        <h2>{t('What do you want to add?')}</h2>
                        <p>{t('Both types become equal sources in the same merged library.')}</p>
                      </div>
                      <IconButton size="sm" onClick={closeSourceEditor} aria-label="Close">
                        <X size={16} />
                      </IconButton>
                    </div>
                    <button type="button" className={settingsStyles.sourceChoice} data-modal-initial-focus onClick={() => setSourceEditor({ kind: 'xtream' })}>
                      <Radio size={20} />
                      <span><strong>{t('Xtream Account')}</strong><small>{t('Live TV, movies, series, and provider EPG')}</small></span>
                    </button>
                    <button type="button" className={settingsStyles.sourceChoice} onClick={() => setSourceEditor({ kind: 'm3u' })}>
                      <FileText size={20} />
                      <span><strong>{t('M3U Playlist')}</strong><small>{t('Remote URL or local file, with optional XMLTV')}</small></span>
                    </button>
                  </div>
                ) : sourceEditor.kind === 'xtream' ? (
                  <AccountConnectionForm
                    sourceId={sourceEditor.sourceId}
                    title={sourceEditor.sourceId ? 'Edit Xtream Source' : 'Add Xtream Source'}
                    submitLabel={sourceEditor.sourceId ? 'Save Changes' : 'Add Source'}
                    onSuccess={closeSourceEditor}
                    onCancel={closeSourceEditor}
                  />
                ) : (
                  <M3uSourceForm
                    sourceId={sourceEditor.sourceId}
                    onSuccess={closeSourceEditor}
                    onCancel={closeSourceEditor}
                  />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
