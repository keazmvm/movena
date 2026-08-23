import { useDebugStore } from '../../store/useDebugStore';
import { notify } from '../../store/useNotificationStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { SegmentedControl } from '../common/SegmentedControl';
import {
  SettingsButton,
  SettingsGroup,
  SettingsInput,
  SettingsPageContent,
  SettingsRow,
  SettingsToggle,
} from './SettingsControls';

export function DeveloperSettingsSection() {
  const settings = useSettingsStore();
  const { clearLogs, clearNetworkLogs } = useDebugStore();

  return (
    <SettingsPageContent>
      <SettingsGroup title="Diagnostics" description="Developer tools remain inactive until Developer Mode is enabled.">
        <SettingsRow title="Developer Mode" description="Enable diagnostic logs and runtime-state inspection.">
          <SettingsToggle
            label="Enable Developer Mode"
            checked={settings.debugMode}
            onChange={(checked) => {
              settings.updateSetting('debugMode', checked);
              if (checked) notify.info('Developer Mode Enabled', 'Developer diagnostics are now available.');
            }}
          />
        </SettingsRow>

        {([ 
          ['showDebugOverlay', 'Floating Debug Overlay', 'Show logs, network history, and runtime state'],
          ['logApiRequests', 'Log Network Requests', 'Record provider calls and latency in diagnostic history'],
          ['simulateNetworkDelay', 'Simulate Network Delay', 'Add an artificial delay to exercise loading states'],
        ] as const).map(([key, title, description]) => (
          <SettingsRow key={key} title={title} description={`${description}.`} disabled={!settings.debugMode}>
            <SettingsToggle
              label={title}
              checked={settings[key]}
              onChange={(checked) => settings.updateSetting(key, checked)}
              disabled={!settings.debugMode}
            />
          </SettingsRow>
        ))}

        {settings.simulateNetworkDelay && (
          <SettingsRow title="Network Delay (ms)" description="Artificial latency duration." disabled={!settings.debugMode}>
            <SettingsInput
              type="number"
              min={0}
              max={10000}
              step={100}
              value={settings.simulateNetworkDelayMs}
              onChange={(event) => settings.updateSetting('simulateNetworkDelayMs', Math.max(0, Math.min(10000, parseInt(event.target.value) || 0)))}
              disabled={!settings.debugMode}
              style={{ width: '100px', textAlign: 'right' }}
            />
          </SettingsRow>
        )}

        <SettingsRow title="Simulated Failure Rate (%)" description="Randomly fail provider requests to test error handling." disabled={!settings.debugMode}>
          <SettingsInput
            type="number"
            min={0}
            max={100}
            step={5}
            value={settings.simulateNetworkErrorRate}
            onChange={(event) => settings.updateSetting('simulateNetworkErrorRate', Math.max(0, Math.min(100, parseInt(event.target.value) || 0)))}
            disabled={!settings.debugMode}
            style={{ width: '100px', textAlign: 'right' }}
          />
        </SettingsRow>

        <SettingsRow title="Log Filter Level" description="Minimum severity stored in diagnostic history." disabled={!settings.debugMode}>
          <SegmentedControl
            value={settings.debugLogLevel}
            onChange={(value) => settings.updateSetting('debugLogLevel', value)}
            disabled={!settings.debugMode}
            options={[
              { value: 'verbose', label: 'Verbose' },
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warning' },
              { value: 'error', label: 'Error' },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Diagnostic Data" description="Local diagnostic history can be cleared without changing preferences.">
        <SettingsRow title="Clear Debug Logs" description="Remove recorded application logs and network history.">
          <SettingsButton
            disabled={!settings.debugMode}
            onClick={() => {
              clearLogs();
              clearNetworkLogs();
              notify.info('Logs Cleared', 'Developer log history has been emptied.');
            }}
          >
            Clear Log History
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>

    </SettingsPageContent>
  );
}
