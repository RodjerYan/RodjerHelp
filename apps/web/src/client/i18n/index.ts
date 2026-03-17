/**
 * Конфигурация i18n для веб‑версии (самодостаточная)
 *
 * Все переводы подключаются как статические импорты. Предпочтение языка
 * хранится в localStorage. Нет зависимости от IPC или основного процесса.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Статические импорты русской локали (сборка с одним языком)
import ruCommon from '@locales/ru/common.json';
import ruHome from '@locales/ru/home.json';
import ruSettings from '@locales/ru/settings.json';
import ruExecution from '@locales/ru/execution.json';
import ruHistory from '@locales/ru/history.json';
import ruErrors from '@locales/ru/errors.json';
import ruSidebar from '@locales/ru/sidebar.json';

// Поддерживаемые языки и пространства имён
export const SUPPORTED_LANGUAGES = ['ru'] as const;
export const NAMESPACES = [
  'common',
  'home',
  'execution',
  'settings',
  'history',
  'errors',
  'sidebar',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type Namespace = (typeof NAMESPACES)[number];

// Оставлено для обратной совместимости с существующими путями кода.
// Эта сборка только на RU и не сохраняет предпочтение языка.
export const LANGUAGE_STORAGE_KEY = 'rodjerhelp-language';

// Флаг для отслеживания инициализации
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

function updateDocumentDirection(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = language;
}

/**
 * Читает сохранённое предпочтение языка из localStorage.
 * Возвращает конкретный язык (разрешает 'auto' через navigator).
 */
function resolveStoredLanguage(): SupportedLanguage {
  return 'ru';
}

/**
 * Инициализация i18n со встроенными переводами
 */
export async function initI18n(): Promise<void> {
  if (isInitialized) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const initialLanguage = resolveStoredLanguage();

    await i18n.use(initReactI18next).init({
      resources: {
        ru: {
          common: ruCommon as Record<string, unknown>,
          home: ruHome as Record<string, unknown>,
          settings: ruSettings as Record<string, unknown>,
          execution: ruExecution as Record<string, unknown>,
          history: ruHistory as Record<string, unknown>,
          errors: ruErrors as Record<string, unknown>,
          sidebar: ruSidebar as Record<string, unknown>,
        },
      },
      lng: initialLanguage,
      fallbackLng: 'ru',
      defaultNS: 'common',
      ns: NAMESPACES as unknown as string[],

      interpolation: {
        escapeValue: false,
      },

      // В RU‑only сборке нет определения/сохранения языка.

      debug: process.env.NODE_ENV === 'development',

      returnEmptyString: false,

      react: {
        useSuspense: false,
      },
    });

    updateDocumentDirection(initialLanguage);
    isInitialized = true;
    console.log(`[i18n] Инициализировано с языком: ${initialLanguage}`);
  })();

  return initializationPromise;
}

/**
 * Сменить язык и сохранить в localStorage
 */
export async function changeLanguage(_language: 'ru' | 'auto' = 'ru'): Promise<void> {
  // RU‑only сборка: переключение языка намеренно отключено.
  await i18n.changeLanguage('ru');
  updateDocumentDirection('ru');
}

/**
 * Получить текущее предпочтение языка из localStorage
 */
export function getLanguagePreference(): 'ru' {
  return 'ru';
}

export default i18n;
