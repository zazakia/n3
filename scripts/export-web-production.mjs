import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

function parseEnvFile(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      acc[key] = value;
      return acc;
    }, {});
}

const productionEnvPath = '.env.production';
const localEnvPath = '.env.local';

if (!existsSync(productionEnvPath)) {
  console.error(`[export-web-production] Missing ${productionEnvPath}`);
  process.exit(1);
}

const originalLocalEnv = existsSync(localEnvPath) ? readFileSync(localEnvPath, 'utf8') : null;
const productionEnv = readFileSync(productionEnvPath, 'utf8');
const productionVars = parseEnvFile(productionEnv);

try {
  writeFileSync(localEnvPath, productionEnv);

  const isWindows = process.platform === 'win32';
  const result = spawnSync(
    isWindows ? 'npx.cmd expo export --platform web --clear' : 'npx',
    isWindows ? [] : ['expo', 'export', '--platform', 'web', '--clear'],
    {
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      ...productionVars,
      NODE_ENV: 'production',
    },
    }
  );

  if (result.error) {
    console.error('[export-web-production] Expo export failed to start:', result.error);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (originalLocalEnv === null) {
    if (existsSync(localEnvPath)) {
      unlinkSync(localEnvPath);
    }
  } else {
    writeFileSync(localEnvPath, originalLocalEnv);
  }
}
