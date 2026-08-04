import { describe, expect, it } from 'vitest';
import { resolveServerConfig } from './server-config.js';

describe('server configuration', () => {
  it('defaults to the fixed loopback address and local port', () => {
    expect(resolveServerConfig({})).toEqual({ host: '127.0.0.1', port: 4300 });
  });

  it('refuses LAN and wildcard bindings', () => {
    expect(() => resolveServerConfig({ PM_HOST: '0.0.0.0' })).toThrow(/127\.0\.0\.1/);
    expect(() => resolveServerConfig({ PM_HOST: '192.168.1.10' })).toThrow(/LAN binding/);
  });

  it('accepts only a bounded non-privileged integer port', () => {
    expect(resolveServerConfig({ PM_API_PORT: '4310' }).port).toBe(4310);
    expect(() => resolveServerConfig({ PM_API_PORT: '80' })).toThrow(/1024/);
    expect(() => resolveServerConfig({ PM_API_PORT: '4300.5' })).toThrow(/integer/);
    expect(() => resolveServerConfig({ PM_API_PORT: '70000' })).toThrow(/65535/);
  });
});
