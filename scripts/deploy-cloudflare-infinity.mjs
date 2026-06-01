import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PROJECT_NAME = 'infinity-finance';
const FORBIDDEN_PROJECT_NAME = 'delcante';
const OUTPUT_DIR = 'dist';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'pipe',
    shell: false,
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(output || `${command} ${args.join(' ')} failed with exit ${result.status}`);
  }

  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function runNpx(args, options = {}) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', 'npx', ...args], options);
  }

  return run('npx', args, options);
}

function assertInfinityProjectOnly() {
  if (process.argv.slice(2).some((arg) => arg.toLowerCase().includes(FORBIDDEN_PROJECT_NAME))) {
    throw new Error(`Refusing to deploy: this script is hard-locked to ${PROJECT_NAME}, not ${FORBIDDEN_PROJECT_NAME}.`);
  }

  const configuredProject = process.env.CLOUDFLARE_PAGES_PROJECT_NAME;
  if (configuredProject && configuredProject !== PROJECT_NAME) {
    throw new Error(`Refusing to deploy to ${configuredProject}; expected ${PROJECT_NAME}.`);
  }

  const projectList = runNpx(['wrangler', 'pages', 'project', 'list']);

  if (!new RegExp(`\\b${PROJECT_NAME}\\b`).test(projectList)) {
    throw new Error(`Cloudflare Pages project ${PROJECT_NAME} was not found.`);
  }

  if (!new RegExp(`\\b${FORBIDDEN_PROJECT_NAME}\\b`).test(projectList)) {
    console.warn(`[deploy-cloudflare-infinity] ${FORBIDDEN_PROJECT_NAME} not listed; continuing with ${PROJECT_NAME}.`);
  }
}

function assertBuildOutputReady() {
  const requiredFiles = [
    `${OUTPUT_DIR}/index.html`,
    `${OUTPUT_DIR}/_headers`,
    `${OUTPUT_DIR}/_redirects`,
  ];
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));

  if (missingFiles.length > 0) {
    throw new Error(`Missing Cloudflare build files: ${missingFiles.join(', ')}. Run npm run export:web:production first.`);
  }
}

assertInfinityProjectOnly();
assertBuildOutputReady();

runNpx(
  [
    'wrangler',
    'pages',
    'deploy',
    OUTPUT_DIR,
    '--project-name',
    PROJECT_NAME,
    '--branch',
    'main',
    '--commit-dirty=true',
  ],
  { stdio: 'inherit' }
);
