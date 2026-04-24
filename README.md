# Spotify Volume Daemon

Automatically clamps your LG soundbar volume when Spotify connects to it,
so you never get blasted after switching from TV.

---

## How it works

A small Node.js daemon polls the Spotify API every 3s. When it detects
the active playback device switches to your soundbar, it immediately sets
the volume to your target level. It only acts on device switches — it won't
fight you if you manually adjust volume afterward.

---

## Setup (one-time)

### 1. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard
2. Click **Create app**
3. Fill in any name/description
4. Set **Redirect URI** to: `http://localhost:8888/callback`
5. Save → copy your **Client ID** and **Client Secret**

### 2. Run the setup script

```bash
node setup.js
```

This will:
- Ask for your Client ID, Client Secret, soundbar name, and target volume
- Open Spotify auth in your browser
- Save config to `~/.spotify-daemon/config.json`

> **Soundbar name**: open Spotify → Devices (cast icon) while the soundbar
> is active. Copy the name exactly as shown.

> **Target volume**: 5 is a good starting point. You can edit
> `~/.spotify-daemon/config.json` any time to adjust.

### 3. Copy daemon.js

```bash
cp daemon.js ~/.spotify-daemon/daemon.js
```

### 4. Install the Raycast script

```bash
# Copy to your Raycast scripts folder (adjust path if different)
cp raycast-spotify-daemon.sh ~/Developer/raycast-scripts/

# Make it executable
chmod +x ~/Developer/raycast-scripts/raycast-spotify-daemon.sh
```

Then in Raycast: **Preferences → Extensions → Scripts → Add Directory**
(if you haven't added that folder already).

---

## Usage

- Search **"Spotify Volume Daemon"** in Raycast
- First run → starts the daemon (shows "🎵 Daemon started")
- Run again → stops it (shows "🔇 Daemon stopped")

### Auto-start on login (optional but recommended)

```bash
# Create a launchd plist for auto-start
cat > ~/Library/LaunchAgents/com.spotify-daemon.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.spotify-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOUR_USERNAME/.spotify-daemon/daemon.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/Users/YOUR_USERNAME/.spotify-daemon/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR_USERNAME/.spotify-daemon/daemon.log</string>
</dict>
</plist>
EOF

# Replace YOUR_USERNAME, then load it:
launchctl load ~/Library/LaunchAgents/com.spotify-daemon.plist
```

---

## Logs

```bash
tail -f ~/.spotify-daemon/daemon.log
```

---

## Config

Edit `~/.spotify-daemon/config.json` to change settings without re-running setup:

```json
{
  "clientId": "...",
  "clientSecret": "...",
  "refreshToken": "...",
  "deviceName": "LG Soundbar",
  "targetVolume": 5
}
```

---

## Files

| File | Location |
|------|----------|
| Config + tokens | `~/.spotify-daemon/config.json` |
| Daemon script | `~/.spotify-daemon/daemon.js` |
| PID file | `~/.spotify-daemon/daemon.pid` |
| Logs | `~/.spotify-daemon/daemon.log` |
| Raycast script | Your Raycast scripts folder |
