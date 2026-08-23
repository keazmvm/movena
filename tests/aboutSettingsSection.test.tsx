// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const clearAllAppDataMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/appDataReset', () => ({ clearAllAppData: clearAllAppDataMock }));

import { AboutSettingsSection } from '../src/components/settings/AboutSettingsSection';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useNotificationStore } from '../src/store/useNotificationStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  useNotificationStore.getState().clearAll();
  clearAllAppDataMock.mockReset().mockResolvedValue(undefined);
});

describe('all-data deletion settings control', () => {
  it('keeps the settings-only reset separate from deleting all app data', async () => {
    const user = userEvent.setup();
    useSettingsStore.getState().updateSetting('accentColor', '#af52de');
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Reset Settings' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset all settings?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset Settings' }));

    expect(useSettingsStore.getState().accentColor).toBe('#0672e5');
    expect(clearAllAppDataMock).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting all managed app data', async () => {
    const user = userEvent.setup();
    render(<AboutSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Delete All Data' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete all Movena data?' });
    expect(dialog).toBeTruthy();
    expect(clearAllAppDataMock).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/sources and credentials/i)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Delete All Data' }));

    expect(clearAllAppDataMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('renders metadata attribution links inside a padded aboutBody container', () => {
    render(<AboutSettingsSection />);
    const tmdbButton = screen.getByRole('button', { name: 'TMDB' });

    // Ensure link container has the aboutBody wrapper class applied for padding
    expect(tmdbButton.closest('[class*="aboutBody"]')).not.toBeNull();
  });

  it('groups destructive actions under a single unified Danger Zone section', () => {
    render(<AboutSettingsSection />);
    const dangerZoneHeading = screen.getByRole('heading', { name: 'Danger Zone', level: 2 });
    const dangerSection = dangerZoneHeading.closest('section');

    expect(dangerSection).not.toBeNull();
    expect(within(dangerSection!).getByRole('button', { name: 'Reset Settings' })).toBeTruthy();
    expect(within(dangerSection!).getByRole('button', { name: 'Delete All Data' })).toBeTruthy();
  });

  it('renders a Check for Updates button', () => {
    render(<AboutSettingsSection />);
    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeTruthy();
  });
});
