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
  },
});

// Signaling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When a user joins a room
  socket.on('join', (roomId, ack) => {
    socket.join(roomId);
    const room = io.sockets.adapter.rooms.get(roomId);
    const roomSize = room ? room.size : 0;

    // First peer = callee, second peer = caller (initiator)
    let role = 'callee';
    if (roomSize >= 2) role = 'caller';

    console.log(
      `User ${socket.id} joined room ${roomId}, size=${roomSize}, role=${role}`,
    );

    if (typeof ack === 'function') {
      ack({ roomSize, role });
    }

    // When room has 2 peers, notify both they can start negotiating
    if (roomSize === 2) {
      io.to(roomId).emit('room-ready');
    }
  });

  socket.on('offer', (roomId, offer) => {
    console.log(`Forwarding offer in room ${roomId}`);
    socket.to(roomId).emit('offer', offer);
  });

  socket.on('answer', (roomId, answer) => {
    console.log(`Forwarding answer in room ${roomId}`);
    socket.to(roomId).emit('answer', answer);
  });

  socket.on('candidate', (roomId, candidate) => {
    socket.to(roomId).emit('candidate', candidate);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});