#!/usr/bin/env node
/**
 * Spotify Daemon — Setup
 * Run once to authenticate and save config to ~/.spotify-daemon/config.json
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const CONFIG_DIR = path.join(process.env.HOME, '.spotify-daemon');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function exchangeCode(clientId, clientSecret, code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }).toString();

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('\n🎵  Spotify Volume Daemon — Setup\n');
  console.log('You need a Spotify app. Create one at:');
  console.log('  https://developer.spotify.com/dashboard\n');
  console.log('Steps:');
  console.log('  1. Click "Create app"');
  console.log('  2. Set Redirect URI to: http://127.0.0.1:8888/callback');
  console.log('  3. Copy Client ID and Client Secret below\n');

  const clientId = (await ask('Client ID:     ')).trim();
  const clientSecret = (await ask('Client Secret: ')).trim();

  console.log('\nOpen Spotify on your phone or desktop and start playing something.');
  console.log('Then check: Devices → what is the exact name of your soundbar?\n');
  const deviceName = (await ask('Soundbar name (as shown in Spotify): ')).trim();
  const targetVolumeStr = (await ask('Target volume when Spotify connects (recommended: 5): ')).trim();
  const targetVolume = parseInt(targetVolumeStr, 10) || 5;

  rl.close();

  const redirectUri = 'http://127.0.0.1:8888/callback';
  const scope = 'user-read-playback-state user-modify-playback-state';

  const authUrl =
    `https://accounts.spotify.com/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}`;

  console.log('\n🌐 Opening Spotify auth in your browser...');
  exec(`open "${authUrl}"`);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/callback') {
        if (parsed.query.error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h2>❌ Auth failed. Close this and check the terminal.</h2>');
          server.close();
          reject(new Error(`Auth error: ${parsed.query.error}`));
          return;
        }
        if (parsed.query.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h2>✅ Auth successful! You can close this tab.</h2>');
          server.close();
          resolve(parsed.query.code);
        }
      }
    });
    server.listen(8888);
    console.log('⏳ Waiting for Spotify to redirect...\n');
  });

  console.log('🔑 Exchanging code for tokens...');
  const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri);

  if (!tokens.refresh_token) {
    console.error('❌ Failed to get refresh token:', JSON.stringify(tokens, null, 2));
    process.exit(1);
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  const config = {
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
    deviceName,
    targetVolume,
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  const daemonSrc = path.join(__dirname, 'daemon.js');
  const daemonDest = path.join(CONFIG_DIR, 'daemon.js');
  if (fs.existsSync(daemonSrc)) {
    fs.copyFileSync(daemonSrc, daemonDest);
    console.log(`\n✅ Config saved to ${CONFIG_FILE}`);
    console.log(`✅ daemon.js copied to ${daemonDest}`);
  } else {
    console.log(`\n✅ Config saved to ${CONFIG_FILE}`);
    console.log(`⚠️  daemon.js not found next to setup.js — copy it to ${daemonDest} manually`);
  }

  console.log('\nNext steps:');
  console.log(`  1. Add raycast-spotify-daemon.sh to your Raycast scripts folder`);
  console.log(`  2. Run the Raycast command to start the daemon\n`);
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
