import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { RefreshCw, Bug, ExternalLink } from 'lucide-react';
import { notify } from '../../store/useNotificationStore';
import { clearAllAppData } from '../../services/appDataReset';
import { checkForAppUpdates } from '../../services/appUpdater';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  SettingsButton,
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
import styles from '../../pages/Settings.module.css';
import { useI18n } from '../../i18n';
import { deleteTmdbApiKey } from '../../services/tmdbCredentialVault';
import { getErrorMessage } from '../../utils/error';

export function AboutSettingsSection() {
  const { t } = useI18n();
  const settings = useSettingsStore();
  const [confirmAction, setConfirmAction] = useState<'settings' | 'all-data' | null>(null);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const result = await checkForAppUpdates();
      settings.updateSetting('lastUpdateCheckTime', Date.now());
      if (result.available && result.updateInfo) {
        notify.info(
          'Update Available',
          `Version ${result.updateInfo.version} is available.`,
        );
        if (result.installUpdate) {
          try {
            await result.installUpdate();
          } catch (installErr) {
            notify.error('Update Failed', getErrorMessage(installErr, 'Failed to install update.'));
          }
        }
      } else if (result.error) {
        notify.warning('Update Check', result.error);
      } else {
        notify.info('Up to Date', `Movena ${appVersion ? `v${appVersion}` : ''} is the latest version.`);
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      await deleteTmdbApiKey();
      settings.resetSettings();
      setConfirmAction(null);
      notify.warning('Settings Reset', 'Application settings were restored to their defaults.');
    } catch (error: unknown) {
      notify.error('Settings Could Not Be Reset', getErrorMessage(error, 'Credential deletion failed without an error message.'));
    }
  };

  const handleDeleteAllData = async () => {
    setIsClearingData(true);
    try {
      await clearAllAppData();
      setConfirmAction(null);
      notify.warning('All Data Deleted', 'All Movena settings, sources, history, downloads, and caches were removed. Restart the app to begin setup again.');
    } catch (error: unknown) {
      notify.error('Could Not Delete Data', getErrorMessage(error, 'Application data deletion failed without an error message.'));
    } finally {
      setIsClearingData(false);
    }
  };

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Movena Desktop"
        description={`Version ${appVersion ?? '…'} · Tauri 2 · Rust · React · libmpv`}
      >
        <div className={styles.aboutBody}>
          <p className={styles.aboutTagline}>{t('A native desktop client for Xtream and M3U live TV, movies, and series.')}</p>
          <div className={styles.aboutLinks}>
            <SettingsButton onClick={handleCheckUpdates} disabled={isCheckingUpdate}>
              <RefreshCw size={15} className={isCheckingUpdate ? 'animate-spin' : undefined} /> {t('Check for Updates')}
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://github.com/movena-app/movena')}>
              <ExternalLink size={15} /> {t('View on GitHub')}
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://github.com/movena-app/movena/issues/new')}>
              <Bug size={15} /> {t('Report an Issue')}
            </SettingsButton>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Metadata & schedule sources"
        description="This product uses the TMDB API but is not endorsed or certified by TMDB. Release dates, artwork, and ratings are provided by TMDB. TVmaze data is licensed under CC BY-SA 4.0 and provides exact TV air times."
      >
        <div className={styles.aboutBody}>
          <img className={styles.tmdbLogo} src="/tmdb-logo.svg" alt="TMDB" />
          <div className={styles.aboutLinks}>
            <SettingsButton onClick={() => openUrl('https://www.themoviedb.org')}>
              <ExternalLink size={15} /> TMDB
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://www.tvmaze.com')}>
              <ExternalLink size={15} /> TVmaze
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://creativecommons.org/licenses/by-sa/4.0/')}>
              <ExternalLink size={15} /> CC BY-SA 4.0
            </SettingsButton>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Open source & lawful use"
        description="Movena is free software licensed under GPL-3.0-or-later. It provides no channels, subscriptions, playlists, or media and is not affiliated with or endorsed by Xtream Codes or any content provider."
      >
        <div className={styles.aboutBody}>
          <p className={styles.aboutTagline}>Configure only sources you are authorized to access. Record or download media only when you have the necessary rights. Movena does not bypass DRM.</p>
          <div className={styles.aboutLinks}>
            <SettingsButton onClick={() => openUrl('https://github.com/movena-app/movena/blob/main/LICENSE')}>
              <ExternalLink size={15} /> GPL-3.0-or-later
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://github.com/movena-app/movena/blob/main/docs/PRIVACY.md')}>
              <ExternalLink size={15} /> Privacy
            </SettingsButton>
            <SettingsButton onClick={() => openUrl('https://github.com/movena-app/movena/blob/main/docs/THIRD_PARTY_NOTICES.md')}>
              <ExternalLink size={15} /> Third-party notices
            </SettingsButton>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Danger Zone"
        description="Irreversible and disruptive actions for application settings and local data."
        danger
      >
        <SettingsRow
          title="Reset Settings"
          description="Restore playback, appearance, notification, and developer preferences. Source connections, favorites, collections, and watch history are kept."
        >
          <SettingsButton variant="danger" onClick={() => setConfirmAction('settings')}>Reset Settings</SettingsButton>
        </SettingsRow>

        <SettingsRow
          title="Delete All App Data"
          description="Removes settings, sources and credentials, library data, searches, download records, and cached content."
        >
          <SettingsButton variant="danger" onClick={() => setConfirmAction('all-data')}>Delete All Data</SettingsButton>
        </SettingsRow>
      </SettingsGroup>

      {confirmAction === 'settings' && (
        <ConfirmDialog
          title="Reset all settings?"
          description="Playback, appearance, notification, recording, and developer preferences will return to their defaults. Your source connections and library data will remain."
          confirmLabel="Reset Settings"
          danger
          onConfirm={handleResetSettings}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'all-data' && (
        <ConfirmDialog
          title="Delete all Movena data?"
          description="This permanently removes settings, sources and credentials, history, favorites, collections, searches, download records, and cached content. Original playlist files and completed downloads are not removed."
          confirmLabel="Delete All Data"
          danger
          onConfirm={handleDeleteAllData}
          onCancel={() => setConfirmAction(null)}
          isConfirming={isClearingData}
        />
      )}
    </SettingsPageContent>
  );
}
