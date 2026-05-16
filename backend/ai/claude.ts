import { spawnSync } from 'node:child_process';

export type ClaudeDetection = {
  available: boolean;
  binaryPath: string | null;
  version: string | null;
};

export function detectClaude(env: NodeJS.ProcessEnv = process.env): ClaudeDetection {
  const binaryPath = Bun.which('claude', { PATH: env.PATH ?? env.Path ?? '' });
  if (!binaryPath) return { available: false, binaryPath: null, version: null };

  const probe = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 2000,
  });
  const version =
    probe.status === 0 ? (probe.stdout?.toString().trim().split('\n')[0] ?? null) : null;

  return { available: true, binaryPath, version };
}

export type RunClaudeArgs = {
  binaryPath: string;
  configDir: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 180_000;

export async function runClaude(args: RunClaudeArgs): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const env = { ...process.env };
    if (args.configDir) env.CLAUDE_CONFIG_DIR = args.configDir;
    const proc = Bun.spawn([args.binaryPath, '--print', '--model', args.model], {
      env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: ac.signal,
    });
    proc.stdin.write(args.prompt);
    await proc.stdin.end();
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500);
      throw new Error(`claude exited ${exitCode}: ${tail || 'no stderr output'}`);
    }
    return stdout.trim();
  } finally {
    clearTimeout(timer);
  }
}
