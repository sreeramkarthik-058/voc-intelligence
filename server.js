require('dotenv').config();
const express = require('express');
const path = require('path');
const analyzeRoute = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', analyzeRoute);

app.listen(PORT, () => {
  console.log(`\n🧠 VoC Intelligence Tool`);
  console.log(`   Running at: http://localhost:${PORT}\n`);
});
