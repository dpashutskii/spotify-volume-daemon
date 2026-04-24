#!/usr/bin/env node
/**
 * Spotify Volume Daemon
 * Watches for Spotify switching to your soundbar and clamps the volume.
 *
 * Place this file at: ~/.spotify-daemon/daemon.js
 * Config is read from:  ~/.spotify-daemon/config.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME, '.spotify-daemon');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PID_FILE = path.join(CONFIG_DIR, 'daemon.pid');
const LOG_FILE = path.join(CONFIG_DIR, 'daemon.log');

// ─── Bootstrap ────────────────────────────────────────────────────────────────

if (!fs.existsSync(CONFIG_FILE)) {
  console.error(`❌ Config not found at ${CONFIG_FILE}. Run setup.js first.`);
  process.exit(1);
}

fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.writeFileSync(PID_FILE, String(process.pid));

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function cleanup() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

process.on('exit', cleanup);
process.on('SIGTERM', () => { log('Received SIGTERM, shutting down.'); process.exit(0); });
process.on('SIGINT',  () => { log('Received SIGINT, shutting down.'); process.exit(0); });

// ─── Spotify Auth ─────────────────────────────────────────────────────────────

let accessToken = null;
let tokenExpiry = 0;

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (!data || res.statusCode === 204) return resolve({ status: res.statusCode, body: null });
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
  }).toString();

  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const { body: json, status } = await httpRequest(
    {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );

  if (!json?.access_token) {
    throw new Error(`Token refresh failed (${status}): ${JSON.stringify(json)}`);
  }

  accessToken = json.access_token;
  tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  log('🔑 Access token refreshed');
}

async function getToken() {
  if (!accessToken || Date.now() > tokenExpiry) {
    await refreshAccessToken();
  }
  return accessToken;
}

// ─── Spotify API ──────────────────────────────────────────────────────────────

async function spotifyGet(apiPath) {
  const token = await getToken();
  const { body, status } = await httpRequest({
    hostname: 'api.spotify.com',
    path: apiPath,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status === 401) {
    // Token expired mid-cycle, force refresh next time
    accessToken = null;
    return null;
  }
  return body;
}

async function spotifyPut(apiPath, params = {}) {
  const token = await getToken();
  const query = Object.keys(params).length
    ? '?' + new URLSearchParams(params).toString()
    : '';
  const { status } = await httpRequest({
    hostname: 'api.spotify.com',
    path: apiPath + query,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Length': '0',
    },
  });
  return status;
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let lastDeviceId = null;
let consecutiveErrors = 0;
const MAX_ERRORS = 10;

async function poll() {
  try {
    const player = await spotifyGet('/v1/me/player');

    if (!player || !player.device) {
      // Nothing playing or Spotify closed
      if (lastDeviceId !== null) {
        log('No active playback detected');
        lastDeviceId = null;
      }
      consecutiveErrors = 0;
      return;
    }

    const { device } = player;
    const isTargetDevice = device.name
      .toLowerCase()
      .includes(config.deviceName.toLowerCase());

    if (isTargetDevice) {
      if (device.id !== lastDeviceId) {
        // Just switched to the soundbar
        const currentVol = device.volume_percent;
        log(`🔊 Device switched to "${device.name}" — current volume: ${currentVol}`);

        if (currentVol > config.targetVolume) {
          const status = await spotifyPut('/v1/me/player/volume', {
            volume_percent: config.targetVolume,
          });
          if (status === 204) {
            log(`✅ Volume clamped: ${currentVol} → ${config.targetVolume}`);
          } else {
            log(`⚠️  Volume set returned unexpected status: ${status}`);
          }
        } else {
          log(`Volume already at ${currentVol} (≤ target ${config.targetVolume}), no change`);
        }
      }
      lastDeviceId = device.id;
    } else {
      // Active device is not the soundbar
      if (lastDeviceId !== null) {
        log(`📻 Active device is now "${device.name}" (not soundbar), standing by`);
        lastDeviceId = null;
      }
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    log(`⚠️  Error (${consecutiveErrors}/${MAX_ERRORS}): ${err.message}`);
    if (consecutiveErrors >= MAX_ERRORS) {
      log('❌ Too many consecutive errors, shutting down daemon');
      process.exit(1);
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

log(`🎵 Spotify daemon started — PID: ${process.pid}`);
log(`   Watching for device: "${config.deviceName}"`);
log(`   Target volume:       ${config.targetVolume}`);
log(`   Poll interval:       3s`);

// Run immediately, then every 3s
poll();
setInterval(poll, 3000);
