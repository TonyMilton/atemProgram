# ATEM Mini Pro Streaming Control Server

A modern Node.js server with beautiful Tailwind CSS interface that provides ethernet-based control of Blackmagic ATEM Mini Pro streaming and receives RTMP streams for ultra-low latency web playback.

## Features

### Modern Web Interface
- **Beautiful Tailwind CSS v4 design** with responsive layout
- **Video-centered layout** with controls in right sidebar
- **Professional status indicators** with colored dots and real-time updates
- **Optimized for full-screen viewing** with maximum video real estate
- **Dark theme** optimized for streaming environments

### ATEM Ethernet Control
- **Direct ethernet communication** with ATEM Mini Pro (port 9993)
- **Start/Stop streaming** buttons in web interface
- **Remote streaming control** without physical access to device

### RTMP Stream Reception & Web Playback
- Receives H.264/RTMP streams from ATEM Mini Pro
- Low latency HLS streaming (~4 seconds)
- No transcoding - preserves original H.264 quality
- Web-based video player with MSE support
- 0.5-second HLS segments for minimal buffering
- Automatic media cleanup on startup
- Real-time streaming status via WebSocket

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Node.js](https://nodejs.org/) (for Vite development server)
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

3. Configure ATEM connection:
```bash
# Create .env file with your ATEM's IP address
echo "ATEM_IP=192.168.2.2" > .env
echo "STREAM_URL=rtmp://192.168.2.1:1935/live/stream" >> .env
echo "STREAM_KEY=stream" >> .env
```

4. Verify FFmpeg is installed:
```bash
which ffmpeg
```

If FFmpeg is not installed:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Usage

### Development Mode (Recommended)

1. Start the backend server:
```bash
bun run start
```

2. In a separate terminal, start the Vite development server:
```bash
npm run dev-frontend
```

This will run:
- **Backend server** on port 3001 (ATEM control, RTMP, API)
- **Frontend server** on port 5173 (Vite dev server with hot reload)
- **Automatic proxy** from frontend to backend for API calls

3. Access the modern interface at `http://localhost:5173`

### Production Mode

1. Build the frontend:
```bash
npm run build
```

2. Start the server:
```bash
bun run start
```

3. Access the interface at `http://localhost:3001`

The server will start with:
- **ATEM streaming control** connection (port 9993)
- **RTMP server** on port 1935
- **Web interface** on port 3001 (or 5173 in dev mode)
- **WebSocket server** for real-time status updates

2. Configure your ATEM Mini Pro streaming destination:
   - Press the gear/settings button
   - Navigate to "Output" settings  
   - Set streaming service to "Custom URL"
   - Set video format to "H.264" (recommended)
   - Enter Server URL: `rtmp://YOUR_COMPUTER_IP:1935/live`
   - Enter Stream Key: `stream`
   - **Do not start streaming yet** - you'll control this from the web interface

3. Access the web interface:
   - Open browser to `http://localhost:3001`
   - Click "Connect" to initialize the player
   - Use **"Start Stream"** button to begin ATEM streaming via ethernet
   - Use **"Stop Stream"** button to stop ATEM streaming
   - Monitor connection status and stream status in real-time

4. ATEM Control Features:
   - **Remote Start/Stop**: Control streaming without physical access to ATEM
   - **Connection Status**: Shows "Streaming Port Connected" when ethernet link is active
   - **Stream Monitoring**: Real-time feedback when ATEM starts/stops streaming

## Network Setup

### Requirements
- **ATEM Mini Pro** and **computer** must be on the same network
- **Port 9993** must be accessible for ATEM streaming control
- **Port 1935** must be accessible for RTMP stream reception

### Direct Connection (Ethernet)
If connecting ATEM directly to your computer via ethernet:

1. Enable Internet Sharing (macOS):
   - System Preferences → Sharing → Internet Sharing
   - Share connection from: Wi-Fi
   - To computers using: Ethernet

2. Find the ATEM's assigned IP:
   ```bash
   # Check DHCP clients or use network scanner
   arp -a | grep -i blackmagic
   ```

3. Update `.env` file with ATEM's IP address

### Same Network Setup
If both devices are on the same network:
- Find your ATEM's IP address (check router admin panel or ATEM LCD screen)
- Update `ATEM_IP` in `.env` file
- Update `STREAM_URL` to point to your computer's IP
- Ensure firewall allows connections on ports 1935 and 9993

## Troubleshooting

### ATEM Control Issues
1. **"Streaming Port Disconnected"**:
   - Verify ATEM IP address in `.env` file
   - Check network connectivity (`ping ATEM_IP`)
   - Ensure port 9993 is not blocked by firewall
   - Restart ATEM Mini Pro

2. **Start/Stop buttons not working**:
   - Check browser console for JavaScript errors
   - Verify WebSocket connection is active
   - Try refreshing the web page

### No Stream Appearing
1. Check server logs for RTMP connection attempts
2. Verify ATEM streaming destination is configured correctly
3. Use "Start Stream" button instead of manual ATEM button
4. Check that `STREAM_URL` points to correct computer IP

### Network Connectivity
```bash
# Test ATEM streaming port
telnet YOUR_ATEM_IP 9993

# Test RTMP port
telnet YOUR_COMPUTER_IP 1935
```

### High Latency
- Normal HLS latency is 4-8 seconds with current configuration
- Latency is optimized for 0.5-second segments
- For lower latency, consider WebRTC solutions

### FFmpeg Errors
- Ensure FFmpeg is installed (see Installation section)  
- If FFmpeg is not in standard location, update the path in server.js

## Architecture

### Streaming Control Flow
```
Web Interface → Node.js Server → TCP (port 9993) → ATEM Mini Pro
     ↓                                                    ↓
"Start Stream"                                    Begins RTMP streaming
```

### Video Stream Flow  
```
ATEM Mini Pro → RTMP/H.264 → Node Media Server → FFmpeg (copy) → HLS → Web Browser
```

### Dual Communication Channels
1. **Control Channel (TCP port 9993)**:
   - Send text commands: `stream start: url: ... key: ...`
   - Real-time status monitoring
   - Connection state management

2. **Video Channel (RTMP port 1935)**:
   - Receive H.264 video stream
   - Convert to HLS without re-encoding
   - Serve to web browsers

### Why This Design?
- **ATEM ethernet protocol**: Enables remote streaming control
- **HLS streaming**: Browser-compatible, low-latency playback
- **No transcoding**: Preserves original H.264 quality, minimal CPU usage
- **Real-time control**: Start/stop streaming without physical access

### Browser Compatibility
- Recommended: Latest Google Chrome
- Also works with: Safari, Firefox, Edge (latest versions)

## Ports Used

- **9993**: ATEM streaming control (TCP)
- **1935**: RTMP server (TCP)  
- **3001**: Web interface and WebSocket server (HTTP/WS)

## Configuration Files

### `.env` File
```bash
ATEM_IP=192.168.2.2                           # Your ATEM Mini Pro IP address
STREAM_URL=rtmp://192.168.2.1:1935/live/stream # Where ATEM should stream to
STREAM_KEY=stream                              # RTMP stream key
```

## API Endpoints

- `POST /api/atem/start-stream` - Start ATEM streaming
- `POST /api/atem/stop-stream` - Stop ATEM streaming  
- `GET /api/atem/status` - Get connection status
- `WS /status` - WebSocket for real-time updates

