// socket.js

let ioInstance = null;

function initializeSocket(server) {
  if (ioInstance) {
    console.warn('Socket.IO is already initialized.');
    return ioInstance;
  }
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          'http://localhost:3001',
            "https://ramus-front12.vercel.app",
      "tauri://com.admin.tauri-app",
          'http://localhost:1420',
          "tauri://localhost",
              "http://tauri.localhost",
          'https://scoresync-v1.vercel.app',
          'http://192.168.18.6:3001'
        ];
        
        // Check if origin is allowed OR if it's a Vercel preview deployment
        if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
          callback(null, true);
        } else {
          console.warn('⚠️ Socket.IO CORS blocked origin:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ["Content-Type", "Authorization", "x-cookie"],
    },
    allowEIO3: true, // Allow Engine.IO v3 clients
    // Benchmarked via scripts/benchmark-deflate.js (2026-08-17) against a
    // realistic 20-team/80-player live-tick payload — the previous comment
    // here claiming msgpack payloads are "high-entropy, gain little from
    // deflate" was wrong: deflate level 6 cut msgpack by 87.3% (62.3KB ->
    // 7.9KB) and protobuf by a further 66.9% even on top of protobuf's own
    // much smaller baseline (17.1KB -> 5.6KB), at ~0.2-0.5ms/op — negligible
    // against the ~2s live-tick cadence. threshold matches `ws`'s own
    // default (1024 bytes) so small control events (matchCreated,
    // pollingStatusUpdated, etc.) skip compression entirely.
    perMessageDeflate: {
      threshold: 1024,
      zlibDeflateOptions: { level: 6 },
    },
  });

  console.log('✅ Socket.IO initialized with CORS');

  return ioInstance;
}

function getSocket() {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return ioInstance;
}

module.exports = { initializeSocket, getSocket };