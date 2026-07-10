const express = require('express');

const app = express();

// ---- Global middleware ----
app.use(express.json());

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'yaad-api' });
});

module.exports = app;