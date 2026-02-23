#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
const ACCOUNTS_MEDIA_DIR = path.join(DATA_DIR, 'accounts-multimedia');

async function loadUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function runDailyOnce() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/daily-tweets.js', '--once'], { stdio: 'inherit' });
    p.on('close', (code) => {
      if (code === 0) resolve(); else reject(new Error(`daily-tweets exited ${code}`));
    });
    p.on('error', reject);
  });
}

async function verifyFiles() {
  const users = await loadUsers();
  if (!users.length) throw new Error('No users in data/users.json');
  for (const u of users) {
    const acc = path.join(ACCOUNTS_DIR, `${u}.json`);
    const media = path.join(ACCOUNTS_MEDIA_DIR, `${u}.json`);
    try {
      await fs.access(acc);
      await fs.access(media);
      console.log(`OK: ${u} -> ${acc} ${media}`);
    } catch (e) {
      throw new Error(`Missing expected files for ${u}`);
    }
  }
}

(async function main(){
  try {
    console.log('Running daily-tweets.js --once...');
    await runDailyOnce();
    console.log('Verifying generated files...');
    await verifyFiles();
    console.log('Verification successful');
    process.exit(0);
  } catch (e) {
    console.error('Verification failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
