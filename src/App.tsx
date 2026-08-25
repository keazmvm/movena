import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query';
import { desktopApi } from './api/desktop';
import { Sidebar } from './components/layout/Sidebar';
import { WindowChrome } from './components/layout/WindowChrome';
import { PageTransition } from './components/layout/PageTransition';
import { useSettingsStore } from './store/useSettingsStore';
import { useUpdateStore } from './store/useUpdateStore';
import { usePlayerStore } from './store/usePlayerStore';
import { useAuthStore } from './store/useAuthStore';
import { useSourceStore } from './store/useSourceStore';
import { ToastContainer } from './components/shared/ToastContainer';
const PlayerShell = lazy(() => import('./components/player/PlayerShell').then((module) => ({ default: module.PlayerShell })));
const DebugOverlay = lazy(() => import('./components/shared/DebugOverlay').then((module) => ({ default: module.DebugOverlay })));
import { ContextMenu } from './components/common/ContextMenu';
import { useContextMenu } from './hooks/useContextMenu';
import styles from './components/layout/AppLayout.module.css';
import { applyAppearanceTheme } from './design/appearance';
import { getCombinedErrorMessage, getErrorPresentation, getUserFacingErrorMessage } from './utils/error';
import { queryClient } from './api/queryClient';
import { ErrorState } from './components/common/ErrorState';
import { ConnectionStatus } from './components/common/ConnectionStatus';
import { EmptyState } from './components/shared/EmptyState';
import { Compass } from 'lucide-react';
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow').then((module) => ({ default: module.OnboardingFlow })));
import { useEnabledSources } from './hooks/useEnabledSources';
const ShortcutHelperModal = lazy(() => import('./components/common/ShortcutHelperModal').then((module) => ({ default: module.ShortcutHelperModal })));
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useDownloadEvents } from './hooks/useDownloadEvents';
import { useI18n } from './i18n';
import { notify } from './store/useNotificationStore';
import { uiLanguageDefinition } from './i18nConfig';
import {
  Collections,
  ContinueWatching,
  Downloads,
  Epg,
  Favorites,
  Home,
  LiveTV,
  M3uEditorPage,
  Movies,
  Search,
  Series,
  Settings,
  Upcoming,
} from './routes/routeModules';



function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className={styles.page}>
        <EmptyState
          icon={Compass}
          title="Page Not Found"
          description="That page is not part of this Movena workspace. Return to Discover to keep browsing."
          actionLabel="Back to Discover"
          onAction={() => void navigate('/')}
        />
      </div>
    </PageTransition>
  );
}

function AnimatedRoutes() {
  const { t } = useI18n();
  
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className={styles.routeLoading} role="status" aria-label={t('Loading page')}><span /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/live" element={<LiveTV />} />
            <Route path="/epg" element={<Epg />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/series" element={<Series />} />
            <Route path="/search" element={<Search />} />
            <Route path="/continue" element={<ContinueWatching />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/upcoming" element={<Upcoming />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/m3u-editor/:sourceId?" element={<M3uEditorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function AppShell() {
  useDownloadEvents();
  const navigate = useNavigate();
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const language = useSettingsStore((state) => state.language);
  const debugMode = useSettingsStore((state) => state.debugMode);
  const showDebugOverlay = useSettingsStore((state) => state.showDebugOverlay);
  const activeStream = usePlayerStore((state) => state.activeStream);
  const { handleAppBackdropContextMenu } = useContextMenu();
  const isAuthInitializing = useAuthStore((state) => state.isInitializing);
  const initializationError = useAuthStore((state) => state.initializationError);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeSources = useSourceStore((state) => state.initialize);
  const refreshStaleSources = useSourceStore((state) => state.refreshStaleSources);
  const isSourceInitializing = useSourceStore((state) => state.isInitializing);
  const sourceInitializationError = useSourceStore((state) => state.initializationError);
  const onboardingDismissed = useSettingsStore((state) => state.onboardingDismissed);
  const enabledSources = useEnabledSources();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isRetryingStartup, setIsRetryingStartup] = useState(false);

  const [showShortcutHelper, setShowShortcutHelper] = useState(false);

  // Global Keyboard Navigation Shortcuts (Ctrl+1..5, Ctrl+K, Ctrl+\, ?)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setShowShortcutHelper((prev) => !prev);
        return;
      }

      const isCmdOrCtrl = event.ctrlKey || event.metaKey;
      if (!isCmdOrCtrl) return;

      if (event.key === '\\') {
        event.preventDefault();
        const settings = useSettingsStore.getState();
        settings.updateSetting('sidebarCollapsed', !settings.sidebarCollapsed);
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/search');
      } else if (['1', '2', '3', '4', '5'].includes(event.key)) {
        event.preventDefault();
        const paths = ['/', '/live', '/epg', '/movies', '/series'];
        const index = parseInt(event.key, 10) - 1;
        const path = paths[index];
        if (path) navigate(path);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);
  // Decided once, right as startup settles, from whether a source is usable
  // at that moment — not re-derived on every render. `enabledSources`
  // legitimately flips to available the instant setup's own first step
  // connects one, and a live condition would pull the flow out from under
  // whichever step the user is on rather than letting it finish and hand
  // back control itself via `onDone`.
  const onboardingChecked = useRef(false);
  const startupError = getCombinedErrorMessage([sourceInitializationError, initializationError], '');

  const retryStartup = async () => {
    setIsRetryingStartup(true);
    try {
      await Promise.all([initializeSources(), initializeAuth()]);
      await refreshStaleSources();
    } finally {
      setIsRetryingStartup(false);
    }
  };

  useEffect(() => {
    // A startup error means the check below can't trust `isAvailable` yet —
    // the source may well exist and just be waiting on the retry the error
    // screen offers. Not latching the ref here lets this run again once the
    // error actually clears, instead of freezing in a decision made from a
    // source that hadn't finished loading.
    if (onboardingChecked.current || isAuthInitializing || isSourceInitializing || startupError) return;
    onboardingChecked.current = true;
    if (!onboardingDismissed && !enabledSources.isAvailable) {
      setShowOnboarding(true);
    }
  }, [isAuthInitializing, isSourceInitializing, startupError, onboardingDismissed, enabledSources.isAvailable]);

  useEffect(() => {
    Promise.all([initializeSources(), initializeAuth()])
      .then(() => refreshStaleSources())
      .catch(() => {});
  }, [initializeAuth, initializeSources, refreshStaleSources]);

  useEffect(() => {
    void import('./services/m3uEditorStorage')
      .then(({ deleteLegacyM3uEditorDatabase }) => deleteLegacyM3uEditorDatabase())
      .catch(() => undefined);
  }, []);

  const autoCheckUpdates = useSettingsStore((state) => state.autoCheckUpdates);

  useEffect(() => {
    if (!autoCheckUpdates) return;
    const timer = window.setTimeout(() => {
      void useUpdateStore.getState().check();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [autoCheckUpdates]);

  // Announce whatever check() lands on — the background timer above or a
  // manual "Check for Updates" click in Settings > About both flow through
  // the same store, so this fires exactly once per newly-found version.
  // Installing never happens from here: only the About panel's explicit
  // "Download & Install" button starts a download.
  const updatePhase = useUpdateStore((state) => state.phase);
  const updateInfo = useUpdateStore((state) => state.info);
  const dismissedUpdateVersion = useSettingsStore((state) => state.dismissedUpdateVersion);
  const announcedUpdateVersion = useRef<string | null>(null);
  useEffect(() => {
    if (updatePhase !== 'available' || !updateInfo) return;
    if (updateInfo.version === dismissedUpdateVersion) return;
    if (announcedUpdateVersion.current === updateInfo.version) return;
    announcedUpdateVersion.current = updateInfo.version;
    notify.info(
      'Update Available',
      `Movena v${updateInfo.version} is now available.`,
      8000,
      {
        label: 'View',
        onClick: () => navigate('/settings?section=about'),
      },
    );
  }, [updatePhase, updateInfo, dismissedUpdateVersion, navigate]);

  useEffect(() => {
    document.documentElement.dataset.motion = motionPreference;
  }, [motionPreference]);

  useEffect(() => {
    const definition = uiLanguageDefinition(language);
    document.documentElement.lang = definition.locale;
    document.documentElement.dir = definition.direction;
  }, [language]);

  // Keep theme and its derived accent tokens on one synchronous DOM contract.
  useEffect(() => {
    applyAppearanceTheme(themePreference, accentColor);
  }, [themePreference, accentColor]);

  // Sync always on top with Tauri
  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    desktopApi.setAlwaysOnTop(alwaysOnTop).catch((error) => {
      notify.error(
        'Window Setting Failed',
        getUserFacingErrorMessage(error, 'The always-on-top window setting could not be changed.'),
      );
    });
  }, [alwaysOnTop]);

  if (startupError) {
    const presentation = getErrorPresentation(startupError, 'Saved source');
    return (
      <div className={styles.startupError}>
        <ErrorState
          title={presentation.title}
          description={presentation.description}
          detail={presentation.detail}
          actionLabel="Try Again"
          onAction={() => void retryStartup()}
          isRetrying={isRetryingStartup}
        />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <MotionConfig
        reducedMotion={motionPreference === 'reduced' ? 'always' : motionPreference === 'full' ? 'never' : 'user'}
      >
        <div className={styles.appContainer} onContextMenu={handleAppBackdropContextMenu}>
          <div className={styles.windowDragArea} data-tauri-drag-region aria-hidden="true" />
          <Suspense fallback={null}>
            <OnboardingFlow onDone={() => setShowOnboarding(false)} />
          </Suspense>
          <WindowChrome />
          <ConnectionStatus />
          <ToastContainer />
          <ContextMenu />
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig
      reducedMotion={motionPreference === 'reduced' ? 'always' : motionPreference === 'full' ? 'never' : 'user'}
    >
      <div
        className={styles.appContainer}
        onContextMenu={handleAppBackdropContextMenu}
      >
        <div className={styles.windowDragArea} data-tauri-drag-region aria-hidden="true" />
        <div className={`${styles.appUi} ${activeStream ? styles.appUiHidden : ''}`}>
          <Sidebar />
          <main className={styles.mainContent}>
            <div className={styles.pageContainer}>
              <AnimatedRoutes />
            </div>
          </main>
        </div>

        <WindowChrome />
        {activeStream && (
          <Suspense fallback={null}>
            <PlayerShell />
          </Suspense>
        )}
        <ConnectionStatus />
        <ToastContainer />
        {debugMode && showDebugOverlay && (
          <Suspense fallback={null}>
            <DebugOverlay />
          </Suspense>
        )}
        <ContextMenu />
        {showShortcutHelper && (
          <Suspense fallback={null}>
            <ShortcutHelperModal onClose={() => setShowShortcutHelper(false)} />
          </Suspense>
        )}
      </div>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </BrowserRouter>
  );
}
