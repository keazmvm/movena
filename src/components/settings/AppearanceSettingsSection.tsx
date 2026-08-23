import {
  RiLayoutGridFill,
  RiLayoutGridLine,
  RiLayoutRowFill,
  RiLayoutRowLine,
} from '../shared/icons';
import { useSettingsStore } from '../../store/useSettingsStore';
import { DEFAULT_ACCENT_COLOR } from '../../utils/color';
import { AccentColorPicker } from '../shared/AccentColorPicker';
import { SegmentedControl } from '../common/SegmentedControl';
import {
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
export function AppearanceSettingsSection() {
  const settings = useSettingsStore();
  const accentColor = settings.accentColor || DEFAULT_ACCENT_COLOR;

  return (
    <SettingsPageContent>
      <SettingsGroup title="Theme & Catalogue" description="Personalize visual styling and default catalogue presentation.">
        <SettingsRow
          title="Accent Color"
          description="Highlight color used for selected items, active controls, and focus states."
        >
          <AccentColorPicker
            value={accentColor}
            onChange={(value) => settings.updateSetting('accentColor', value)}
          />
        </SettingsRow>

        <SettingsRow
          title="Default Catalogue View"
          description="Layout used when opening movies, series, and live channels."
        >
          <SegmentedControl<'grid' | 'list'>
            value={settings.viewMode}
            onChange={(value) => settings.updateSetting('viewMode', value)}
            options={[
              { value: 'grid', label: 'Grid', icon: RiLayoutGridLine, activeIcon: RiLayoutGridFill },
              { value: 'list', label: 'List', icon: RiLayoutRowLine, activeIcon: RiLayoutRowFill },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

    </SettingsPageContent>
  );
}
