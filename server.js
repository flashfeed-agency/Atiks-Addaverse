const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');

const authRoutes = require('./src/routes/authRoutes');
const driveRoutes = require('./src/routes/driveRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/user', userRoutes);

// Root Route
app.get('/', (req, res) => {
  if (req.cookies && req.cookies.auth_token) {
    return res.redirect('/dashboard.html');
  }
  return res.redirect('/login.html');
});

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: "Atik's Addaverse",
    time: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
async function start() {
  try {
    await db.initDb();
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(` 🔥 Atik's Addaverse Cloud Studio is RUNNING`);
      console.log(` 🌐 Local URL: http://localhost:${config.port}`);
      console.log(` 🎬 Theme: Anime/Manga Creator Mode (@Addaverse_atik)`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
