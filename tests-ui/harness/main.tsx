import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ensureUiMessages } from '../../src/i18n';
import { isUiLanguage } from '../../src/i18nConfig';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import '../../src/index.css';
import { ComponentHarness } from './ComponentHarness';
import { README_SURFACES, ReadmeHarness, type ReadmeSurface } from './ReadmeHarness';

async function renderHarness() {
  const requestedLocale = new URLSearchParams(window.location.search).get('locale');
  const language = isUiLanguage(requestedLocale) ? requestedLocale : 'en';
  await ensureUiMessages(language);
  useSettingsStore.setState({ language });
  document.documentElement.lang = language;
  document.documentElement.dataset.motion = 'reduced';

  const readmeSurface = new URLSearchParams(window.location.search).get('readme');
  const isReadmeSurface = README_SURFACES.includes(readmeSurface as ReadmeSurface);

  createRoot(document.getElementById('root')!).render(isReadmeSurface ? (
    <ReadmeHarness surface={readmeSurface as ReadmeSurface} />
  ) : (
    <BrowserRouter>
      <ComponentHarness language={language} />
    </BrowserRouter>
  ));
}

void renderHarness();
