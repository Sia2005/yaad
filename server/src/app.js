const express = require('express');
const cors = require('cors');

const app = express();

// ---- Global middleware ----
const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
).split(',');
app.use(cors({ origin: allowedOrigins }));

app.use(express.json());

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'yaad-api' });
});

// ---- Routes ----
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

const patientRoutes = require('./routes/patient.routes');
app.use('/api/patients', patientRoutes);

module.exports = app;