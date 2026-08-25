import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Button } from '../../src/components/common/Button';
import {
  createI18n,
  localizeUiText,
  loadAllUiMessageCatalogs,
  UI_MESSAGE_CATALOGS,
  uiLocale,
} from '../../src/i18n';
import { UI_LANGUAGE_DEFINITIONS } from '../../src/i18nConfig';
import { DE_MESSAGES } from '../../src/locales/de';
import { useSettingsStore } from '../../src/store/useSettingsStore';

beforeAll(async () => {
  await loadAllUiMessageCatalogs();
});

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('UI localization', () => {
  it('translates app-owned labels without touching unknown content', () => {
    expect(localizeUiText('Movies', 'de')).toBe('Filme');
    expect(localizeUiText('Filme', 'en')).toBe('Filme');
    expect(localizeUiText('A provider title', 'de')).toBe('A provider title');
  });

  it('provides complete catalogue parity for every supported language', () => {
    const sourceKeys = Object.keys(DE_MESSAGES).filter((key) => !key.includes('::')).sort();

    expect(UI_LANGUAGE_DEFINITIONS.map(({ code }) => code)).toEqual([
      'en', 'de', 'es', 'fr', 'pt-BR', 'it', 'nl', 'pl',
    ]);
    for (const [language, catalogue] of Object.entries(UI_MESSAGE_CATALOGS)) {
      const translatedKeys = Object.keys(catalogue).filter((key) => !key.includes('::')).sort();
      expect(translatedKeys, `${language} catalogue keys`).toEqual(sourceKeys);
      for (const key of sourceKeys) {
        const sourcePlaceholders = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        const translatedPlaceholders = [...catalogue[key]!.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(translatedPlaceholders, `${language}: ${key}`).toEqual(sourcePlaceholders);
      }
    }
  });

  it('translates representative media labels across all eight languages', () => {
    expect(localizeUiText('Movies', 'es')).toBe('Películas');
    expect(localizeUiText('Movies', 'fr')).toBe('Films');
    expect(localizeUiText('Movies', 'pt-BR')).toBe('Filmes');
    expect(localizeUiText('Movies', 'it')).toBe('Film');
    expect(localizeUiText('Movies', 'nl')).toBe('Films');
    expect(localizeUiText('Movies', 'pl')).toBe('Filmy');
    expect(uiLocale('pt-BR')).toBe('pt-BR');
  });

  it('interpolates templates and localizes app-owned values captured from dynamic text', () => {
    expect(localizeUiText('Season {number}', 'de', { number: 3 })).toBe('Staffel 3');
    expect(localizeUiText('Collection "Weekend" ready.', 'de')).toBe('Sammlung „Weekend“ ist bereit.');
    expect(localizeUiText('Can’t reach Movies', 'de')).toBe('Filme ist nicht erreichbar');
    expect(localizeUiText('Can’t reach Movies', 'es')).toBe('No se puede acceder a Películas');
  });

  it('formats plurals, numbers, and dates with the selected locale', () => {
    const german = createI18n('de');
    const english = createI18n('en');

    expect(german.tn('{count} item', '{count} items', 2, { count: german.number(2) })).toBe('2 Elemente');
    expect(german.number(1234.5)).toBe('1.234,5');
    expect(english.number(1234.5)).toBe('1,234.5');
    expect(german.date(new Date(2026, 7, 13))).toBe('13.8.2026');
  });

  it('uses locale plural categories for Polish counts', () => {
    const polish = createI18n('pl');

    expect(polish.tn('{count} item', '{count} items', 1)).toBe('1 element');
    expect(polish.tn('{count} item', '{count} items', 2)).toBe('2 elementy');
    expect(polish.tn('{count} item', '{count} items', 5)).toBe('5 elementów');
    expect(polish.tn('{count} series', '{count} series', 2)).toBe('2 seriale');
  });

  it('reactively updates shared controls when the persisted language changes', () => {
    render(createElement(Button, null, 'Movies'));
    expect(screen.getByRole('button', { name: 'Movies' })).toBeTruthy();

    act(() => useSettingsStore.getState().updateSetting('language', 'de'));
    expect(screen.getByRole('button', { name: 'Filme' })).toBeTruthy();

    act(() => useSettingsStore.getState().updateSetting('language', 'fr'));
    expect(screen.getByRole('button', { name: 'Films' })).toBeTruthy();
  });
});
