/**
 * Compatibility shim for legacy `@/lib/accomplish` imports.
 *
 * The typed Electron bridge now lives in `rodjerhelp.ts`, but a number of
 * older code paths and tests still import the historic Accomplish helpers.
 */

import {
  clearLastPickedChatFiles,
  getLastPickedChatFiles,
  getRodjerHelp,
  getShellPlatform,
  getShellVersion,
  isRunningInElectron,
  setLastPickedChatFiles,
  type PickedFile,
} from './rodjerhelp';

const LEGACY_ACCOMPLISH_ERROR = 'Accomplish API not available - not running in Electron';

export { getRodjerHelp, getShellPlatform, getShellVersion, isRunningInElectron };
export {
  clearLastPickedChatFiles,
  getLastPickedChatFiles,
  setLastPickedChatFiles,
  type PickedFile,
};

export function getAccomplish(): ReturnType<typeof getRodjerHelp> {
  try {
    return getRodjerHelp();
  } catch {
    throw new Error(LEGACY_ACCOMPLISH_ERROR);
  }
}

export function useAccomplish(): NonNullable<Window['accomplish']> {
  const api = window.accomplish;
  if (!api) {
    throw new Error(LEGACY_ACCOMPLISH_ERROR);
  }
  return api;
}
