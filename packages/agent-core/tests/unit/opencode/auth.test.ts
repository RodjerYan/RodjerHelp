import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getOpenCodeAuthJsonPath,
  getOpenCodeAuthPath,
  getOpenAiOauthStatus,
} from '../../../src/opencode/auth.js';
import { syncApiKeysToOpenCodeAuth } from '../../../src/opencode/config-builder.js';

describe('OpenCode auth helpers', () => {
  const originalXdgDataHome = process.env.XDG_DATA_HOME;
  let tempDataHome: string;

  beforeEach(() => {
    tempDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-auth-test-'));
    process.env.XDG_DATA_HOME = tempDataHome;
  });

  afterEach(() => {
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }

    if (fs.existsSync(tempDataHome)) {
      fs.rmSync(tempDataHome, { recursive: true, force: true });
    }
  });

  it('uses a single auth.json path consistently', () => {
    const expectedPath = path.join(tempDataHome, 'opencode', 'auth.json');

    expect(getOpenCodeAuthJsonPath()).toBe(expectedPath);
    expect(getOpenCodeAuthPath()).toBe(expectedPath);
  });

  it('overrides stale OpenAI OAuth auth with API key auth when syncing', async () => {
    const authPath = getOpenCodeAuthPath();
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.writeFileSync(
      authPath,
      JSON.stringify(
        {
          openai: {
            type: 'oauth',
            refresh: 'stale-refresh-token',
            access: 'stale-access-token',
            expires: Date.now() + 60_000,
          },
        },
        null,
        2,
      ),
    );

    await syncApiKeysToOpenCodeAuth(authPath, {
      openai: 'sk-test-openai',
    });

    const synced = JSON.parse(fs.readFileSync(authPath, 'utf8')) as Record<string, unknown>;
    expect(synced.openai).toEqual({
      type: 'api',
      key: 'sk-test-openai',
    });
    expect(getOpenAiOauthStatus()).toEqual({ connected: false });
  });
});
