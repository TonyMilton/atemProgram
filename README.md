# ATEM Ultra-Low Latency Streaming Server

A high-performance server that receives H.264 streams from Blackmagic ATEM Mini Pro (via RTMP) and delivers ultra-low latency streaming to web browsers using optimized HLS.

## Features

- Receives H.264/RTMP streams from ATEM Mini Pro (Custom URL mode)
- Low latency HLS streaming (~4 seconds)
- No transcoding - preserves original H.264 quality
- Web-based video player with MSE support
- 0.5-second HLS segments for minimal buffering
- Automatic media cleanup on startup
- Real-time ATEM streaming status via WebSocket
- Automatic stream refresh when ATEM starts/stops streaming

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [FFmpeg](https://ffmpeg.org/) installed and accessible
- Blackmagic ATEM Mini Pro
- Latest version of Google Chrome (for viewing the stream)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/TonyMilton/atemProgram.git
cd atemProgram
```

2. Install dependencies:
```bash
bun install
```

3. Verify FFmpeg is installed:
```bash
which ffmpeg
```

If FFmpeg is not installed:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Usage

1. Start the server:
```bash
bun run dev
```

The server will start with:
- RTMP server on port 1935
- Web interface on port 3001
- WebSocket server for real-time status updates

2. Find your computer's IP address:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

3. Configure your ATEM Mini Pro:
   - Press the gear/settings button
   - Navigate to "Output" settings
   - Set streaming service to "Custom URL"
   - Set video format to "H.264" (recommended)
   - Enter Server URL: `rtmp://YOUR_COMPUTER_IP:1935/live`
   - Enter Stream Key: `stream`
   - Apply settings and start streaming

4. View the stream:
   - Open Google Chrome to `http://localhost:3001`
   - Click "Connect" to initialize the player
   - The stream will automatically refresh when ATEM starts/stops streaming
   - Real-time status shows "Receiving ATEM stream" or "No ATEM stream received"

## Network Setup

### Direct Connection (Ethernet)
If connecting ATEM directly to your computer via ethernet:

1. Enable Internet Sharing (macOS):
   - System Preferences → Sharing → Internet Sharing
   - Share connection from: Wi-Fi
   - To computers using: Ethernet

2. The ATEM will receive an IP from your computer's DHCP
3. Use your computer's bridge interface IP as the server IP in ATEM settings

### Same Network
If both devices are on the same network:
- Use your computer's network IP address
- Ensure firewall allows connections on port 1935

## Troubleshooting

### No Stream Appearing
1. Check server logs for connection attempts
2. Verify ATEM network settings
3. Ensure correct IP address is used (not localhost)
4. Check firewall settings

### High Latency
- Normal HLS latency is 10-30 seconds
- For lower latency, consider WebRTC solutions
- Current setup prioritizes compatibility over ultra-low latency

### FFmpeg Errors
- Ensure FFmpeg is installed (see Installation section)
- If FFmpeg is not in standard location, update the path in server.js

## Architecture

```
ATEM Mini Pro → RTMP/H.264 → Node Media Server → FFmpeg (copy) → HLS → Web Browser
```

### Why HLS?
- **ATEM outputs**: RTMP stream with H.264 video (Custom URL mode)
- **Browsers need**: HLS, DASH, or WebRTC (RTMP is not supported)
- **This server**: Repackages the H.264 stream into HLS format without re-encoding
- **Result**: Original quality preserved, minimal CPU usage

### Browser Compatibility
- Recommended: Latest Google Chrome
- Also works with: Safari, Firefox, Edge (latest versions)

## Ports Used

- `1935`: RTMP server
- `3001`: Web interface and WebSocket server

