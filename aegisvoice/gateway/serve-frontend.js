const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.listen(5173, () => console.log('Frontend served at http://localhost:5173'));
