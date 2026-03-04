#!/usr/bin/env node

/**
 * Validates the .claude/settings.json hook configuration format.
 *
 * The correct format uses a nested `hooks` array inside each matcher group:
 *
 *   {
 *     "hooks": {
 *       "PreToolUse": [
 *         {
 *           "matcher": "Write|Edit",
 *           "hooks": [
 *             { "type": "command", "command": "bash script.sh" }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Common mistake: putting "command" or "type" directly in the matcher object
 * (flat format) instead of inside the nested "hooks" array.
 *
 * Usage:
 *   node scripts/validate-hooks.mjs
 *
 * Exit codes:
 *   0 — valid
 *   1 — invalid or missing file
 */

const VALID_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
];

const VALID_HOOK_TYPES = ['command', 'prompt', 'agent'];

/**
 * Validate a Claude Code hooks configuration object.
 * @param {unknown} config - Parsed JSON from .claude/settings.json
 * @returns {string[]} Array of error messages (empty = valid)
 */
export function validateHooksConfig(config) {
  const errors = [];

  if (typeof config !== 'object' || config === null) {
    errors.push('Config must be a JSON object.');
    return errors;
  }

  // No hooks key is fine — nothing to validate
  if (!('hooks' in config)) {
    return errors;
  }

  const hooks = config.hooks;
  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) {
    errors.push('"hooks" must be an object mapping event names to matcher arrays.');
    return errors;
  }

  for (const [eventName, matcherGroups] of Object.entries(hooks)) {
    if (!VALID_EVENTS.includes(eventName)) {
      errors.push(
        `Invalid event name "${eventName}". Valid events: ${VALID_EVENTS.join(', ')}`,
      );
      continue;
    }

    if (!Array.isArray(matcherGroups)) {
      errors.push(
        `hooks.${eventName} must be an array of matcher groups.`,
      );
      continue;
    }

    for (let i = 0; i < matcherGroups.length; i++) {
      const group = matcherGroups[i];
      const prefix = `hooks.${eventName}[${i}]`;

      if (typeof group !== 'object' || group === null) {
        errors.push(`${prefix} must be an object.`);
        continue;
      }

      // Check for the common flat-format mistake
      if ('command' in group || ('type' in group && !('hooks' in group))) {
        errors.push(
          `${prefix}: Found "command" or "type" at the matcher level. ` +
          `This is the flat format which is WRONG. ` +
          `Move them inside a nested "hooks" array. Correct format:\n` +
          `  { "matcher": "...", "hooks": [{ "type": "command", "command": "..." }] }`,
        );
        continue;
      }

      if (typeof group.matcher !== 'string') {
        errors.push(`${prefix}: Missing or invalid "matcher" (must be a string regex pattern).`);
      }

      if (!('hooks' in group)) {
        errors.push(
          `${prefix}: Missing "hooks" array. Each matcher group must contain a "hooks" array with hook definitions.`,
        );
        continue;
      }

      if (!Array.isArray(group.hooks)) {
        errors.push(`${prefix}.hooks must be an array of hook definitions.`);
        continue;
      }

      for (let j = 0; j < group.hooks.length; j++) {
        const hook = group.hooks[j];
        const hookPrefix = `${prefix}.hooks[${j}]`;

        if (typeof hook !== 'object' || hook === null) {
          errors.push(`${hookPrefix} must be an object.`);
          continue;
        }

        if (!hook.type || !VALID_HOOK_TYPES.includes(hook.type)) {
          errors.push(
            `${hookPrefix}: Missing or invalid "type". Valid types: ${VALID_HOOK_TYPES.join(', ')}`,
          );
          continue;
        }

        if (hook.type === 'command' && typeof hook.command !== 'string') {
          errors.push(`${hookPrefix}: Hook type "command" requires a "command" string field.`);
        }

        if (hook.type === 'prompt' && typeof hook.prompt !== 'string') {
          errors.push(`${hookPrefix}: Hook type "prompt" requires a "prompt" string field.`);
        }

        if (hook.type === 'agent' && typeof hook.prompt !== 'string') {
          errors.push(`${hookPrefix}: Hook type "agent" requires a "prompt" string field.`);
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when invoked directly
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/validate-hooks.mjs') ||
   process.argv[1].endsWith('\\validate-hooks.mjs'));

if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const settingsPath =
    process.argv[2] || path.join(process.cwd(), '.claude', 'settings.json');

  let content;
  try {
    content = fs.readFileSync(settingsPath, 'utf-8');
  } catch (err) {
    console.error(`ERROR: Cannot read ${settingsPath}: ${err.message}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(content);
  } catch (err) {
    console.error(`ERROR: Invalid JSON in ${settingsPath}: ${err.message}`);
    process.exit(1);
  }

  const errors = validateHooksConfig(config);

  if (errors.length === 0) {
    console.log(`OK: ${settingsPath} hooks format is valid.`);
    process.exit(0);
  } else {
    console.error(`FAIL: ${settingsPath} has ${errors.length} validation error(s):\n`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    console.error(
      '\nSee CLAUDE.md "Claude Code Hooks" section for the correct format.',
    );
    process.exit(1);
  }
}
