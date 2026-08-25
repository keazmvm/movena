import { desktopApi } from '../../api/desktop';
import { Minus, Square, X } from 'lucide-react';
import { IconButton } from '../common/Button';
import { usePlayerStore } from '../../store/usePlayerStore';
import { isMacOS } from '../../utils/platform';
import styles from './WindowChrome.module.css';
import { useI18n } from '../../i18n';

function runWindowAction(action: () => Promise<void>) {
  if (desktopApi.isDesktop()) void action();
}

/** Native-Windows-style minimize/maximize/close buttons, right-aligned. */
function WindowsWindowChrome() {
  return (
    <div className={styles.windowChrome}>
      <IconButton
        size="sm"
        className={styles.windowControl}
        onClick={() => runWindowAction(desktopApi.minimizeWindow)}
        aria-label="Minimize window"
      >
        <Minus size={15} />
      </IconButton>
      <IconButton
        size="sm"
        className={styles.windowControl}
        onClick={() => runWindowAction(desktopApi.toggleMaximizeWindow)}
        aria-label="Maximize or restore window"
      >
        <Square size={13} />
      </IconButton>
      <IconButton
        size="sm"
        className={`${styles.windowControl} ${styles.windowClose}`}
        onClick={() => runWindowAction(desktopApi.closeWindow)}
        aria-label="Close window"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}

/** Native-macOS-style traffic-light buttons (close/minimize/zoom), left-aligned. */
function MacWindowChrome() {
  const { t } = useI18n();
  return (
    <div className={styles.windowChromeMac}>
      <button
        type="button"
        className={`${styles.trafficLight} ${styles.trafficLightClose}`}
        onClick={() => runWindowAction(desktopApi.closeWindow)}
        aria-label={t('Close window')}
      >
        <span className={styles.trafficLightIcon}>
          <X size={8} strokeWidth={3} />
        </span>
      </button>
      <button
        type="button"
        className={`${styles.trafficLight} ${styles.trafficLightMinimize}`}
        onClick={() => runWindowAction(desktopApi.minimizeWindow)}
        aria-label={t('Minimize window')}
      >
        <span className={styles.trafficLightIcon}>
          <Minus size={8} strokeWidth={3} />
        </span>
      </button>
      <button
        type="button"
        className={`${styles.trafficLight} ${styles.trafficLightMaximize}`}
        onClick={() => runWindowAction(desktopApi.toggleMaximizeWindow)}
        aria-label={t('Maximize window')}
      >
        <span className={styles.trafficLightIcon}>
          <Square size={6} strokeWidth={3} />
        </span>
      </button>
    </div>
  );
}

export function WindowChrome() {
  const isFullscreen = usePlayerStore((state) => state.isFullscreen);

  if (isFullscreen) return null;

  return isMacOS() ? <MacWindowChrome /> : <WindowsWindowChrome />;
}
