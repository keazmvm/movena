import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import styles from '../../App.module.css';

interface CatalogPageHeaderProps {
  title: string;
  meta?: ReactNode;
  titleActions?: ReactNode;
  actions?: ReactNode;
}

export function CatalogPageHeader({ title, meta, titleActions, actions }: CatalogPageHeaderProps) {
  const { t } = useI18n();
  return (
    <header className={styles.catalogHeader}>
      <div className={styles.catalogTitleGroup}>
        <div className={styles.catalogTitleRow}>
          <h1 className={styles.pageTitle}>{t(title)}</h1>
          {titleActions}
        </div>
        {meta != null && <div className={styles.catalogMeta}>{meta}</div>}
      </div>
      {actions != null && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}
