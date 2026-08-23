import {
  RiLayoutGridFill,
  RiLayoutGridLine,
  RiLayoutRowFill,
  RiLayoutRowLine,
} from '../shared/icons';
import { useSettingsStore } from '../../store/useSettingsStore';
import { SegmentedControl } from '../common/SegmentedControl';

export function CatalogViewToggle() {
  const viewMode = useSettingsStore((state) => state.viewMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <SegmentedControl
      ariaLabel="Catalog layout"
      value={viewMode}
      onChange={(val) => updateSetting('viewMode', val as 'grid' | 'list')}
      options={[
        { value: 'grid', label: 'Grid', icon: RiLayoutGridLine, activeIcon: RiLayoutGridFill },
        { value: 'list', label: 'List', icon: RiLayoutRowLine, activeIcon: RiLayoutRowFill },
      ]}
    />
  );
}
