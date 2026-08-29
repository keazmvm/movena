// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <nav aria-label="Mock sidebar">Mock sidebar</nav>,
}));
vi.mock('@/components/player/PlayerShell', () => ({
  PlayerShell: () => null,
}));
vi.mock('@/components/shared/ToastContainer', () => ({
  ToastContainer: () => null,
}));
vi.mock('@/components/common/ConnectionStatus', () => ({
  ConnectionStatus: () => null,
}));
vi.mock('@/components/common/ContextMenu', () => ({
  ContextMenu: () => null,
}));
vi.mock('@/components/onboarding/OnboardingFlow', () => ({
  OnboardingFlow: () => <div>Mock onboarding</div>,
}));
vi.mock('@/components/common/ShortcutHelperModal', () => ({
  ShortcutHelperModal: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Mock shortcuts</button>
  ),
}));
vi.mock('@/hooks/useContextMenu', () => ({
  useContextMenu: () => ({ handleAppBackdropContextMenu: vi.fn() }),
}));
vi.mock('@/hooks/useDownloadEvents', () => ({
  useDownloadEvents: vi.fn(),
}));
vi.mock('@/pages/Home', () => ({
  Home: () => <div>Mock home</div>,
}));
vi.mock('@/pages/Search', () => ({
  Search: () => <div>Mock search</div>,
}));

import App from '@/App';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useSourceStore } from '@/store/useSourceStore';

beforeEach(() => {
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    value: vi.fn(() => 1),
  });
  Object.defineProperty(window, 'cancelIdleCallback', {
    configurable: true,
    value: vi.fn(),
  });
  window.history.replaceState({}, '', '/');
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({ onboardingDismissed: true });
  useAuthStore.setState({
    isInitializing: false,
    initializationError: null,
    initialize: vi.fn().mockResolvedValue(undefined),
  });
  useSourceStore.setState({
    isInitializing: false,
    initializationError: null,
    initialize: vi.fn().mockResolvedValue(undefined),
    refreshStaleSources: vi.fn().mockResolvedValue(undefined),
  });
});

describe('application shell', () => {
  it('restores M3U and Xtream sources in parallel', async () => {
    let resolveSources!: () => void;
    let resolveAuth!: () => void;
    const initializeSources = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSources = resolve;
        }),
    );
    const initializeAuth = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAuth = resolve;
        }),
    );
    useSourceStore.setState({ initialize: initializeSources });
    useAuthStore.setState({ initialize: initializeAuth });

    render(<App />);

    await waitFor(() => {
      expect(initializeSources).toHaveBeenCalledOnce();
      expect(initializeAuth).toHaveBeenCalledOnce();
    });
    resolveSources();
    resolveAuth();
  });

  it('renders the workspace while saved sources are restored in the background', async () => {
    useSourceStore.setState({ isInitializing: true });

    render(<App />);

    expect(await screen.findByText('Mock home')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Mock sidebar' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('synchronizes theme changes to the document immediately', async () => {
    render(<App />);
    await screen.findByText('Mock home');

    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => useSettingsStore.getState().updateSetting('themePreference', 'light'));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });

  it('restores the main workspace and routes global keyboard shortcuts', async () => {
    render(<App />);

    expect(await screen.findByText('Mock home')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Mock sidebar' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByText('Mock search')).toBeTruthy();
  });

  it('toggles the shortcut helper without reacting inside editable controls', async () => {
    render(<App />);
    await screen.findByText('Mock home');

    fireEvent.keyDown(window, { key: '?' });
    expect(await screen.findByRole('button', { name: 'Mock shortcuts' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mock shortcuts' }));
    expect(screen.queryByRole('button', { name: 'Mock shortcuts' })).toBeNull();

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('button', { name: 'Mock shortcuts' })).toBeNull();
    input.remove();
  });
});
