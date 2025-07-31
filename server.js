require('dotenv').config();
const NodeMediaServer = require('node-media-server');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

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
  } else if (req.url === '/style.css') {
    const cssPath = path.join(__dirname, 'style.css');
    fs.readFile(cssPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('CSS file not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/css' });
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
  } else if (req.url === '/api/atem/start-stream' && req.method === 'POST') {
    // Start ATEM streaming
    (async () => {
      try {
        // Connect to streaming port if not already connected
        if (!streamingSocket) {
          await connectToATEMStreaming();
        }
        
        const streamUrl = process.env.STREAM_URL || 'rtmp://localhost:1935/live/stream';
        const streamKey = process.env.STREAM_KEY || 'stream';
        const command = `stream start: url: ${streamUrl} key: ${streamKey}`;
        
        await sendStreamingCommand(command);
        console.log('[ATEM] Stream start command sent:', command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Stream start command sent' }));
      } catch (error) {
        console.error('[ATEM] Start streaming error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    })();
  } else if (req.url === '/api/atem/stop-stream' && req.method === 'POST') {
    // Stop ATEM streaming
    (async () => {
      try {
        // Connect to streaming port if not already connected
        if (!streamingSocket) {
          await connectToATEMStreaming();
        }
        
        const command = 'stream stop';
        await sendStreamingCommand(command);
        console.log('[ATEM] Stream stop command sent:', command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Stream stop command sent' }));
      } catch (error) {
        console.error('[ATEM] Stop streaming error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    })();
  } else if (req.url === '/api/atem/start-record' && req.method === 'POST') {
    // Start ATEM recording
    (async () => {
      try {
        // Connect to streaming port if not already connected
        if (!streamingSocket) {
          await connectToATEMStreaming();
        }
        
        const command = 'record';
        await sendStreamingCommand(command);
        console.log('[ATEM] Record start command sent:', command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Record start command sent' }));
      } catch (error) {
        console.error('[ATEM] Start recording error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    })();
  } else if (req.url === '/api/atem/stop-record' && req.method === 'POST') {
    // Stop ATEM recording
    (async () => {
      try {
        // Connect to streaming port if not already connected
        if (!streamingSocket) {
          await connectToATEMStreaming();
        }
        
        const command = 'stop';
        await sendStreamingCommand(command);
        console.log('[ATEM] Record stop command sent:', command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Record stop command sent' }));
      } catch (error) {
        console.error('[ATEM] Stop recording error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    })();
  } else if (req.url === '/api/atem/status' && req.method === 'GET') {
    // Get ATEM streaming status
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      streamingConnected: streamingSocket !== null,
      ip: ATEM_IP
    }));
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

// ATEM streaming connection setup
let streamingSocket = null;
const ATEM_IP = process.env.ATEM_IP;
const ATEM_STREAMING_PORT = 9993;

function connectToATEMStreaming() {
  return new Promise((resolve, reject) => {
    if (streamingSocket) {
      streamingSocket.destroy();
    }
    
    streamingSocket = new net.Socket();
    
    streamingSocket.connect(ATEM_STREAMING_PORT, ATEM_IP, () => {
      console.log(`[ATEM Streaming] ✅ Connected to streaming port ${ATEM_STREAMING_PORT}`);
      broadcastATEMStreamingStatus(true);
      resolve();
    });
    
    streamingSocket.on('data', (data) => {
      const response = data.toString().trim();
      
      
      console.log('[ATEM Streaming] Received:', response);
      
      // Parse slot info response for recording status
      if (response.includes('slot info:')) {
        const lines = response.split('\n');
        let recordingStatus = false;
        
        lines.forEach(line => {
          if (line.includes('status:')) {
            const status = line.split('status:')[1]?.trim();
            recordingStatus = status === 'recording';
            console.log('[ATEM] Recording status detected:', status, '-> recording:', recordingStatus);
          }
        });
        
        broadcastATEMRecordingStatus(recordingStatus);
      }
    });
    
    streamingSocket.on('error', (error) => {
      console.error('[ATEM Streaming] Error:', error.message);
      broadcastATEMStreamingStatus(false);
      reject(error);
    });
    
    streamingSocket.on('close', () => {
      console.log('[ATEM Streaming] Connection closed');
      broadcastATEMStreamingStatus(false);
      streamingSocket = null;
    });
  });
}

function sendStreamingCommand(command) {
  return new Promise((resolve, reject) => {
    if (!streamingSocket) {
      reject(new Error('Streaming socket not connected'));
      return;
    }
    
    streamingSocket.write(command + '\n', (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function broadcastATEMStreamingStatus(connected) {
  const message = JSON.stringify({ 
    type: 'atem_streaming_connection', 
    connected: connected 
  });
  
  statusClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastATEMRecordingStatus(recording) {
  const message = JSON.stringify({ 
    type: 'atem_recording_status', 
    recording: recording 
  });
  
  statusClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Function to query ATEM recording and streaming status
async function queryATEMStatus() {
  if (!streamingSocket) return;
  
  try {
    // Query slot info to get recording status
    streamingSocket.write('slot info\n');
    
    // Note: streaming status commands don't exist in ATEM ethernet protocol
    // Only recording status is available via slot info
    
  } catch (error) {
    console.error('[ATEM Status] Error querying status:', error);
  }
}

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
    // FFmpeg logs are hidden to reduce console noise
    // Uncomment below lines to enable FFmpeg logging for debugging
    /*
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
    */
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

// Connect to ATEM streaming port on startup
connectToATEMStreaming().catch(error => {
  console.error('[ATEM Streaming] Failed to connect on startup:', error.message);
});

// Poll ATEM recording status every 3 seconds using slot info
setInterval(() => {
  queryATEMStatus();
}, 3000);

console.log('========================================');
console.log('ATEM Ultra-Low Latency HLS Server');
console.log('========================================');
console.log('RTMP port: 1935');
console.log('Web port: 3001');
console.log('Stream URL: rtmp://YOUR_IP:1935/live/stream');
console.log(`ATEM IP: ${ATEM_IP}`);
console.log('Expected latency: ~4 seconds');
console.log('========================================');