import type { LucideIcon } from 'lucide-react';
import { Button } from '../common/Button';
import { useI18n } from '../../i18n';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  detail,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <Icon size={32} className={styles.icon} />
      </div>

      <h2 className={styles.title}>{t(title)}</h2>
      <p className={styles.description}>{t(description)}</p>
      {detail && <p className={styles.detail}>{detail}</p>}

      {actionLabel && onAction && (
        <Button className={styles.actionBtn} onClick={onAction}>
          {t(actionLabel)}
        </Button>
      )}
    </div>
  );
}
