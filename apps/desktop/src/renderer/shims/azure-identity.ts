// Browser/renderer shim for @azure/identity (Node-only in many bundling contexts).
// If Azure auth is needed, it must be executed in the Electron main/Node side.
export class DefaultAzureCredential {
  constructor(..._args: unknown[]) {
    throw new Error(
      '@azure/identity is not available in the renderer bundle. Use Electron main/Node side.',
    );
  }
}
export class AzureCliCredential {
  constructor(..._args: unknown[]) {
    throw new Error(
      '@azure/identity is not available in the renderer bundle. Use Electron main/Node side.',
    );
  }
}
export class ClientSecretCredential {
  constructor(..._args: unknown[]) {
    throw new Error(
      '@azure/identity is not available in the renderer bundle. Use Electron main/Node side.',
    );
  }
}
export class ManagedIdentityCredential {
  constructor(..._args: unknown[]) {
    throw new Error(
      '@azure/identity is not available in the renderer bundle. Use Electron main/Node side.',
    );
  }
}
