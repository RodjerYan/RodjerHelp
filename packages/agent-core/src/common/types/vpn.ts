export type VpnProtocol = 'awg' | 'wireguard';

export type VpnConnectionState =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface VpnProfile {
  name: string;
  protocol: VpnProtocol;
  privateKey: string;
  publicKey: string;
  presharedKey?: string;
  addresses: string[];
  dnsServers: string[];
  mtu?: number;
  endpointHost: string;
  endpointPort: number;
  allowedIps: string[];
  persistentKeepalive?: number;
  obfuscation: Partial<
    Record<
      | 'Jc'
      | 'Jmin'
      | 'Jmax'
      | 'S1'
      | 'S2'
      | 'S3'
      | 'S4'
      | 'H1'
      | 'H2'
      | 'H3'
      | 'H4'
      | 'I1'
      | 'I2'
      | 'I3'
      | 'I4'
      | 'I5',
      string
    >
  >;
  sourcePath?: string;
  updatedAt: string;
}

export interface VpnSettings {
  enabled: boolean;
  autoConnect: boolean;
  requireTunnel: boolean;
  killSwitch: boolean;
}

export interface VpnProfileSnapshot {
  profile: VpnProfile | null;
  rawConfig: string | null;
}

export interface VpnStatus {
  state: VpnConnectionState;
  serviceAvailable: boolean;
  clientAvailable: boolean;
  hasProfile: boolean;
  connectedAt?: string;
  endpoint?: string;
  publicKey?: string;
  deviceAddress?: string;
  txBytes?: number;
  rxBytes?: number;
  lastError?: string;
}
