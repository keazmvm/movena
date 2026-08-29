import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ensureUiMessages } from './i18n.ts';
import { useSettingsStore } from './store/useSettingsStore.ts';
import { initializeTmdbApiKey } from './services/tmdbCredentialVault.ts';
import { applyAppearanceTheme } from './design/appearance.ts';

const initialSettings = useSettingsStore.getState();
applyAppearanceTheme(initialSettings.themePreference, initialSettings.accentColor);
const root = createRoot(document.getElementById('root')!);

async function renderApp() {
  // Loaded only by the feature-gated desktop E2E build. Production bundles do
  // not include the WebDriver bridge or expose its invoke interception.
  if (import.meta.env.MODE === 'desktop-e2e') {
    await import('@wdio/tauri-plugin');
  }
  await initializeTmdbApiKey().catch((error) => {
    console.warn('Could not initialize the TMDB credential vault', error);
  });
  const language = useSettingsStore.getState().language;
  await ensureUiMessages(language).catch((error) => {
    console.warn(`Could not preload the ${language} interface catalog`, error);
  });
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void renderApp();
