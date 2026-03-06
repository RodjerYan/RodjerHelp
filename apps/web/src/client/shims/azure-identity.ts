// Browser shim for @azure/identity.
// The real package is Node-focused and should not be bundled into the web/renderer build.

export class DefaultAzureCredential {
  constructor(..._args: any[]) {
    throw new Error('@azure/identity is not supported in the browser build.');
  }
}

export class AzureCliCredential {
  constructor(..._args: any[]) {
    throw new Error('@azure/identity is not supported in the browser build.');
  }
}

export class ClientSecretCredential {
  constructor(..._args: any[]) {
    throw new Error('@azure/identity is not supported in the browser build.');
  }
}

export class ManagedIdentityCredential {
  constructor(..._args: any[]) {
    throw new Error('@azure/identity is not supported in the browser build.');
  }
}
