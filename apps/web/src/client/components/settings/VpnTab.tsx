import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VpnProfileSnapshot, VpnSettings, VpnStatus } from '@accomplish_ai/agent-core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getRodjerHelp } from '@/lib/rodjerhelp';

const FALLBACK_SETTINGS: VpnSettings = {
  enabled: false,
  autoConnect: false,
  requireTunnel: false,
  killSwitch: false,
};

const EMPTY_STATUS: VpnStatus = {
  state: 'disconnected',
  serviceAvailable: false,
  clientAvailable: false,
  hasProfile: false,
};

const LOAD_TIMEOUT_MS = 1500;
const STATUS_POLL_INTERVAL_MS = 15000;

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

function safeInvoke<T>(
  invoke: (() => Promise<T>) | undefined,
  fallback: T,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<T> {
  if (!invoke) {
    return Promise.resolve(fallback);
  }

  try {
    return withTimeout(invoke(), fallback, timeoutMs);
  } catch {
    return Promise.resolve(fallback);
  }
}

function Toggle({
  enabled,
  onClick,
  disabled = false,
}: {
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
        enabled ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function VpnTab() {
  const { t } = useTranslation('settings');
  const accomplish = getRodjerHelp();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<VpnSettings>(FALLBACK_SETTINGS);
  const [snapshot, setSnapshot] = useState<VpnProfileSnapshot>({ profile: null, rawConfig: null });
  const [rawConfig, setRawConfig] = useState('');
  const [profileName, setProfileName] = useState('');
  const [status, setStatus] = useState<VpnStatus>(EMPTY_STATUS);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    void safeInvoke(accomplish.getVpnStatus, EMPTY_STATUS).then((vpnStatus) => {
      setStatus(vpnStatus);
    });
  }, [accomplish]);

  const loadState = useCallback(async () => {
    const [vpnSettings, vpnSnapshot] = await Promise.all([
      safeInvoke(accomplish.getVpnSettings, FALLBACK_SETTINGS),
      safeInvoke(accomplish.getVpnProfile, { profile: null, rawConfig: null }),
    ]);

    setSettings(vpnSettings);
    setSnapshot(vpnSnapshot);
    setRawConfig(vpnSnapshot.rawConfig ?? '');
    setProfileName(vpnSnapshot.profile?.name ?? '');
  }, [accomplish]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        await loadState();
        refreshStatus();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [loadState, refreshStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || busy) {
        return;
      }
      refreshStatus();
    }, STATUS_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [busy, refreshStatus]);

  const profileSummary = useMemo(() => {
    if (!snapshot.profile) {
      return null;
    }

    return {
      protocol: snapshot.profile.protocol.toUpperCase(),
      endpoint: `${snapshot.profile.endpointHost}:${snapshot.profile.endpointPort}`,
      dnsCount: snapshot.profile.dnsServers.length,
      addressCount: snapshot.profile.addresses.length,
      allowedCount: snapshot.profile.allowedIps.length,
    };
  }, [snapshot.profile]);

  const handleToggle = useCallback(
    async (
      nextValue: boolean,
      setter: (value: boolean) => void,
      remoteSetter?: (enabled: boolean) => Promise<void>,
    ) => {
      if (!remoteSetter) {
        return;
      }

      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        await remoteSetter(nextValue);
        setter(nextValue);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : t('vpn.errors.updateFailed'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const handleImport = useCallback(async () => {
    if (!accomplish.importVpnProfile) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const imported = await accomplish.importVpnProfile();
      if (!imported) {
        return;
      }

      setSnapshot(imported);
      setRawConfig(imported.rawConfig ?? '');
      setProfileName(imported.profile?.name ?? '');
      setStatus((current) => ({
        ...current,
        hasProfile: Boolean(imported.profile),
        endpoint: imported.profile
          ? `${imported.profile.endpointHost}:${imported.profile.endpointPort}`
          : undefined,
      }));
      refreshStatus();
      setMessage(t('vpn.messages.imported'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('vpn.errors.importFailed'));
    } finally {
      setBusy(false);
    }
  }, [accomplish, refreshStatus, t]);

  const handleSave = useCallback(async () => {
    if (!accomplish.saveVpnProfile) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await accomplish.saveVpnProfile({ rawConfig, name: profileName });
      setSnapshot(saved);
      setRawConfig(saved.rawConfig ?? '');
      setProfileName(saved.profile?.name ?? profileName);
      setStatus((current) => ({
        ...current,
        hasProfile: Boolean(saved.profile),
        endpoint: saved.profile
          ? `${saved.profile.endpointHost}:${saved.profile.endpointPort}`
          : undefined,
      }));
      refreshStatus();
      setMessage(t('vpn.messages.saved'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('vpn.errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  }, [accomplish, profileName, rawConfig, refreshStatus, t]);

  const handleDelete = useCallback(async () => {
    if (!accomplish.deleteVpnProfile) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await accomplish.deleteVpnProfile();
      setSnapshot({ profile: null, rawConfig: null });
      setRawConfig('');
      setProfileName('');
      setStatus(EMPTY_STATUS);
      refreshStatus();
      setMessage(t('vpn.messages.deleted'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('vpn.errors.deleteFailed'));
    } finally {
      setBusy(false);
    }
  }, [accomplish, refreshStatus, t]);

  const handleConnect = useCallback(async () => {
    if (!accomplish.connectVpn) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const vpnStatus = await accomplish.connectVpn();
      setStatus(vpnStatus);
      if (vpnStatus.state === 'connected') {
        setMessage(t('vpn.messages.connected'));
      } else if (vpnStatus.lastError) {
        setError(vpnStatus.lastError);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('vpn.errors.connectFailed'));
    } finally {
      setBusy(false);
    }
  }, [accomplish, t]);

  const handleDisconnect = useCallback(async () => {
    if (!accomplish.disconnectVpn) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const vpnStatus = await accomplish.disconnectVpn();
      setStatus(vpnStatus);
      setMessage(t('vpn.messages.disconnected'));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : t('vpn.errors.disconnectFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [accomplish, t]);

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border border-border bg-card p-0 shadow-none">
        <CardHeader className="gap-3 border-b border-border pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{t('vpn.title')}</CardTitle>
              <CardDescription>{t('vpn.description')}</CardDescription>
            </div>
            <Badge variant="outline">
              {loading ? t('status.connecting') : t(`vpn.states.${status.state}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {loading ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t('status.fetchingModels')}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('vpn.enabled')}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t('vpn.enabledDescription')}</p>
            </div>
            <Toggle
              enabled={settings.enabled}
              onClick={() =>
                void handleToggle(
                  !settings.enabled,
                  (value) => {
                    setSettings((current) => ({ ...current, enabled: value }));
                  },
                  accomplish.setVpnEnabled,
                )
              }
              disabled={busy}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('vpn.autoConnect')}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('vpn.autoConnectDescription')}
              </p>
            </div>
            <Toggle
              enabled={settings.autoConnect}
              onClick={() =>
                void handleToggle(
                  !settings.autoConnect,
                  (value) => {
                    setSettings((current) => ({ ...current, autoConnect: value }));
                  },
                  accomplish.setVpnAutoConnect,
                )
              }
              disabled={busy}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('vpn.requireTunnel')}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('vpn.requireTunnelDescription')}
              </p>
            </div>
            <Toggle
              enabled={settings.requireTunnel}
              onClick={() =>
                void handleToggle(
                  !settings.requireTunnel,
                  (value) => {
                    setSettings((current) => ({ ...current, requireTunnel: value }));
                  },
                  accomplish.setVpnRequireTunnel,
                )
              }
              disabled={busy}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('vpn.killSwitch')}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t('vpn.killSwitchDescription')}</p>
            </div>
            <Toggle
              enabled={settings.killSwitch}
              onClick={() =>
                void handleToggle(
                  !settings.killSwitch,
                  (value) => {
                    setSettings((current) => ({ ...current, killSwitch: value }));
                  },
                  accomplish.setVpnKillSwitch,
                )
              }
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground md:grid-cols-2">
            <div>
              {t('vpn.status.clientInstalled', {
                value: status.clientAvailable ? t('vpn.common.yes') : t('vpn.common.no'),
              })}
            </div>
            <div>
              {t('vpn.status.serviceAvailable', {
                value: status.serviceAvailable ? t('vpn.common.yes') : t('vpn.common.no'),
              })}
            </div>
            <div>
              {t('vpn.status.hasProfile', {
                value: status.hasProfile ? t('vpn.common.yes') : t('vpn.common.no'),
              })}
            </div>
            <div>
              {t('vpn.status.endpoint', { value: status.endpoint || t('vpn.common.notSet') })}
            </div>
          </div>

          {status.lastError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {status.lastError}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleImport()}
              disabled={busy}
            >
              {t('vpn.importProfile')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleConnect()}
              disabled={busy || !snapshot.profile}
            >
              {t('vpn.connect')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDisconnect()}
              disabled={busy}
            >
              {t('vpn.disconnect')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleDelete()}
              disabled={busy || !snapshot.profile}
            >
              {t('vpn.deleteProfile')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border border-border bg-card p-0 shadow-none">
        <CardHeader className="gap-3 border-b border-border pb-5">
          <CardTitle>{t('vpn.profile')}</CardTitle>
          <CardDescription>{t('vpn.profileDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="vpn-profile-name">
              {t('vpn.profileName')}
            </label>
            <Input
              id="vpn-profile-name"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder={t('vpn.profileNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="vpn-raw-config">
              {t('vpn.rawConfig')}
            </label>
            <Textarea
              id="vpn-raw-config"
              value={rawConfig}
              onChange={(event) => setRawConfig(event.target.value)}
              placeholder={t('vpn.rawConfigPlaceholder')}
              className="min-h-[320px] font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !rawConfig.trim()}
            >
              {t('vpn.saveProfile')}
            </Button>
          </div>

          {profileSummary ? (
            <div className="grid gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground md:grid-cols-2">
              <div>{t('vpn.summary.protocol', { value: profileSummary.protocol })}</div>
              <div>{t('vpn.summary.endpoint', { value: profileSummary.endpoint })}</div>
              <div>{t('vpn.summary.addresses', { value: profileSummary.addressCount })}</div>
              <div>{t('vpn.summary.dns', { value: profileSummary.dnsCount })}</div>
              <div>{t('vpn.summary.allowedIps', { value: profileSummary.allowedCount })}</div>
              <div>
                {t('vpn.summary.sourcePath', {
                  value: snapshot.profile?.sourcePath || t('vpn.common.notSet'),
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
