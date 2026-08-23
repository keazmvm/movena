import type { ComponentType } from 'react';
import { useI18n } from '../../i18n';
import styles from './SegmentedControl.module.css';

type SegmentedIcon = ComponentType<{
  size?: number | string;
  className?: string;
}>;

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: SegmentedIcon;
  /** Optional purpose-designed selected-state counterpart to `icon`. */
  activeIcon?: SegmentedIcon;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  ariaLabel,
}: SegmentedControlProps<T>) {
  const { t } = useI18n();
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || options.length === 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const current = options.findIndex((option) => option.value === value);
    const next = (current + direction + options.length) % options.length;
    onChange(options[next].value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  return (
    <div
      className={`${styles.container} ${styles[size]} ${disabled ? styles.disabled : ''} ${className}`}
      role="radiogroup"
      aria-label={ariaLabel ? t(ariaLabel) : undefined}
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const Icon = isActive && opt.activeIcon ? opt.activeIcon : opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            className={`${styles.segment} ${isActive ? styles.active : ''}`}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
          >
            {Icon && (
              <Icon size={size === 'sm' ? 13 : 14} className={styles.icon} />
            )}
            <span className={styles.label}>{t(opt.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
