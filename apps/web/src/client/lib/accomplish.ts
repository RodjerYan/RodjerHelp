/**
 * Compatibility shim.
 *
 * The Electron preload API typings live in `rodjerhelp.ts` (including the
 * `declare global { interface Window { accomplish?: ... } }` augmentation).
 *
 * A lot of UI code imports from `./accomplish` historically. Keep this file as
 * a thin re-export wrapper to avoid duplicating global declarations.
 */

export {
  // Primary API getter (typed in rodjerhelp.ts)
  getRodjerHelp,

  // Back-compat alias used in older code paths
  getAccomplish,

  // Misc helpers (typed in rodjerhelp.ts)
  getShellPlatform,
  getShellVersion,
} from './rodjerhelp';
