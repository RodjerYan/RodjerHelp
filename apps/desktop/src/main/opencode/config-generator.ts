import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  generateConfig,
  ACCOMPLISH_AGENT_NAME,
  buildProviderConfigs,
  syncApiKeysToOpenCodeAuth as coreSyncApiKeysToOpenCodeAuth,
  getOpenAiOauthStatus,
  isTokenExpired,
  refreshAccessToken,
} from '@accomplish_ai/agent-core';
import { getApiKey, getAllApiKeys } from '../store/secureStorage';
import { getStorage } from '../store/storage';
import { getBundledNodePaths } from '../utils/bundled-node';
import { skillsManager } from '../skills';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '@accomplish_ai/agent-core';

export { ACCOMPLISH_AGENT_NAME };

type OpenCodeAuthEntry = {
  type?: string;
  key?: string;
  refresh?: string;
  access?: string;
  expires?: number;
  accountId?: string;
  [key: string]: unknown;
};

function shouldPreferOpenAiOauth(): boolean {
  const storage = getStorage();
  const provider = storage.getConnectedProvider('openai');
  if (
    provider?.connectionStatus === 'connected' &&
    provider.credentials?.type === 'oauth' &&
    provider.credentials.oauthProvider === 'chatgpt'
  ) {
    return true;
  }

  return getOpenAiOauthStatus().connected;
}

function getLegacyOpenCodeDataHome(): string {
  return path.join(os.homedir(), '.local', 'share');
}

function getAppOpenCodeDataHome(): string {
  return app.getPath('userData');
}

function getLegacyOpenCodeAuthPath(): string {
  return path.join(getLegacyOpenCodeDataHome(), 'opencode', 'auth.json');
}

function getAppOpenCodeAuthPath(): string {
  return path.join(getAppOpenCodeDataHome(), 'opencode', 'auth.json');
}

function readOpenCodeAuthFile(authPath: string): Record<string, OpenCodeAuthEntry> {
  if (!fs.existsSync(authPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(authPath, 'utf-8')) as Record<string, OpenCodeAuthEntry>;
  } catch {
    return {};
  }
}

function writeOpenCodeAuthFile(authPath: string, auth: Record<string, OpenCodeAuthEntry>): void {
  const authDir = path.dirname(authPath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
}

function hasUsableOpenAiOauth(entry: OpenCodeAuthEntry | undefined): boolean {
  return (
    entry?.type === 'oauth' && typeof entry.refresh === 'string' && entry.refresh.trim().length > 0
  );
}

function syncLegacyOpenAiOauthToAppAuth(): void {
  const legacyAuth = readOpenCodeAuthFile(getLegacyOpenCodeAuthPath());
  const legacyOpenAi = legacyAuth.openai;
  if (!hasUsableOpenAiOauth(legacyOpenAi)) {
    return;
  }

  const appAuthPath = getAppOpenCodeAuthPath();
  const appAuth = readOpenCodeAuthFile(appAuthPath);
  const currentOpenAi = appAuth.openai;
  const nextOpenAi = {
    type: 'oauth',
    refresh: legacyOpenAi?.refresh,
    access: legacyOpenAi?.access,
    expires: legacyOpenAi?.expires,
    accountId: legacyOpenAi?.accountId,
  };

  if (JSON.stringify(currentOpenAi) === JSON.stringify(nextOpenAi)) {
    return;
  }

  appAuth.openai = nextOpenAi;
  writeOpenCodeAuthFile(appAuthPath, appAuth);
  console.log('[OpenCode Auth] Mirrored OpenAI OAuth session into app auth.json');
}

/**
 * Returns the path to MCP tools directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core', 'mcp-tools');
  }
}

/**
 * Returns the OpenCode config directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core');
  }
}

/**
 * Returns the OpenCode data home used by the desktop app.
 *
 * We intentionally isolate OpenCode runtime data inside the app's userData
 * directory so stale global OAuth/session state from other OpenCode installs
 * cannot leak into RodjerHelp runs.
 */
export function getOpenCodeDataHome(): string {
  return getAppOpenCodeDataHome();
}

/**
 * Returns the app-specific path to OpenCode auth.json.
 */
export function getOpenCodeAuthPath(): string {
  return getAppOpenCodeAuthPath();
}

/**
 * Generates the OpenCode configuration file.
 *
 * @param azureFoundryToken - Optional Azure Foundry token for Entra ID auth
 * @returns Path to the generated config file
 */
export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  const mcpToolsPath = getMcpToolsPath();
  const userDataPath = app.getPath('userData');
  const bundledNodeBinPath = getBundledNodePaths()?.binDir;

  console.log('[OpenCode Config] MCP tools path:', mcpToolsPath);
  console.log('[OpenCode Config] User data path:', userDataPath);
  if (!bundledNodeBinPath) {
    throw new Error(
      '[OpenCode Config] Bundled Node.js path is missing. ' +
        'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild before launching.',
    );
  }

  // Use the extracted buildProviderConfigs from core package
  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs({
    getApiKey: (providerId) => {
      if (providerId === 'openai' && shouldPreferOpenAiOauth()) {
        return null;
      }

      return getApiKey(providerId);
    },
    azureFoundryToken,
  });

  // Inject store:false for OpenAI to prevent 403 errors
  // with project-scoped keys (sk-proj-...) that lack /v1/chat/completions storage permission
  const openAiApiKey = shouldPreferOpenAiOauth() ? null : getApiKey('openai');
  if (openAiApiKey) {
    const existingOpenAi = providerConfigs.find((p) => p.id === 'openai');
    if (existingOpenAi) {
      existingOpenAi.options.store = false;
    } else {
      providerConfigs.push({
        id: 'openai',
        options: { store: false },
      });
    }
  }

  const enabledSkills = await skillsManager.getEnabled();
  const sanitizedEnabledProviders = Array.from(
    new Set(
      enabledProviders.filter(
        (provider): provider is string =>
          typeof provider === 'string' && provider.trim().length > 0,
      ),
    ),
  );

  // Fetch enabled connectors with valid tokens
  const storage = getStorage();
  const enabledConnectors = storage.getEnabledConnectors();
  const connectors: Array<{ id: string; name: string; url: string; accessToken: string }> = [];

  for (const connector of enabledConnectors) {
    if (connector.status !== 'connected') continue;

    let tokens = storage.getConnectorTokens(connector.id);
    if (!tokens?.accessToken) {
      console.warn(`[Connectors] Missing access token for ${connector.name}`);
      storage.setConnectorStatus(connector.id, 'error');
      continue;
    }

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      if (tokens.refreshToken && connector.oauthMetadata && connector.clientRegistration) {
        try {
          tokens = await refreshAccessToken({
            tokenEndpoint: connector.oauthMetadata.tokenEndpoint,
            refreshToken: tokens.refreshToken,
            clientId: connector.clientRegistration.clientId,
            clientSecret: connector.clientRegistration.clientSecret,
          });
          storage.storeConnectorTokens(connector.id, tokens);
        } catch (err) {
          console.warn(`[Connectors] Token refresh failed for ${connector.name}:`, err);
          storage.setConnectorStatus(connector.id, 'error');
          continue;
        }
      } else {
        console.warn(
          `[Connectors] Access token expired for ${connector.name} and cannot be refreshed`,
        );
        storage.setConnectorStatus(connector.id, 'error');
        continue;
      }
    }

    connectors.push({
      id: connector.id,
      name: connector.name,
      url: connector.url,
      accessToken: tokens.accessToken,
    });
  }

  const result = generateConfig({
    platform: process.platform,
    mcpToolsPath,
    userDataPath,
    isPackaged: app.isPackaged,
    bundledNodeBinPath,
    skills: enabledSkills,
    providerConfigs,
    permissionApiPort: PERMISSION_API_PORT,
    questionApiPort: QUESTION_API_PORT,
    enabledProviders: sanitizedEnabledProviders,
    model: modelOverride?.model,
    smallModel: modelOverride?.smallModel,
    connectors: connectors.length > 0 ? connectors : undefined,
  });

  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);

  console.log('[OpenCode Config] Generated config at:', result.configPath);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return result.configPath;
}

/**
 * Returns the path to the OpenCode config file.
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

/**
 * Syncs API keys to the OpenCode auth.json file.
 * Uses Electron-specific path resolution and secure storage access.
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const apiKeys = await getAllApiKeys();
  const authPath = getOpenCodeAuthPath();
  if (shouldPreferOpenAiOauth()) {
    syncLegacyOpenAiOauthToAppAuth();
  }
  const effectiveApiKeys = shouldPreferOpenAiOauth()
    ? {
        ...apiKeys,
        openai: null,
      }
    : apiKeys;

  await coreSyncApiKeysToOpenCodeAuth(authPath, effectiveApiKeys);
}
