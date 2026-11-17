const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');
const { google } = require('googleapis');

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, email: user.email },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.auth_token;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      if (req.accepts('html') && !req.path.startsWith('/api/')) {
        return res.redirect('/login.html');
      }
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await db.get(
      'SELECT id, username, email, channel_id, channel_title, channel_avatar, google_client_id, google_access_token, google_refresh_token, google_token_expiry FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      res.clearCookie('auth_token');
      if (req.accepts('html') && !req.path.startsWith('/api/')) {
        return res.redirect('/login.html');
      }
      return res.status(401).json({ error: 'User account not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('auth_token');
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

// Get an authenticated OAuth2 client for the specific user
async function getUserOAuthClient(user) {
  const clientId = user.google_client_id || config.google.clientId;
  const clientSecret = user.google_client_secret || config.google.clientSecret;
  const redirectUri = config.google.redirectUri;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please add Google Client ID & Secret in settings or environment.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (user.google_access_token) {
    oauth2Client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expiry ? Number(user.google_token_expiry) : null
    });

    // Check if token needs refresh
    const isExpired = user.google_token_expiry && (Number(user.google_token_expiry) <= Date.now() + 60000);
    if (isExpired && user.google_refresh_token) {
      try {
        console.log(`[OAuth] Refreshing token for user ${user.username}...`);
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        await db.run(
          'UPDATE users SET google_access_token = ?, google_token_expiry = ? WHERE id = ?',
          [credentials.access_token, credentials.expiry_date, user.id]
        );
        console.log(`[OAuth] Token refreshed successfully for user ${user.username}.`);
      } catch (refreshErr) {
        console.error('[OAuth] Token refresh error:', refreshErr.message);
        throw new Error('Google token expired and could not be refreshed. Please reconnect your YouTube account.');
      }
    }
  }

  return oauth2Client;
}

module.exports = {
  generateToken,
  hashPassword,
  comparePassword,
  requireAuth,
  getUserOAuthClient
};
