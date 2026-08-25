import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  desktop: false,
  credentialStore: vi.fn(),
  credentialLoad: vi.fn(),
  credentialDelete: vi.fn(),
}));

vi.mock('../src/api/desktop', () => ({ desktopApi: { isDesktop: () => mocks.desktop } }));
vi.mock('../src/api/ipc', () => ({
  tauriApi: {
    credentialStore: mocks.credentialStore,
    credentialLoad: mocks.credentialLoad,
    credentialDelete: mocks.credentialDelete,
  },
}));

import { deleteProviderPassword, loadProviderPassword, storeProviderPassword } from '../src/services/credentialVault';

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.desktop = false;
  await deleteProviderPassword();
});

describe('credential vault boundary', () => {
  it('keeps browser preview credentials in session memory only', async () => {
    await storeProviderPassword('browser-secret');
    await expect(loadProviderPassword()).resolves.toBe('browser-secret');
    await deleteProviderPassword();
    await expect(loadProviderPassword()).resolves.toBeNull();
    expect(mocks.credentialStore).not.toHaveBeenCalled();
  });

  it('delegates desktop credentials to the native vault and clears local session state', async () => {
    mocks.desktop = true;
    mocks.credentialLoad.mockResolvedValue('native-secret');
    await storeProviderPassword('native-secret');
    await expect(loadProviderPassword()).resolves.toBe('native-secret');
    await deleteProviderPassword();
    expect(mocks.credentialStore).toHaveBeenCalledWith('native-secret');
    expect(mocks.credentialDelete).toHaveBeenCalledOnce();
  });
});
