import { isTauri } from '@tauri-apps/api/core';
import { tauriApi } from '../api/ipc';

let browserSessionPassword: string | null = null;

export async function storeProviderPassword(password: string): Promise<void> {
  if (isTauri()) {
    await tauriApi.credentialStore(password);
    return;
  }
  // Browser preview and unit tests never persist a password across reloads.
  browserSessionPassword = password;
}

export async function loadProviderPassword(): Promise<string | null> {
  return isTauri() ? tauriApi.credentialLoad() : browserSessionPassword;
}

export async function deleteProviderPassword(): Promise<void> {
  if (isTauri()) {
    await tauriApi.credentialDelete();
  }
  browserSessionPassword = null;
}

