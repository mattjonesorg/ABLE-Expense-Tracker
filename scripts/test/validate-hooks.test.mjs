import { describe, it, expect } from 'vitest';
import { validateHooksConfig } from '../validate-hooks.mjs';

describe('validateHooksConfig', () => {
  it('accepts a valid hooks configuration', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [
              {
                type: 'command',
                command: 'bash .claude/hooks/check-secrets-pretooluse.sh',
              },
            ],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors).toEqual([]);
  });

  it('accepts config with no hooks key', () => {
    const config = { env: { SOME_VAR: '1' } };
    const errors = validateHooksConfig(config);
    expect(errors).toEqual([]);
  });

  it('accepts config with multiple event types', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        ],
        SubagentStop: [
          {
            matcher: '.*',
            hooks: [
              { type: 'agent', prompt: 'Review changes', model: 'claude-sonnet-4-6' },
            ],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors).toEqual([]);
  });

  it('rejects hooks that is not an object', () => {
    const config = { hooks: 'invalid' };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('hooks');
  });

  it('rejects invalid event name', () => {
    const config = {
      hooks: {
        InvalidEvent: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('InvalidEvent');
  });

  it('rejects event value that is not an array', () => {
    const config = {
      hooks: {
        PreToolUse: { matcher: 'Write', hooks: [] },
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('array');
  });

  it('rejects matcher group missing matcher field', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('matcher');
  });

  it('rejects matcher group missing nested hooks array', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('hooks');
  });

  it('detects the common flat-format mistake: command at matcher level', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
            type: 'command',
            command: 'bash .claude/hooks/check-secrets-pretooluse.sh',
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('command'))).toBe(true);
    expect(errors.some((e) => e.includes('hooks'))).toBe(true);
  });

  it('rejects hook entry missing type', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ command: 'echo test' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('type');
  });

  it('rejects hook entry with invalid type', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'invalid', command: 'echo test' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('type');
  });

  it('rejects command hook missing command field', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('command');
  });

  it('rejects prompt hook missing prompt field', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'prompt' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('prompt');
  });

  it('rejects agent hook missing prompt field', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'agent' }],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('prompt');
  });

  it('accepts agent hook with prompt and model', () => {
    const config = {
      hooks: {
        SubagentStop: [
          {
            matcher: '.*',
            hooks: [
              {
                type: 'agent',
                prompt: 'Review changes',
                model: 'claude-sonnet-4-6',
                statusMessage: 'Reviewing...',
              },
            ],
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors).toEqual([]);
  });

  it('rejects nested hooks that is not an array', () => {
    const config = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: { type: 'command', command: 'echo test' },
          },
        ],
      },
    };
    const errors = validateHooksConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('array');
  });

  it('validates the actual .claude/settings.json file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const settingsPath = path.join(
      process.cwd(),
      '.claude',
      'settings.json',
    );

    let content;
    try {
      content = fs.readFileSync(settingsPath, 'utf-8');
    } catch {
      // File might not exist in CI — skip
      return;
    }

    const config = JSON.parse(content);
    const errors = validateHooksConfig(config);
    expect(errors).toEqual([]);
  });
});
