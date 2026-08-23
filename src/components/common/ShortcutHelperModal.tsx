import { X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './ShortcutHelperModal.module.css';
import { getShortcutGroups } from '../../utils/shortcuts';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useI18n } from '../../i18n';

interface ShortcutHelperModalProps {
  onClose: () => void;
}

export function ShortcutHelperModal({ onClose }: ShortcutHelperModalProps) {
  const { t } = useI18n();
  const seekJumpSecs = useSettingsStore((state) => state.seekJumpSecs);
  const groups = getShortcutGroups(seekJumpSecs);
  const modalRef = useModalFocus<HTMLDivElement>({ onClose });

  return (
    <div className="uiModalOverlay" onClick={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modal} uiModalPanel`}
        role="dialog"
        aria-modal="true"
        aria-label={t('Keyboard Shortcuts')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Keyboard Shortcuts')}</h2>
          <IconButton size="sm" className={styles.closeBtn} onClick={onClose} aria-label="Close shortcuts">
            <X size={20} />
          </IconButton>
        </header>

        <div className={styles.content}>
          {groups.map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.groupTitle}>{t(group.title)}</h3>
              <div className={styles.shortcutGrid}>
                {group.items.map((item, idx) => (
                  <div key={idx} className={styles.shortcutRow}>
                    <div className={styles.keys}>
                      {item.keys.map((k, kIdx) => (
                        <kbd key={kIdx} className={styles.key}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span className={styles.description}>{t(item.desc)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
