import { useId } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useModalFocus } from '../../hooks/useModalFocus';
import styles from './ConfirmDialog.module.css';
import { useI18n } from '../../i18n';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean | undefined;
  isConfirming?: boolean | undefined;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  isConfirming = false,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: () => {
      if (!isConfirming) onCancel();
    },
    initialFocusSelector: '[data-modal-initial-focus]',
  });

  return createPortal(
    <div className="uiModalOverlay" onMouseDown={isConfirming ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className={`${styles.dialog} uiModalPanel`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={styles.title}>{t(title)}</h2>
        <p id={descriptionId} className={styles.description}>{t(description)}</p>
        <div className={styles.actions}>
          <Button className={styles.cancelButton} onClick={onCancel} data-modal-initial-focus disabled={isConfirming}>
            {t('Cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? t('Deleting…') : t(confirmLabel)}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
