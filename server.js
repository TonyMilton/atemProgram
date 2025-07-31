const NodeMediaServer = require('node-media-server');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// HTTP server for the player page and HLS files
const server = http.createServer((req, res) => {
  // Add CORS headers for HLS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.url === '/' || req.url === '/index.html') {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/stream.m3u8') {
    const m3u8Path = path.join(__dirname, 'media', 'stream.m3u8');
    fs.readFile(m3u8Path, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Playlist not found');
        return;
      }
      res.writeHead(200, { 
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(data);
    });
  } else if (req.url.endsWith('.ts')) {
    const tsPath = path.join(__dirname, 'media', req.url.substring(1));
    fs.readFile(tsPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Segment not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'video/mp2t' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server for ATEM status updates
const wss = new WebSocket.Server({ server });
const statusClients = new Set();

wss.on('connection', (ws, req) => {
  if (req.url === '/status') {
    statusClients.add(ws);
    console.log('[WebSocket] Status client connected');
    
    // Send current ATEM status
    ws.send(JSON.stringify({ 
      type: 'atem_status', 
      streaming: ffmpegProcess !== null 
    }));
    
    ws.on('close', () => {
      statusClients.delete(ws);
      console.log('[WebSocket] Status client disconnected');
    });
  }
});

function broadcastATEMStatus(streaming) {
  const message = JSON.stringify({ 
    type: 'atem_status', 
    streaming: streaming 
  });
  
  statusClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// RTMP config
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  }
};

const nms = new NodeMediaServer(config);
let ffmpegProcess = null;

// Clean up media directory on startup
const mediaDir = path.join(__dirname, 'media');
if (fs.existsSync(mediaDir)) {
  console.log('[Cleanup] Removing old media files...');
  fs.rmSync(mediaDir, { recursive: true, force: true });
}
fs.mkdirSync(mediaDir, { recursive: true });

// No black frame - just empty directory

console.log('[Cleanup] Media directory ready');

// Function to clean up
function cleanup() {
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }
}

// RTMP handlers
nms.on('preConnect', (id, args) => {
  console.log('[RTMP] Client attempting to connect', `id=${id}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[RTMP] ✅ Stream is now LIVE!', `StreamPath=${StreamPath}`);
  
  // Kill any existing FFmpeg process
  cleanup();
  
  // Broadcast ATEM streaming status
  broadcastATEMStatus(true);
  
  console.log('[Stream] Starting FFmpeg for live ATEM stream');
  
  // Use FFmpeg for ultra-low latency HLS - let it manage the playlist
  const ffmpegArgs = [
    '-i', `rtmp://localhost:1935${StreamPath}`,
    '-c:v', 'copy',           // No transcoding - preserve quality
    '-c:a', 'copy',           // No transcoding - preserve quality
    '-f', 'hls',              // HLS output
    '-hls_time', '0.5',       // 0.5 second segments
    '-hls_list_size', '3',    // Keep only 3 segments
    '-hls_flags', 'delete_segments+independent_segments',
    '-hls_segment_type', 'mpegts',
    '-hls_start_number_source', 'datetime',
    '-g', '25',               // GOP size = 1 second at 25fps
    '-sc_threshold', '0',     // Disable scene change detection
    '-force_key_frames', 'expr:gte(t,n_forced*1)', // Force keyframe every second
    'media/stream.m3u8'
  ];
  
  ffmpegProcess = spawn('/opt/homebrew/bin/ffmpeg', ffmpegArgs);
  
  let lastLogTime = 0;
  ffmpegProcess.stderr.on('data', (data) => {
    const now = Date.now();
    const output = data.toString();
    
    // Only log once per second
    if (output.includes('frame=')) {
      if (now - lastLogTime > 1000) {
        console.log(`[FFmpeg] ${output.trim()}`);
        lastLogTime = now;
      }
    } else if (!output.includes('size=') && !output.includes('time=')) {
      console.log(`[FFmpeg] ${output.trim()}`);
    }
  });
  
  ffmpegProcess.on('close', (code) => {
    console.log(`[FFmpeg] Process exited with code ${code}`);
  });
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[RTMP] ❌ Stream ended', `StreamPath=${StreamPath}`);
  cleanup();
  
  // Broadcast ATEM stopped streaming
  broadcastATEMStatus(false);
  
  // Clear media directory after stream ends
  setTimeout(() => {
    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(mediaDir, file));
      });
      console.log('[Cleanup] Media directory cleared');
    }
  }, 500);
});

// Start servers
server.listen(3001, () => {
  console.log('HLS streaming server listening on port 3001');
  console.log('Visit http://localhost:3001');
});

nms.run();
console.log('========================================');
console.log('ATEM Ultra-Low Latency HLS Server');
console.log('========================================');
console.log('RTMP port: 1935');
console.log('Web port: 3001');
console.log('Stream URL: rtmp://YOUR_IP:1935/live/stream');
console.log('Expected latency: ~4 seconds');
console.log('========================================');