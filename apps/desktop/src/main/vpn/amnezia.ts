import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type {
  VpnProfile,
  VpnProfileSnapshot,
  VpnSettings,
  VpnStatus,
} from '@accomplish_ai/agent-core';

const execFileAsync = promisify(execFile);

const AMNEZIA_PIPE_PATH = '\\\\.\\pipe\\amneziavpn';
const AMNEZIA_CLIENT_PATH = 'C:\\Program Files\\AmneziaVPN\\AmneziaVPN.exe';
const AMNEZIA_SERVICE_EXE_PATH = 'C:\\Program Files\\AmneziaVPN\\AmneziaVPN-service.exe';
const COMMAND_TIMEOUT_MS = 15000;
const STATUS_RETRY_DELAY_MS = 500;
const STATUS_RETRY_COUNT = 8;
const NETWORK_PROBE_TIMEOUT_MS = 3500;
const NETWORK_PROBE_RETRY_DELAY_MS = 800;
const NETWORK_PROBE_RETRY_COUNT = 8;

type DaemonMessage =
  | {
      type: 'status';
      connected?: boolean;
      date?: string;
      deviceIpv4Address?: string;
      serverIpv4Gateway?: string;
      txBytes?: number;
      rxBytes?: number;
    }
  | {
      type: 'connected';
      pubkey?: string;
    }
  | {
      type: 'disconnected';
    }
  | {
      type: 'backendFailure';
      errorCode?: number;
    }
  | {
      type: 'logs';
      logs?: string;
    };

type PipeCommand = Record<string, unknown> & { type: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function splitCsvValue(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

function buildProviderReachabilityUrl(storage: StorageAPI): string | null {
  const activeProviderModel =
    typeof storage.getActiveProviderModel === 'function' ? storage.getActiveProviderModel() : null;
  const selectedModel =
    typeof storage.getSelectedModel === 'function' ? storage.getSelectedModel() : null;
  const provider = activeProviderModel?.provider || selectedModel?.provider;
  const selectedBaseUrl = activeProviderModel?.baseUrl || selectedModel?.baseUrl;

  switch (provider) {
    case 'openai': {
      const baseUrl =
        typeof storage.getOpenAiBaseUrl === 'function' ? storage.getOpenAiBaseUrl().trim() : '';
      return `${normalizeBaseUrl(baseUrl || 'https://api.openai.com/v1')}/models`;
    }
    case 'anthropic':
      return 'https://api.anthropic.com/v1/models';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta/models';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/models';
    case 'xai':
      return 'https://api.x.ai/v1/models';
    case 'deepseek':
      return 'https://api.deepseek.com/v1/models';
    case 'moonshot':
      return 'https://api.moonshot.cn/v1/models';
    case 'zai':
      return 'https://api.z.ai/api/coding/paas/v4/models';
    case 'azure-foundry': {
      const config =
        typeof storage.getAzureFoundryConfig === 'function'
          ? storage.getAzureFoundryConfig()
          : null;
      const baseUrl = config?.baseUrl || selectedBaseUrl;
      return baseUrl ? normalizeBaseUrl(baseUrl) : null;
    }
    case 'custom':
    case 'litellm':
    case 'lmstudio':
    case 'ollama': {
      if (!selectedBaseUrl) {
        return null;
      }

      if (provider === 'ollama') {
        return `${normalizeBaseUrl(selectedBaseUrl)}/api/tags`;
      }

      return `${normalizeBaseUrl(selectedBaseUrl)}/v1/models`;
    }
    case 'vertex':
      return 'https://generativelanguage.googleapis.com';
    case 'bedrock':
      return null;
    case 'minimax':
      return 'https://api.minimax.chat';
    default:
      return null;
  }
}

function extractDisplayHost(targetUrl: string): string {
  try {
    return new URL(targetUrl).host;
  } catch {
    return targetUrl;
  }
}

async function isUrlReachable(
  targetUrl: string,
  timeoutMs = NETWORK_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return false;
  }

  if (isLocalHostname(parsedUrl.hostname)) {
    return true;
  }

  const client = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const request = client.request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'User-Agent': 'RodjerHelp/0.3.11',
        },
      },
      (response) => {
        response.resume();
        finish(true);
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('timeout'));
      finish(false);
    });

    request.on('error', () => {
      finish(false);
    });

    request.end();
  });
}

async function waitForProviderReachability(
  storage: StorageAPI,
): Promise<{ reachable: boolean; targetUrl?: string }> {
  const targetUrl = buildProviderReachabilityUrl(storage);
  if (!targetUrl) {
    return { reachable: true };
  }

  for (let attempt = 0; attempt < NETWORK_PROBE_RETRY_COUNT; attempt += 1) {
    if (await isUrlReachable(targetUrl)) {
      return { reachable: true, targetUrl };
    }

    await sleep(NETWORK_PROBE_RETRY_DELAY_MS);
  }

  return { reachable: false, targetUrl };
}

function hasAmneziaClient(): boolean {
  if (process.platform !== 'win32') {
    return false;
  }

  return fs.existsSync(AMNEZIA_CLIENT_PATH);
}

async function tryStartAmneziaService(): Promise<void> {
  if (process.platform !== 'win32') {
    return;
  }

  if (!fs.existsSync(AMNEZIA_SERVICE_EXE_PATH)) {
    return;
  }

  try {
    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Start-Service -Name 'AmneziaVPN-service' -ErrorAction SilentlyContinue",
      ],
      {
        timeout: 3000,
        windowsHide: true,
      },
    );
    await sleep(800);
  } catch {
    // Service startup is best-effort. A later pipe connection will surface errors if it fails.
  }
}

function parseEndpoint(endpoint: string): { host: string; port: number } {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new Error('В конфиге не указан Endpoint');
  }

  if (trimmed.startsWith('[')) {
    const match = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
    if (!match) {
      throw new Error('Endpoint имеет неверный формат');
    }

    return { host: match[1], port: Number(match[2]) };
  }

  const separatorIndex = trimmed.lastIndexOf(':');
  if (separatorIndex <= 0) {
    throw new Error('Endpoint имеет неверный формат');
  }

  const host = trimmed.slice(0, separatorIndex).trim();
  const port = Number(trimmed.slice(separatorIndex + 1).trim());
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error('Endpoint имеет неверный формат');
  }

  return { host, port };
}

function serializeProfileToConfig(profile: VpnProfile): string {
  const lines: string[] = ['[Interface]'];

  lines.push(`PrivateKey = ${profile.privateKey}`);
  lines.push(`Address = ${profile.addresses.join(', ')}`);
  if (profile.dnsServers.length > 0) {
    lines.push(`DNS = ${profile.dnsServers.join(', ')}`);
  }
  if (profile.mtu) {
    lines.push(`MTU = ${profile.mtu}`);
  }

  for (const key of [
    'Jc',
    'Jmin',
    'Jmax',
    'S1',
    'S2',
    'S3',
    'S4',
    'H1',
    'H2',
    'H3',
    'H4',
    'I1',
    'I2',
    'I3',
    'I4',
    'I5',
  ] as const) {
    const value = profile.obfuscation[key];
    if (value) {
      lines.push(`${key} = ${value}`);
    }
  }

  lines.push('');
  lines.push('[Peer]');
  lines.push(`PublicKey = ${profile.publicKey}`);
  if (profile.presharedKey) {
    lines.push(`PresharedKey = ${profile.presharedKey}`);
  }
  lines.push(`AllowedIPs = ${profile.allowedIps.join(', ')}`);
  lines.push(`Endpoint = ${profile.endpointHost}:${profile.endpointPort}`);
  if (profile.persistentKeepalive) {
    lines.push(`PersistentKeepalive = ${profile.persistentKeepalive}`);
  }

  return `${lines.join('\n')}\n`;
}

export function parseAmneziaConfigText(
  rawConfig: string,
  options?: { sourcePath?: string; name?: string },
): VpnProfile {
  const sections = new Map<string, Record<string, string>>();
  let currentSection: string | null = null;

  for (const originalLine of rawConfig.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, {});
      }
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    sections.get(currentSection)![key] = value;
  }

  const interfaceSection = sections.get('Interface') ?? {};
  const peerSection = sections.get('Peer') ?? {};

  const { host, port } = parseEndpoint(peerSection.Endpoint ?? '');
  const addresses = splitCsvValue(interfaceSection.Address);
  const dnsServers = splitCsvValue(interfaceSection.DNS);
  const allowedIps = splitCsvValue(peerSection.AllowedIPs);
  const protocol =
    interfaceSection.Jc || interfaceSection.Jmin || interfaceSection.H1 ? 'awg' : 'wireguard';

  if (!interfaceSection.PrivateKey || !peerSection.PublicKey || addresses.length === 0) {
    throw new Error('В конфиге не хватает обязательных полей Interface/Peer');
  }

  const obfuscationKeys = [
    'Jc',
    'Jmin',
    'Jmax',
    'S1',
    'S2',
    'S3',
    'S4',
    'H1',
    'H2',
    'H3',
    'H4',
    'I1',
    'I2',
    'I3',
    'I4',
    'I5',
  ] as const;
  const obfuscation = Object.fromEntries(
    obfuscationKeys
      .map((key) => [key, interfaceSection[key]])
      .filter(([, value]) => typeof value === 'string' && value.length > 0),
  ) as VpnProfile['obfuscation'];

  return {
    name:
      options?.name?.trim() ||
      path.basename(
        options?.sourcePath || 'Amnezia profile',
        path.extname(options?.sourcePath || ''),
      ) ||
      'Amnezia profile',
    protocol,
    privateKey: interfaceSection.PrivateKey,
    publicKey: peerSection.PublicKey,
    presharedKey: peerSection.PresharedKey || peerSection.PreSharedKey || '',
    addresses,
    dnsServers,
    mtu: interfaceSection.MTU ? Number(interfaceSection.MTU) : undefined,
    endpointHost: host,
    endpointPort: port,
    allowedIps: allowedIps.length > 0 ? allowedIps : ['0.0.0.0/0', '::/0'],
    persistentKeepalive: peerSection.PersistentKeepalive
      ? Number(peerSection.PersistentKeepalive)
      : undefined,
    obfuscation,
    sourcePath: options?.sourcePath,
    updatedAt: new Date().toISOString(),
  };
}

function parseAllowedIpRange(value: string): { address: string; range: number; isIpv6: boolean } {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('AllowedIPs содержит пустое значение');
  }

  const [address, prefix] = trimmed.split('/');
  return {
    address,
    range: prefix ? Number(prefix) : address.includes(':') ? 128 : 32,
    isIpv6: address.includes(':'),
  };
}

function buildActivatePayload(profile: VpnProfile, settings: VpnSettings): PipeCommand {
  const ipv4Address = profile.addresses.find((value) => !value.includes(':')) ?? '';
  const ipv6Address = profile.addresses.find((value) => value.includes(':')) ?? '';
  const allowedIpRanges = profile.allowedIps.map((value) => parseAllowedIpRange(value));
  const command: PipeCommand = {
    type: 'activate',
    privateKey: profile.privateKey,
    deviceIpv4Address: ipv4Address,
    deviceIpv6Address: ipv6Address,
    serverPublicKey: profile.publicKey,
    serverPskKey: profile.presharedKey || '',
    serverIpv4AddrIn: profile.endpointHost,
    serverIpv6AddrIn: '',
    serverPort: profile.endpointPort,
    serverIpv4Gateway: profile.endpointHost,
    serverIpv6Gateway: '',
    deviceMTU: profile.mtu ? String(profile.mtu) : '',
    primaryDnsServer: profile.dnsServers[0] ?? '',
    secondaryDnsServer: profile.dnsServers[1] ?? '',
    allowedIPAddressRanges: allowedIpRanges,
    excludedAddresses: [profile.endpointHost],
    vpnDisabledApps: [],
    allowedDnsServers: profile.dnsServers,
    killSwitchOption: settings.killSwitch ? 'true' : 'false',
  };

  for (const [key, value] of Object.entries(profile.obfuscation)) {
    if (value) {
      command[key] = value;
    }
  }

  return command;
}

async function sendPipeCommand(
  command: PipeCommand,
  shouldResolve: (message: DaemonMessage, messages: DaemonMessage[]) => boolean,
  timeoutMs = COMMAND_TIMEOUT_MS,
  options?: { ensureService?: boolean },
): Promise<DaemonMessage[]> {
  if (options?.ensureService) {
    await tryStartAmneziaService();
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(AMNEZIA_PIPE_PATH);
    const messages: DaemonMessage[] = [];
    let buffer = '';
    let settled = false;

    const finish = (handler: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
      handler();
    };

    const timer = setTimeout(() => {
      finish(() => resolve(messages));
    }, timeoutMs);

    socket.setTimeout(timeoutMs, () => {
      finish(() => resolve(messages));
    });

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(command)}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) {
          continue;
        }

        try {
          const parsed = JSON.parse(line) as DaemonMessage;
          messages.push(parsed);
          if (shouldResolve(parsed, messages)) {
            finish(() => resolve(messages));
            return;
          }
        } catch (error) {
          finish(() =>
            reject(
              error instanceof Error ? error : new Error('Не удалось разобрать ответ VPN-сервиса'),
            ),
          );
          return;
        }
      }
    });

    socket.on('error', async (error: NodeJS.ErrnoException) => {
      if (
        options?.ensureService &&
        !settled &&
        (error.code === 'ENOENT' || error.code === 'ECONNREFUSED')
      ) {
        await tryStartAmneziaService();
      }
      finish(() => reject(error));
    });
  });
}

async function requestStatusRaw(): Promise<Extract<DaemonMessage, { type: 'status' }> | null> {
  try {
    const messages = await sendPipeCommand(
      { type: 'status' },
      (message) => message.type === 'status',
      800,
    );
    const status = messages.find(
      (message): message is Extract<DaemonMessage, { type: 'status' }> => message.type === 'status',
    );
    return status ?? null;
  } catch {
    return null;
  }
}

export function getStoredVpnProfileSnapshot(storage: StorageAPI): VpnProfileSnapshot {
  const snapshot = storage.getVpnProfile();
  if (!snapshot.profile) {
    return { profile: null, rawConfig: null };
  }

  return {
    profile: snapshot.profile,
    rawConfig: serializeProfileToConfig(snapshot.profile),
  };
}

export function saveVpnProfileFromRawConfig(
  storage: StorageAPI,
  rawConfig: string,
  options?: { name?: string; sourcePath?: string },
): VpnProfileSnapshot {
  const profile = parseAmneziaConfigText(rawConfig, options);
  storage.storeVpnProfile(profile);
  return {
    profile,
    rawConfig: serializeProfileToConfig(profile),
  };
}

export function deleteStoredVpnProfile(storage: StorageAPI): boolean {
  return storage.deleteVpnProfile();
}

export async function getVpnStatus(storage: StorageAPI): Promise<VpnStatus> {
  if (process.platform !== 'win32') {
    return {
      state: 'unsupported',
      serviceAvailable: false,
      clientAvailable: false,
      hasProfile: Boolean(getStoredVpnProfileSnapshot(storage).profile),
      lastError: 'Встроенный Amnezia VPN сейчас поддерживается только на Windows',
    };
  }

  const snapshot = getStoredVpnProfileSnapshot(storage);
  const clientAvailable = hasAmneziaClient();
  const status = await requestStatusRaw();

  if (!status) {
    return {
      state: clientAvailable ? 'disconnected' : 'unsupported',
      serviceAvailable: false,
      clientAvailable,
      hasProfile: Boolean(snapshot.profile),
      endpoint: snapshot.profile
        ? `${snapshot.profile.endpointHost}:${snapshot.profile.endpointPort}`
        : undefined,
    };
  }

  return {
    state: status.connected ? 'connected' : 'disconnected',
    serviceAvailable: true,
    clientAvailable,
    hasProfile: Boolean(snapshot.profile),
    connectedAt: status.connected ? status.date : undefined,
    endpoint: snapshot.profile
      ? `${snapshot.profile.endpointHost}:${snapshot.profile.endpointPort}`
      : undefined,
    publicKey: snapshot.profile?.publicKey,
    deviceAddress: status.deviceIpv4Address,
    txBytes: typeof status.txBytes === 'number' ? status.txBytes : undefined,
    rxBytes: typeof status.rxBytes === 'number' ? status.rxBytes : undefined,
  };
}

export async function connectVpn(storage: StorageAPI): Promise<VpnStatus> {
  if (process.platform !== 'win32') {
    return getVpnStatus(storage);
  }

  const settings = storage.getVpnSettings();
  const snapshot = getStoredVpnProfileSnapshot(storage);

  if (!snapshot.profile) {
    throw new Error('VPN-профиль не настроен');
  }

  const payload = buildActivatePayload(snapshot.profile, settings);
  const messages = await sendPipeCommand(
    payload,
    (message) =>
      message.type === 'connected' ||
      message.type === 'backendFailure' ||
      message.type === 'disconnected',
    COMMAND_TIMEOUT_MS,
    { ensureService: true },
  );

  const backendFailure = messages.find(
    (message): message is Extract<DaemonMessage, { type: 'backendFailure' }> =>
      message.type === 'backendFailure',
  );
  const sawConnectedMessage = messages.some((message) => message.type === 'connected');

  if (backendFailure) {
    return {
      state: 'error',
      serviceAvailable: true,
      clientAvailable: hasAmneziaClient(),
      hasProfile: true,
      endpoint: `${snapshot.profile.endpointHost}:${snapshot.profile.endpointPort}`,
      publicKey: snapshot.profile.publicKey,
      lastError: `Ошибка backend Amnezia: ${backendFailure.errorCode ?? 'unknown'}`,
    };
  }

  for (let attempt = 0; attempt < STATUS_RETRY_COUNT; attempt += 1) {
    const status = await getVpnStatus(storage);
    if (status.state === 'connected') {
      const reachability = await waitForProviderReachability(storage);
      if (reachability.reachable) {
        return status;
      }

      return {
        ...status,
        state: 'error',
        lastError: `VPN подключён, но доступ к ${extractDisplayHost(reachability.targetUrl ?? '')} через туннель не появился`,
      };
    }

    await sleep(STATUS_RETRY_DELAY_MS);
  }

  if (sawConnectedMessage) {
    const reachability = await waitForProviderReachability(storage);
    const snapshot = getStoredVpnProfileSnapshot(storage);
    const baseStatus: VpnStatus = {
      state: 'connected',
      serviceAvailable: true,
      clientAvailable: hasAmneziaClient(),
      hasProfile: Boolean(snapshot.profile),
      endpoint: snapshot.profile
        ? `${snapshot.profile.endpointHost}:${snapshot.profile.endpointPort}`
        : undefined,
      publicKey: snapshot.profile?.publicKey,
    };

    if (reachability.reachable) {
      return baseStatus;
    }

    return {
      ...baseStatus,
      state: 'error',
      lastError: `VPN backend сообщил о подключении, но доступ к ${extractDisplayHost(
        reachability.targetUrl ?? '',
      )} через туннель не появился`,
    };
  }

  return {
    ...(await getVpnStatus(storage)),
    state: 'error',
    lastError: 'Не удалось дождаться подтверждения подключения VPN',
  };
}

export async function disconnectVpn(storage: StorageAPI): Promise<VpnStatus> {
  if (process.platform !== 'win32') {
    return getVpnStatus(storage);
  }

  try {
    await sendPipeCommand(
      { type: 'deactivate' },
      (message) => message.type === 'disconnected',
      3000,
      { ensureService: true },
    );
  } catch {
    // We still poll status below because the daemon may have already closed the tunnel.
  }

  for (let attempt = 0; attempt < STATUS_RETRY_COUNT; attempt += 1) {
    const status = await getVpnStatus(storage);
    if (status.state !== 'connected') {
      return status;
    }

    await sleep(STATUS_RETRY_DELAY_MS);
  }

  return {
    ...(await getVpnStatus(storage)),
    state: 'error',
    lastError: 'Не удалось дождаться отключения VPN',
  };
}

export async function ensureVpnReadyForTasks(storage: StorageAPI): Promise<void> {
  const settings =
    typeof storage.getVpnSettings === 'function'
      ? storage.getVpnSettings()
      : {
          enabled: false,
          autoConnect: false,
          requireTunnel: false,
          killSwitch: false,
        };
  if (!settings.enabled) {
    return;
  }

  const snapshot = getStoredVpnProfileSnapshot(storage);
  if (!snapshot.profile) {
    if (settings.requireTunnel) {
      throw new Error('Включен защищённый режим, но VPN-профиль ещё не настроен');
    }
    return;
  }

  const currentStatus = await getVpnStatus(storage);
  if (currentStatus.state === 'connected') {
    const reachability = await waitForProviderReachability(storage);
    if (reachability.reachable) {
      return;
    }

    throw new Error(
      `VPN подключён, но доступ к ${extractDisplayHost(reachability.targetUrl ?? '')} через туннель не появился`,
    );
  }

  if (settings.autoConnect) {
    const connectedStatus = await connectVpn(storage);
    if (connectedStatus.state === 'connected') {
      return;
    }

    if (settings.requireTunnel) {
      throw new Error(connectedStatus.lastError || 'Не удалось автоматически поднять VPN-туннель');
    }
    return;
  }

  if (settings.requireTunnel) {
    throw new Error('Перед запуском задачи нужно подключить встроенный VPN');
  }
}
