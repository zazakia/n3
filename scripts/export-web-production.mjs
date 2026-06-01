import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

const outputDir = 'dist';
const expoVectorIconFontAssetPath = 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts';
const cloudflareSafeIconFontAssetPath = 'assets/icon-fonts';

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

function writeCloudflarePagesFiles(outputDirectory, envVars) {
  const supabaseUrl = new URL(envVars.EXPO_PUBLIC_SUPABASE_URL);
  const supabaseOrigin = supabaseUrl.origin;
  const supabaseWsOrigin = `wss://${supabaseUrl.host}`;
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`,
    'upgrade-insecure-requests',
  ].join('; ');

  writeFileSync(
    `${outputDirectory}/_redirects`,
    '/* /index.html 200\n'
  );

  writeFileSync(
    `${outputDirectory}/_headers`,
    [
      '/_expo/static/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '  Access-Control-Allow-Origin: *',
      '',
      '/assets/icon-fonts/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '  Access-Control-Allow-Origin: *',
      '',
      '/*',
      `  Content-Security-Policy: ${csp}`,
      '  X-Content-Type-Options: nosniff',
      '  X-Frame-Options: DENY',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
      '',
    ].join('\n')
  );
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = `${directory}/${entry}`;
    return statSync(entryPath).isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function rewriteExpoVectorIconFontPaths(outputDirectory) {
  const originalFontDirectory = `${outputDirectory}/${expoVectorIconFontAssetPath}`;
  if (!existsSync(originalFontDirectory)) {
    throw new Error(`[export-web-production] Missing Expo vector icon font directory: ${originalFontDirectory}`);
  }

  const safeFontDirectory = `${outputDirectory}/${cloudflareSafeIconFontAssetPath}`;
  mkdirSync(safeFontDirectory, { recursive: true });

  for (const fontFilePath of readdirSync(originalFontDirectory)) {
    if (!fontFilePath.endsWith('.ttf')) {
      continue;
    }
    copyFileSync(`${originalFontDirectory}/${fontFilePath}`, `${safeFontDirectory}/${fontFilePath}`);
  }

  const staticJsDirectory = `${outputDirectory}/_expo/static/js`;
  const jsBundlePaths = listFiles(staticJsDirectory).filter((filePath) => filePath.endsWith('.js'));
  const originalAssetUrl = `/${expoVectorIconFontAssetPath}`;
  const safeAssetUrl = `/${cloudflareSafeIconFontAssetPath}`;

  for (const jsBundlePath of jsBundlePaths) {
    const bundle = readFileSync(jsBundlePath, 'utf8');
    const rewrittenBundle = bundle.split(originalAssetUrl).join(safeAssetUrl);
    writeFileSync(jsBundlePath, rewrittenBundle);
  }
}

const productionEnvPath = '.env.production';
const localEnvPath = '.env.local';

const originalLocalEnv = existsSync(localEnvPath) ? readFileSync(localEnvPath, 'utf8') : null;
const productionEnv = existsSync(productionEnvPath)
  ? readFileSync(productionEnvPath, 'utf8')
  : [
      `EXPO_PUBLIC_SUPABASE_URL=${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY=${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
    ].join('\n');
const productionVars = parseEnvFile(productionEnv);

if (!productionVars.EXPO_PUBLIC_SUPABASE_URL || !productionVars.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.error(
    `[export-web-production] Missing ${productionEnvPath} and required EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables`
  );
  process.exit(1);
}

try {
  writeFileSync(localEnvPath, productionEnv);

  const isWindows = process.platform === 'win32';
  const expoExportArgs = ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', outputDir];
  const result = spawnSync(
    isWindows ? 'cmd.exe' : 'npx',
    isWindows ? ['/d', '/s', '/c', 'npx', ...expoExportArgs] : expoExportArgs,
    {
      stdio: 'inherit',
      shell: false,
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
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    rewriteExpoVectorIconFontPaths(outputDir);
    writeCloudflarePagesFiles(outputDir, productionVars);
    process.exitCode = 0;
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
