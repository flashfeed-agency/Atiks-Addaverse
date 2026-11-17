const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, comparePassword, generateToken, requireAuth } = require('../auth');
const config = require('../config');
const { google } = require('googleapis');

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check existing
    const existing = await db.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username.trim().toLowerCase(), email.trim().toLowerCase()]
    );

    if (existing) {
      return res.status(400).json({ error: 'A user with that username or email already exists.' });
    }

    const hashed = await hashPassword(password);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username.trim().toLowerCase(), email.trim().toLowerCase(), hashed]
    );

    const newUser = await db.get(
      'SELECT id, username, email FROM users WHERE username = ?',
      [username.trim().toLowerCase()]
    );

    const token = generateToken(newUser);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      message: 'Account created successfully!',
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body; // login can be username or email

    if (!login || !password) {
      return res.status(400).json({ error: 'Please enter your username/email and password.' });
    }

    const user = await db.get(
      'SELECT id, username, email, password_hash, channel_id, channel_title, channel_avatar, google_access_token FROM users WHERE username = ? OR email = ?',
      [login.trim().toLowerCase(), login.trim().toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Login successful!',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        channelTitle: user.channel_title,
        channelAvatar: user.channel_avatar,
        isYouTubeConnected: !!user.google_access_token
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal login error.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  return res.json({ message: 'Logged out successfully.' });
});

// Get current user profile
router.get('/me', requireAuth, async (req, res) => {
  const user = req.user;
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      channelId: user.channel_id,
      channelTitle: user.channel_title,
      channelAvatar: user.channel_avatar,
      isYouTubeConnected: !!user.google_access_token,
      hasCustomGoogleCredentials: !!(user.google_client_id)
    }
  });
});

// Generate Google OAuth URL for connecting YouTube
router.get('/google/url', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const clientId = user.google_client_id || config.google.clientId;
    const clientSecret = user.google_client_secret || config.google.clientSecret;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Google OAuth credentials not configured. Please enter your Google Client ID and Secret in settings or set environment variables.'
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      config.google.redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/drive.readonly'
    ];

    // Pass user ID as state to bind callback securely to the logged in user
    const state = JSON.stringify({ userId: user.id, ts: Date.now() });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: Buffer.from(state).toString('base64')
    });

    return res.json({ authUrl });
  } catch (err) {
    console.error('Google auth url error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate Google auth URL' });
  }
});

// OAuth Callback from Google
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/dashboard.html?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('/dashboard.html?auth_error=Missing_Code_Or_State');
    }

    let parsedState;
    try {
      parsedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch (e) {
      return res.redirect('/dashboard.html?auth_error=Invalid_State');
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [parsedState.userId]);
    if (!user) {
      return res.redirect('/login.html?error=UserNotFound');
    }

    const clientId = user.google_client_id || config.google.clientId;
    const clientSecret = user.google_client_secret || config.google.clientSecret;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      config.google.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch channel details to confirm connection
    let channelTitle = 'My YouTube Channel';
    let channelAvatar = '';
    let channelId = '';

    try {
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const channelRes = await youtube.channels.list({
        part: 'snippet',
        mine: true
      });

      if (channelRes.data.items && channelRes.data.items.length > 0) {
        const item = channelRes.data.items[0];
        channelId = item.id;
        channelTitle = item.snippet.title;
        channelAvatar = item.snippet.thumbnails?.default?.url || '';
      }
    } catch (channelErr) {
      console.warn('Could not fetch channel details:', channelErr.message);
    }

    // Save tokens in database for this specific user
    await db.run(
      `UPDATE users SET 
        google_access_token = ?, 
        google_refresh_token = COALESCE(?, google_refresh_token), 
        google_token_expiry = ?,
        channel_id = ?,
        channel_title = ?,
        channel_avatar = ?
      WHERE id = ?`,
      [
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || null,
        channelId,
        channelTitle,
        channelAvatar,
        user.id
      ]
    );

    console.log(`[OAuth] YouTube successfully connected for user ${user.username} (${channelTitle})`);
    return res.redirect('/dashboard.html?youtube_connected=true');
  } catch (err) {
    console.error('OAuth Callback processing error:', err);
    return res.redirect(`/dashboard.html?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// Disconnect YouTube
router.post('/google/disconnect', requireAuth, async (req, res) => {
  try {
    await db.run(
      `UPDATE users SET 
        google_access_token = NULL, 
        google_refresh_token = NULL, 
        google_token_expiry = NULL,
        channel_id = NULL,
        channel_title = NULL,
        channel_avatar = NULL
      WHERE id = ?`,
      [req.user.id]
    );
    return res.json({ message: 'YouTube channel disconnected successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to disconnect YouTube.' });
  }
});

module.exports = router;
