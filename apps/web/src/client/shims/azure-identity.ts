// Браузерный shim для @azure/identity.
// Реальный пакет ориентирован на Node и не должен попадать в web/renderer сборку.

export class DefaultAzureCredential {
  constructor(..._args: unknown[]) {
    throw new Error('@azure/identity не поддерживается в браузерной сборке.');
  }
}

export class AzureCliCredential {
  constructor(..._args: unknown[]) {
    throw new Error('@azure/identity не поддерживается в браузерной сборке.');
  }
}

export class ClientSecretCredential {
  constructor(..._args: unknown[]) {
    throw new Error('@azure/identity не поддерживается в браузерной сборке.');
  }
}

export class ManagedIdentityCredential {
  constructor(..._args: unknown[]) {
    throw new Error('@azure/identity не поддерживается в браузерной сборке.');
  }
}
