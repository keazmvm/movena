import type { RemixiconComponentType } from '../shared/icons';

export interface StateIconPair {
  line: RemixiconComponentType;
  fill: RemixiconComponentType;
}

interface StateIconProps {
  icons: StateIconPair;
  active: boolean;
  size?: number | string;
  className?: string;
}

/** Renders a purpose-designed line/fill pair without mutating SVG fill styles. */
export function StateIcon({ icons, active, size, className }: StateIconProps) {
  const Icon = active ? icons.fill : icons.line;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
