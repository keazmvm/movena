import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Twitch resolver packaging contract', () => {
  it('pins the hashed Streamlink runtime and fixes the safe resolver arguments', () => {
    const lock = source('scripts/twitch-resolver/requirements.lock');
    const wrapper = source('scripts/twitch-resolver/main.py');
    const builder = source('scripts/build-twitch-resolver.mjs');

    expect(lock).toContain('streamlink==8.5.0');
    expect(builder).toContain("expectedPythonVersion = '3.13.11'");
    expect(lock).toMatch(/streamlink==8\.5\.0[\s\S]*--hash=sha256:/);
    for (const argument of [
      '--no-config',
      '--no-plugin-sideloading',
      '--webbrowser-headless=yes',
      '--player-external-http',
      '--player-external-http-interface=127.0.0.1',
      '--player-external-http-port=0',
      '--player-external-http-continuous=no',
      '--twitch-supported-codecs=h264',
    ]) {
      expect(wrapper).toContain(`"${argument}"`);
    }
    expect(wrapper).not.toContain('--player-passthrough');
    expect(wrapper).not.toContain('--twitch-low-latency');
    expect(builder.indexOf('generate-third-party-licenses.mjs'))
      .toBeLessThan(builder.indexOf('THIRD_PARTY_NOTICES.txt'));
  });

  it('includes the onedir runtime in every Tauri platform bundle', () => {
    for (const config of [
      'src-tauri/tauri.bundle.windows.conf.json',
      'src-tauri/tauri.bundle.macos.conf.json',
      'src-tauri/tauri.bundle.linux.conf.json',
    ]) {
      const parsed = JSON.parse(source(config)) as {
        bundle?: { resources?: Record<string, string> };
      };
      expect(parsed.bundle?.resources?.['lib/twitch-resolver/']).toBe('twitch-resolver/');
    }
  });

  it('accounts for the bundled native and Python resolver licenses', () => {
    const report = source('THIRD_PARTY_LICENSES.txt');

    expect(report).toContain('native:Unlicense');
    expect(report).toContain('yt-dlp@2026.08.19');
    expect(report).toContain('python:GPL-2.0-or-later AND Apache-2.0');
    expect(report).toContain('pyinstaller-hooks-contrib@2026.7');
    expect(report).toContain('python:MIT');
    expect(report).toContain('trio-websocket@0.12.2');
    expect(report).not.toContain('python:UNKNOWN');
  });
});
