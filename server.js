const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socket = require('./socket');
const NotificationService = require('./services/notificationService');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected - CityPulse'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));

app.use('/api/reports', require('./routes/reports'));
app.use('/api/assignments', require('./routes/assignments'));


app.use('/api/issues', require('./routes/issues'));
app.use('/api/upload', require('./routes/upload'));

app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/notifications', require('./routes/notifications'));


// Health Check
app.get('/', (req, res) => {
    res.json({
        message: 'CityPulse API 🚀',
        status: 'Ready',
        database: 'Connected'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
});

// Initialize Socket.io
const io = socket.init(server);

// Socket Connection Logic
io.on('connection', (socket) => {
    console.log('User connected to socket');

    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their notification room`);
    });

    socket.on('markAsRead', async (data) => {
        const { notificationId, userId } = data;
        await NotificationService.markAsRead(notificationId, userId);
        socket.emit('notificationRead', notificationId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});
