import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { notify } from '../../store/useNotificationStore';
import styles from './ConnectionStatus.module.css';
import { useI18n, translateNow } from '../../i18n';

export function ConnectionStatus() {
  const { t } = useI18n();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      notify.success(translateNow('Connection Restored'), translateNow('Movena is reconnecting to your sources.'), 3500, undefined, 'connection');
    };
    const handleOffline = () => {
      setIsOnline(false);
      notify.warning(translateNow('Connection Lost'), translateNow('Movena will reconnect automatically when your connection returns.'), 6000, undefined, 'connection');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className={styles.banner} role="status" aria-live="assertive">
      <span className={styles.iconBadge}><WifiOff size={16} /></span>
      <span className={styles.copy}>
        <strong>{t('You’re offline')}</strong>
        <span>{t('Movena will resume requests when the connection returns.')}</span>
      </span>
    </div>
  );
}
