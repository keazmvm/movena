import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mpvCommand } = vi.hoisted(() => ({
  mpvCommand: vi.fn(),
}));

vi.mock('../src/api/ipc', () => ({
  tauriApi: { mpvCommand },
}));

import { applyImageAdjustment, applyImageAdjustments, DEFAULT_IMAGE_ADJUSTMENTS } from '../src/components/player/imageSettings';

beforeEach(() => {
  mpvCommand.mockResolvedValue(undefined);
});

describe('applyImageAdjustments', () => {
  it('sends every mpv equalizer property at neutral defaults', async () => {
    await applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS);

    expect(mpvCommand.mock.calls).toEqual([
      [['set', 'brightness', '0']],
      [['set', 'contrast', '0']],
      [['set', 'saturation', '0']],
      [['set', 'hue', '0']],
      [['set', 'gamma', '0']],
      [['set', 'scale-blur', '0.000']],
      [['set', 'cscale-blur', '0.000']],
    ]);
  });

  it('shifts the 0-200% brightness value back to mpv\'s -100..100 range', async () => {
    await applyImageAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, imageBrightness: 150 });
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'brightness', '50']);
  });

  it('maps full sharpness to the negative scale-blur ceiling', async () => {
    await applyImageAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, imageSharpness: 100 });
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'scale-blur', '-0.900']);
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'cscale-blur', '-0.900']);
  });

  it('clamps out-of-range values instead of forwarding them to mpv', async () => {
    await applyImageAdjustments({
      imageSharpness: 500,
      imageBrightness: -50,
      imageContrast: 999,
      imageSaturation: -999,
      imageHue: 0,
      imageGamma: 0,
    });

    expect(mpvCommand).toHaveBeenCalledWith(['set', 'brightness', '-100']);
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'contrast', '100']);
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'saturation', '-100']);
    expect(mpvCommand).toHaveBeenCalledWith(['set', 'scale-blur', '-0.900']);
  });

  it('continues applying independent properties after one rejection', async () => {
    mpvCommand.mockRejectedValueOnce(new Error('not running')).mockResolvedValue(undefined);
    await expect(applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS)).resolves.toBeUndefined();
    expect(mpvCommand).toHaveBeenCalledTimes(7);
  });

  it('preserves the native image command error for active-player callers', async () => {
    mpvCommand.mockRejectedValueOnce(new Error('mpv rejected brightness'));
    await expect(applyImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, true)).rejects.toThrow('mpv rejected brightness');
  });
});

describe('applyImageAdjustment', () => {
  it('touches only the changed property, leaving the scaler kernel untouched', async () => {
    await applyImageAdjustment('imageContrast', { ...DEFAULT_IMAGE_ADJUSTMENTS, imageContrast: 40 });

    // Regression guard: an earlier version resent the whole batch on every
    // slider tick, including `scale-blur`/`cscale-blur` — which makes
    // libplacebo recompile its scaler and visibly flashed the picture on
    // every drag step, even when dragging an unrelated slider like this one.
    expect(mpvCommand.mock.calls).toEqual([[['set', 'contrast', '40']]]);
  });

  it('only reaches the scaler kernel when sharpness itself changes', async () => {
    await applyImageAdjustment('imageSharpness', { ...DEFAULT_IMAGE_ADJUSTMENTS, imageSharpness: 50 });

    expect(mpvCommand.mock.calls).toEqual([
      [['set', 'scale-blur', '-0.450']],
      [['set', 'cscale-blur', '-0.450']],
    ]);
  });
});
