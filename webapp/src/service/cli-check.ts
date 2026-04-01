import { execFile } from 'node:child_process';
import { env } from '../lib/env.ts';
import { type Result, ok, err } from '../lib/result.ts';

function run(cmd: string, args: string[]): Promise<Result<string>> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(err(error.message));
        return;
      }
      resolve(ok(stdout.trim()));
    });
  });
}

export interface CliStatus {
  installed: boolean;
  version: string | undefined;
  authenticated: boolean;
}

export async function checkCli(): Promise<CliStatus> {
  const versionResult = await run(env.CLAUDE_PATH, ['--version']);

  if (!versionResult.ok) {
    return { installed: false, version: undefined, authenticated: false };
  }

  const authResult = await run(env.CLAUDE_PATH, ['auth', 'status']);
  const authenticated = authResult.ok && !authResult.data.includes('not logged in');

  return {
    installed: true,
    version: versionResult.data,
    authenticated,
  };
}
