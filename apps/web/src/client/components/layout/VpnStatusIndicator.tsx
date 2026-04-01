import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VpnStatus } from '@accomplish_ai/agent-core';
import { ArrowsClockwise, ShieldCheck, ShieldSlash, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { isRunningInElectron, getRodjerHelp } from '@/lib/rodjerhelp';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 15000;

const EMPTY_STATUS: VpnStatus = {
  state: 'disconnected',
  serviceAvailable: false,
  clientAvailable: false,
  hasProfile: false,
};

function getStatusPresentation(
  status: VpnStatus,
  t: (key: string) => string,
): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  if (!status.hasProfile) {
    return {
      label: t('common:vpnStatus.notConfigured'),
      className: 'border-border/70 bg-white/72 text-muted-foreground',
      icon: <ShieldSlash className="h-3.5 w-3.5" weight="duotone" />,
    };
  }

  if (status.state === 'connected') {
    return {
      label: t('settings:vpn.states.connected'),
      className: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700',
      icon: <ShieldCheck className="h-3.5 w-3.5" weight="duotone" />,
    };
  }

  if (status.state === 'connecting' || status.state === 'disconnecting') {
    return {
      label: t(`settings:vpn.states.${status.state}`),
      className: 'border-sky-500/35 bg-sky-500/12 text-sky-700',
      icon: <ArrowsClockwise className="h-3.5 w-3.5 animate-spin" />,
    };
  }

  if (status.state === 'error') {
    return {
      label: t('settings:vpn.states.error'),
      className: 'border-destructive/40 bg-destructive/10 text-destructive',
      icon: <WarningCircle className="h-3.5 w-3.5" weight="fill" />,
    };
  }

  if (status.state === 'unsupported' || !status.clientAvailable || !status.serviceAvailable) {
    return {
      label: t('common:vpnStatus.unavailable'),
      className: 'border-border/70 bg-white/72 text-muted-foreground',
      icon: <WarningCircle className="h-3.5 w-3.5" weight="duotone" />,
    };
  }

  return {
    label: t('settings:vpn.states.disconnected'),
    className: 'border-amber-500/35 bg-amber-500/12 text-amber-700',
    icon: <ShieldSlash className="h-3.5 w-3.5" weight="duotone" />,
  };
}

export function VpnStatusIndicator({ className }: { className?: string }) {
  const { t } = useTranslation(['common', 'settings']);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VpnStatus>(EMPTY_STATUS);

  const refreshStatus = useCallback(async () => {
    if (!isRunningInElectron() || !window.accomplish?.getVpnStatus) {
      setLoading(false);
      return;
    }

    try {
      const nextStatus = await getRodjerHelp().getVpnStatus?.();
      if (nextStatus) {
        setStatus(nextStatus);
      }
    } catch {
      // Keep the last known value to avoid flickering on temporary IPC issues.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isRunningInElectron() || !window.accomplish?.getVpnStatus) {
      return;
    }

    void refreshStatus();

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);

    const handleFocus = () => {
      void refreshStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshStatus]);

  const presentation = useMemo(() => getStatusPresentation(status, t), [status, t]);

  if (!isRunningInElectron() || !window.accomplish?.getVpnStatus) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'pointer-events-auto gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.01em] shadow-[0_10px_20px_rgba(44,74,132,0.14)] backdrop-blur-md',
        loading ? 'border-border/70 bg-white/72 text-muted-foreground' : presentation.className,
        className,
      )}
    >
      {loading ? <ArrowsClockwise className="h-3.5 w-3.5 animate-spin" /> : presentation.icon}
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">VPN</span>
      <span>{loading ? t('common:buttons.testing') : presentation.label}</span>
    </Badge>
  );
}
