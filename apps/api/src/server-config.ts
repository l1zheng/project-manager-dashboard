export interface ServerConfig {
  host: '127.0.0.1';
  port: number;
}

export function resolveServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = environment.PM_HOST?.trim() || '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error('PM_HOST must be 127.0.0.1; LAN binding is not supported.');
  }

  const portText = environment.PM_API_PORT?.trim() || '4300';
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PM_API_PORT must be an integer from 1024 through 65535.');
  }
  return { host, port };
}
