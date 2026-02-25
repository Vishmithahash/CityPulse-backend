const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected - CityPulse'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Example Data Routes
app.use('/api/places', require('./routes/places'));

// Health Check
app.get('/', (req, res) => {
  res.json({ 
    message: 'CityPulse API 🚀', 
    status: 'Ready',
    database: 'Connected'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
});
