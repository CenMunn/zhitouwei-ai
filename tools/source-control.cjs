#!/usr/bin/env node
'use strict';
// Local setup and production launcher.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync, spawn} = require('node:child_process');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const action = process.argv[2] || 'help';
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Use Node.js 24 or later. V17 was validated with Node.js 24.');
  process.exit(1);
}
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const port = String(process.env.PORT || '3000');
if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535) throw new Error('Invalid PORT');
const dbUrl = process.env.DATABASE_URL || 'file:./db/application.db';
if (!dbUrl.startsWith('file:') || dbUrl.includes('?')) throw new Error('This source launcher expects a local SQLite file: URL.');
const dbPath = path.resolve(root, dbUrl.slice(5));
const buildDir = process.env.NEXT_BUILD_DIR || '.next-postreview';
const env = {
  ...process.env,
  DATABASE_URL: 'file:' + dbPath.replaceAll('\\', '/'),
  AUTH_DATABASE_PATH: dbPath,
  FILINGS_DATA_DIR: path.resolve(root, process.env.FILINGS_DATA_DIR || './db/filing-documents'),
  NEXT_BUILD_DIR: buildDir,
  NEXT_TELEMETRY_DISABLED: '1',
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://127.0.0.1:' + port,
  PORT: port,
  HOSTNAME: process.env.APP_BIND_HOST || '127.0.0.1',
  FILINGS_PROVIDER: process.env.FILINGS_PROVIDER || 'deepseek',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  FILINGS_RETRY_POLICY: process.env.FILINGS_RETRY_POLICY || 'no_content_only'
};
function cli(relative, args) {
  const script = path.join(root, relative);
  if (!fs.existsSync(script)) throw new Error('Missing ' + relative + '. Install locked dependencies first.');
  const r = spawnSync(process.execPath, [script, ...args], {cwd: root, env, stdio: 'inherit', windowsHide: true});
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
function serve(relative, args = []) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error('Missing server; run init and build first.');
  const child = spawn(process.execPath, [target, ...args], {cwd: root, env, stdio: 'inherit', windowsHide: true});
  child.on('error', e => { console.error(e.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code || 0; });
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}
function stageStandaloneAssets() {
  const standalone = path.join(root, buildDir, 'standalone');
  if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Standalone server was not generated.');
  fs.cpSync(path.join(root, buildDir, 'static'), path.join(standalone, buildDir, 'static'), {recursive: true});
  fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), {recursive: true});
  // Next NFT tracing omits the ESM PDF entry under pnpm on this release.
  // Preserve complete installed PDF packages, including workers/fonts/CMaps.
  const copied = new Map();
  function resolvePackage(from, name) {
    const localRequire = createRequire(path.join(from, 'package.json'));
    try { return fs.realpathSync(path.dirname(localRequire.resolve(name + '/package.json'))); }
    catch {
      let dir = path.dirname(localRequire.resolve(name));
      while (dir !== path.dirname(dir)) {
        const meta = path.join(dir, 'package.json');
        if (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, 'utf8')).name === name) return fs.realpathSync(dir);
        dir = path.dirname(dir);
      }
      throw new Error('Cannot locate dependency: ' + name);
    }
  }
  function copyPackage(name, source) {
    if (copied.has(name)) {
      if (copied.get(name) !== source) throw new Error('PDF dependency version collision: ' + name);
      return;
    }
    copied.set(name, source);
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    const target = path.join(standalone, 'node_modules', name);
    // Replace only the generated package link, never its installed target.
    let stat;
    try { stat = fs.lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) fs.unlinkSync(target);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.cpSync(source, target, {recursive: true, dereference: true});
    for (const child of Object.keys({...pkg.dependencies, ...pkg.optionalDependencies})) {
      let dependency;
      try { dependency = resolvePackage(source, child); }
      catch (error) { if (Object.hasOwn(pkg.optionalDependencies || {}, child)) continue; throw error; }
      copyPackage(child, dependency);
    }
  }
  for (const name of ['pdfjs-dist', 'pdf-parse']) copyPackage(name, fs.realpathSync(path.join(root, 'node_modules', name)));
}
if (action === 'init') {
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.mkdirSync(env.FILINGS_DATA_DIR, {recursive: true});
  cli('node_modules/prisma/build/index.js', ['generate']);
  // No --accept-data-loss: schema conflicts require the operator to decide.
  cli('node_modules/prisma/build/index.js', ['db', 'push', '--skip-generate']);
  cli('scripts/setup-auth.mjs', []);
  cli('tools/seed-public-universe.cjs', []);
  console.log('Database initialized. Initial administrator credentials: .local/admin-credentials.json');
} else if (action === 'dev') {
  env.NODE_ENV = 'development';
  serve('node_modules/next/dist/bin/next', ['dev', '--webpack', '--hostname', env.HOSTNAME, '-p', port]);
} else if (action === 'build') {
  env.NODE_ENV = 'production';
  cli('node_modules/next/dist/bin/next', ['build', '--webpack']);
  stageStandaloneAssets();
  console.log('Production build completed.');
} else if (action === 'pack-assets') {
  stageStandaloneAssets();
  console.log('Standalone static assets and PDF dependencies copied.');
} else if (action === 'start') {
  env.NODE_ENV = 'production';
  serve(buildDir + '/standalone/server.js');
} else {
  console.log('node tools/source-control.cjs init|dev|build|start');
  console.log('Install locked dependencies and copy .env.example to .env before init.');
}

