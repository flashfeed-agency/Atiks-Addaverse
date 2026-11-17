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

// Generate Google OAuth URL with Account Selector
router.get('/google/url', async (req, res) => {
  try {
    let clientId = config.google.clientId;
    let clientSecret = config.google.clientSecret;

    // Check if logged in user has custom credentials
    if (req.cookies && req.cookies.auth_token) {
      try {
        const decoded = jwt.verify(req.cookies.auth_token, config.jwtSecret);
        const user = await db.get('SELECT google_client_id, google_client_secret FROM users WHERE id = ?', [decoded.userId]);
        if (user && user.google_client_id) {
          clientId = user.google_client_id;
          clientSecret = user.google_client_secret;
        }
      } catch (e) {}
    }

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Google OAuth credentials not configured. Please add Google Client ID & Secret in settings or environment.'
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
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    let userId = null;
    if (req.cookies && req.cookies.auth_token) {
      try {
        const decoded = jwt.verify(req.cookies.auth_token, config.jwtSecret);
        userId = decoded.userId;
      } catch (e) {}
    }

    const state = JSON.stringify({ userId, ts: Date.now() });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent', // Always show Google Account Picker
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

    if (!code) {
      return res.redirect('/dashboard.html?auth_error=Missing_Code');
    }

    let parsedState = {};
    if (state) {
      try {
        parsedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      } catch (e) {}
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email;
    const googleName = userInfo.data.name || googleEmail.split('@')[0];

    // Fetch channel details to confirm connection
    let channelTitle = googleName;
    let channelAvatar = userInfo.data.picture || '';
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
        channelAvatar = item.snippet.thumbnails?.default?.url || channelAvatar;
      }
    } catch (channelErr) {
      console.warn('Could not fetch channel details:', channelErr.message);
    }

    let targetUser = null;
    if (parsedState.userId) {
      targetUser = await db.get('SELECT * FROM users WHERE id = ?', [parsedState.userId]);
    }

    // If user clicked Google Connect without registering first, automatically create/log-in user!
    if (!targetUser) {
      targetUser = await db.get('SELECT * FROM users WHERE email = ?', [googleEmail]);
      if (!targetUser) {
        const randomPass = await hashPassword(Math.random().toString(36).slice(-10));
        let username = googleName.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (username.length < 3) username = 'user_' + Math.floor(Math.random() * 10000);

        const existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsername) username = username + '_' + Math.floor(Math.random() * 1000);

        await db.run(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          [username, googleEmail, randomPass]
        );

        targetUser = await db.get('SELECT * FROM users WHERE email = ?', [googleEmail]);
      }
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
        tokens.expiry_date || (Date.now() + 3600000),
        channelId,
        channelTitle,
        channelAvatar,
        targetUser.id
      ]
    );

    // Set JWT auth cookie so user is logged in
    const token = generateToken(targetUser);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log(`[OAuth] Google successfully connected for user ${targetUser.username} (${channelTitle})`);
    return res.redirect('/dashboard.html?google_connected=true');
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
