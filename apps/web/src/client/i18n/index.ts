/**
 * Web i18n Configuration (Self-Contained)
 *
 * All translations are bundled as static imports. Language preference is
 * persisted in localStorage. No IPC or main-process dependency.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Static Russian locale imports (single-language build)
import ruCommon from '@locales/ru/common.json';
import ruHome from '@locales/ru/home.json';
import ruSettings from '@locales/ru/settings.json';
import ruExecution from '@locales/ru/execution.json';
import ruHistory from '@locales/ru/history.json';
import ruErrors from '@locales/ru/errors.json';
import ruSidebar from '@locales/ru/sidebar.json';

// Supported languages and namespaces
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

// Kept for backward compatibility with existing code paths.
// This build is RU-only and does not persist language preference.
export const LANGUAGE_STORAGE_KEY = 'rodjerhelp-language';

// Flag to track initialization
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

function updateDocumentDirection(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = language;
}

/**
 * Read the stored language preference from localStorage.
 * Returns the concrete language to use (resolves 'auto' via navigator).
 */
function resolveStoredLanguage(): SupportedLanguage {
  return 'ru';
}

/**
 * Initialize i18n with bundled translations
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

    await i18n
      .use(initReactI18next)
      .init({
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

        // No language detection/persistence in RU-only build.

        debug: process.env.NODE_ENV === 'development',

        returnEmptyString: false,

        react: {
          useSuspense: false,
        },
      });

    updateDocumentDirection(initialLanguage);
    isInitialized = true;
    console.log(`[i18n] Initialized with language: ${initialLanguage}`);
  })();

  return initializationPromise;
}

/**
 * Change language and persist to localStorage
 */
export async function changeLanguage(_language: 'ru' | 'auto' = 'ru'): Promise<void> {
  // RU-only build: language switching is intentionally disabled.
  await i18n.changeLanguage('ru');
  updateDocumentDirection('ru');
}

/**
 * Get the current language preference from localStorage
 */
export function getLanguagePreference(): 'ru' {
  return 'ru';
}

export default i18n;
