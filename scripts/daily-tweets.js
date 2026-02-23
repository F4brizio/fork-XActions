import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
const ACCOUNTS_MEDIA_DIR = path.join(DATA_DIR, 'accounts-multimedia');

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { }
}

// Dynamic import of the project's scrapers module using a file URL
const scrapersPath = path.join(ROOT, 'src', 'scrapers', 'index.js');
const scrapers = await import(pathToFileURL(scrapersPath).href);
const { createBrowser, createPage, loginWithCookie, scrapeTweets } = scrapers;

async function loadUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

async function loadConfigAuthToken() {
  try {
    const cfgPath = path.join(os.homedir(), '.xactions', 'config.json');
    const raw = await fs.readFile(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg.authToken || cfg.auth_token || process.env.XACTIONS_AUTH_TOKEN || null;
  } catch (e) {
    return process.env.XACTIONS_AUTH_TOKEN || null;
  }
}

function dedupeById(tweets) {
  const map = new Map();
  for (const t of tweets) {
    map.set(t.id, t);
  }
  return Array.from(map.values());
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function processOnce(options = {}) {
  const users = await loadUsers();
  if (!users || users.length === 0) {
    console.log('No users found in', USERS_FILE);
    return;
  }

  await ensureDir(DATA_DIR);
  await ensureDir(ACCOUNTS_DIR);
  await ensureDir(ACCOUNTS_MEDIA_DIR);

  const authToken = await loadConfigAuthToken();
  const browser = await createBrowser({ headless: true });
  console.log('Browser launched');

  for (const username of users) {
    console.log(`Processing ${username} ...`);
    try {
      const page = await createPage(browser);
      if (authToken) {
        try { await loginWithCookie(page, authToken); } catch (e) { /* ignore login errors */ }
      }

      const tweets = await scrapeTweets(page, username, { limit: 200 });

      const accFile = path.join(ACCOUNTS_DIR, `${username}.json`);
      let existing = [];
      try { existing = JSON.parse(await fs.readFile(accFile, 'utf8')); } catch (e) { existing = []; }

      const combined = dedupeById([...tweets, ...existing]);
      await writeJSON(accFile, combined);

      const mediaOnly = combined.filter(t => t.media && ((t.media.images && t.media.images.length>0) || t.media.hasVideo));
      const mediaFile = path.join(ACCOUNTS_MEDIA_DIR, `${username}.json`);
      await writeJSON(mediaFile, mediaOnly);

      console.log(`Saved ${combined.length} tweets (${mediaOnly.length} multimedia) for ${username}`);
    } catch (err) {
      console.error(`Error processing ${username}:`, err && err.message ? err.message : err);
    }

    const ms = 10000 + Math.floor(Math.random()*10000);
    console.log(`Waiting ${ms}ms before next account...`);
    await sleep(ms);
  }

  try { await browser.close(); } catch(e){}
  console.log('Run complete');
}

const args = process.argv.slice(2);
const once = args.includes('--once');
const intervalHours = parseFloat(process.env.RUN_INTERVAL_HOURS) || 24;

if (once) {
  await processOnce();
  process.exit(0);
}

(async function mainLoop(){
  while (true) {
    try { await processOnce(); } catch (e) { console.error('Run failed:', e); }
    console.log(`Sleeping ${intervalHours}h until next run`);
    await sleep(intervalHours * 60 * 60 * 1000);
  }
})();
