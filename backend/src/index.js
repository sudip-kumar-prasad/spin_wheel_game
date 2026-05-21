import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { startGameEngine } from './socket/gameEngine.js';

import userRoutes from './routes/userRoutes.js';
import spinWheelRoutes from './routes/spinWheelRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN || '*' }
});

const gameEngine = startGameEngine(io);
app.set('gameEngine', gameEngine);
app.set('io', io);

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
// Static files are served by the separate frontend

app.use('/api/users', userRoutes);
app.use('/api/spin-wheels', spinWheelRoutes);

app.get('/', (req, res) => {
  res.send('Spin Wheel Game API is running...');
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
