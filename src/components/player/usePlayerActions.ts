import { useCallback, useEffect, useRef } from 'react';
import { tauriApi } from '../../api/ipc';
import { MOTION_DURATION } from '../../design/motion';
import { usePlayerStore, type PlayableStream } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { toggleWindowFullscreen } from './fullscreen';
import { notify } from '../../store/useNotificationStore';
import { getErrorMessage } from '../../utils/error';

export function usePlayerActions(
  activeStream: PlayableStream | null,
  saveCurrentProgress: () => void,
  interactionsDisabled = false,
) {
  const seekJumpSecs = useSettingsStore((state) => state.seekJumpSecs);
  const lastAudibleVolume = useSettingsStore((state) => state.lastAudibleVolume);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe((state, previousState) => {
      if (state.feedback && state.feedback !== previousState.feedback) {
        if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = window.setTimeout(
          () => usePlayerStore.getState().clearFeedback(),
          MOTION_DURATION.feedback * 1000
        );
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const state = usePlayerStore.getState();
      if (state.activePopover && !(event.target as HTMLElement).closest('[data-popover]')) {
        state.setActivePopover(null);
      }
    };
    window.addEventListener('click', handleOutsideClick, true);
    return () => window.removeEventListener('click', handleOutsideClick, true);
  }, []);

  const togglePlayPause = useCallback(async () => {
    try {
      await tauriApi.mpvPlayPause();
      const state = usePlayerStore.getState();
      state.triggerFeedback(state.isPlaying ? 'pause' : 'play');
    } catch (error) {
      notify.error('Playback Control Failed', getErrorMessage(error, 'mpv_play_pause failed without an error message.'), undefined, undefined, 'playback');
    }
  }, []);

  const toggleFullscreen = useCallback(() => void toggleWindowFullscreen(), []);

  const toggleMute = useCallback(async () => {
    const state = usePlayerStore.getState();
    const volume = state.volume === 0 ? lastAudibleVolume : 0;
    try {
      await tauriApi.mpvSetVolume(volume);
      state.triggerFeedback('volume', volume);
    } catch (error) {
      notify.error('Volume Failed', getErrorMessage(error, 'mpv_set_volume failed without an error message.'), undefined, undefined, 'playback');
    }
  }, [lastAudibleVolume]);

  const adjustVolume = useCallback(async (delta: number) => {
    const state = usePlayerStore.getState();
    const volume = Math.max(0, Math.min(100, state.volume + delta));
    try {
      await tauriApi.mpvSetVolume(volume);
      state.triggerFeedback('volume', volume);
    } catch (error) {
      notify.error('Volume Failed', getErrorMessage(error, 'mpv_set_volume failed without an error message.'), undefined, undefined, 'playback');
    }
  }, []);

  const seekRelative = useCallback(async (seconds: number) => {
    try {
      const state = usePlayerStore.getState();
      const target = Math.max(0, state.duration > 0 ? Math.min(state.duration, state.currentTime + seconds) : state.currentTime + seconds);
      usePlayerStore.setState({ currentTime: target, isBuffering: true });
      await tauriApi.mpvSeekRelative(seconds);
    } catch (error) {
      notify.error('Seek Failed', getErrorMessage(error, 'mpv_seek_relative failed without an error message.'), undefined, undefined, 'playback');
    }
  }, []);

  const handleClose = useCallback(() => {
    saveCurrentProgress();
    usePlayerStore.getState().closePlayer();
  }, [saveCurrentProgress]);

  useEffect(() => {
    if (!activeStream) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (interactionsDisabled) {
        if (event.key === 'Escape') {
          event.preventDefault();
          handleClose();
        }
        return;
      }
      const isLive = activeStream.type === 'live';
      const channelsDrawerOpen = usePlayerStore.getState().showChannelsDrawer;

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          event.preventDefault();
          void togglePlayPause();
          break;
        case 'f':
          event.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          event.preventDefault();
          void toggleMute();
          break;
        case 'arrowright':
          event.preventDefault();
          if (!isLive) void seekRelative(seekJumpSecs);
          break;
        case 'arrowleft':
          event.preventDefault();
          if (!isLive) void seekRelative(-seekJumpSecs);
          break;
        case 'arrowup':
          event.preventDefault();
          if (!isLive || !channelsDrawerOpen) void adjustVolume(5);
          break;
        case 'arrowdown':
          event.preventDefault();
          if (!isLive || !channelsDrawerOpen) void adjustVolume(-5);
          break;
        case 'escape': {
          event.preventDefault();
          const state = usePlayerStore.getState();
          if (state.activePopover) state.setActivePopover(null);
          else if (state.showEpisodesDrawer) state.setShowEpisodesDrawer(false);
          else if (state.showChannelsDrawer) state.setShowChannelsDrawer(false);
          else handleClose();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStream, adjustVolume, handleClose, interactionsDisabled, seekJumpSecs, seekRelative, toggleFullscreen, toggleMute, togglePlayPause]);

  const handleOverlayClick = useCallback(() => {
    if (interactionsDisabled) return;
    const state = usePlayerStore.getState();
    state.setShowControls(true);
    if (state.activePopover) {
      state.setActivePopover(null);
      return;
    }
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      toggleFullscreen();
    } else {
      clickTimeoutRef.current = window.setTimeout(() => {
        clickTimeoutRef.current = null;
        void togglePlayPause();
      }, 220);
    }
  }, [interactionsDisabled, toggleFullscreen, togglePlayPause]);

  return { handleClose, handleOverlayClick };
}
