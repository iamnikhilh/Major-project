const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Add connection timeout handler
server.on('connection', (socket) => {
  socket.setTimeout(30000);
  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

// Rest of your existing connection handlers...
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (roomId, ack) => {
    try {
      socket.join(roomId);
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      const role = roomSize >= 2 ? 'caller' : 'callee';
      
      console.log(`User ${socket.id} joined room ${roomId}, size=${roomSize}, role=${role}`);
      
      if (typeof ack === 'function') {
        ack({ roomSize, role });
      }

      if (roomSize === 2) {
        io.to(roomId).emit('room-ready');
      }
    } catch (err) {
      console.error('Error in join handler:', err);
      if (typeof ack === 'function') {
        ack({ error: 'Failed to join room' });
      }
    }
  });

  // Add error handling for other events
  ['offer', 'answer', 'candidate'].forEach(event => {
    socket.on(event, (...args) => {
      try {
        const [roomId, data] = args;
        if (roomId && data) {
          socket.to(roomId).emit(event, data);
        }
      } catch (err) {
        console.error(`Error in ${event} handler:`, err);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3002;
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please close the other application or use a different port.`);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://YOUR_SERVER_IP:${PORT}`);
});