const NodeMediaServer = require('node-media-server');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  }
};

const nms = new NodeMediaServer(config);

// Create media directory if it doesn't exist
if (!fs.existsSync('./media')) {
  fs.mkdirSync('./media');
}
if (!fs.existsSync('./media/hls')) {
  fs.mkdirSync('./media/hls');
}

nms.on('preConnect', (id, args) => {
  console.log('[RTMP] Client attempting to connect', `id=${id} args=${JSON.stringify(args)}`);
  console.log('[RTMP] Connection from:', args.ip);
});

nms.on('postConnect', (id, args) => {
  console.log('[RTMP] Client connected successfully', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[RTMP] Client disconnected', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[RTMP] Stream starting...', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  console.log('[RTMP] Full stream URL:', `rtmp://localhost:1935${StreamPath}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[RTMP] ✅ Stream is now LIVE!', `id=${id} StreamPath=${StreamPath}`);
  console.log('[RTMP] Stream key:', StreamPath.split('/').pop());
  
  // Start FFmpeg to convert RTMP to HLS
  const streamKey = StreamPath.split('/').pop();
  const hlsPath = `./media/hls/${streamKey}`;
  
  if (!fs.existsSync(hlsPath)) {
    fs.mkdirSync(hlsPath, { recursive: true });
  }
  
  const ffmpegArgs = [
    '-i', `rtmp://localhost:1935${StreamPath}`,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_type', 'mpegts',
    `${hlsPath}/stream.m3u8`
  ];
  
  const ffmpeg = spawn('/opt/homebrew/bin/ffmpeg', ffmpegArgs);
  
  ffmpeg.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });
  
  ffmpeg.stderr.on('data', (data) => {
    console.log(`FFmpeg stderr: ${data}`);
  });
  
  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });
  
  console.log(`Started HLS conversion for stream: ${streamKey}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[RTMP] ❌ Stream ended', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

// Web server for serving the player page
const webServer = http.createServer((req, res) => {
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
  } else if (req.url.endsWith('.m3u8') || req.url.endsWith('.ts')) {
    const filePath = path.join(__dirname, 'media', 'hls', 'stream', req.url.split('/').pop());
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      
      const contentType = req.url.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

webServer.listen(3001, () => {
  console.log('Web server listening on port 3001');
  console.log('Visit http://localhost:3001 to view the stream');
});

nms.run();
console.log('========================================');
console.log('RTMP Server is RUNNING');
console.log('========================================');
console.log('Listening on port: 1935');
console.log('Stream URL: rtmp://YOUR_IP:1935/live/stream');
console.log('');
console.log('Replace YOUR_IP with your computer\'s IP address');
console.log('Waiting for ATEM connection...');
console.log('========================================');