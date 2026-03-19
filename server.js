require('dotenv').config();
const express = require('express');
const path = require('path');
const analyzeRoute = require('./routes/analyze');
const presentationRoute = require('./routes/presentation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', analyzeRoute);
app.use('/api', presentationRoute);

app.listen(PORT, () => {
  console.log(`\n🧠 Customer Sentiment Analysis`);
  console.log(`   Running at: http://localhost:${PORT}\n`);
});
