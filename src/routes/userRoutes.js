const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, hashPassword } = require('../auth');

// Update Google OAuth credentials for this specific user
router.post('/google-credentials', requireAuth, async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;

    await db.run(
      'UPDATE users SET google_client_id = ?, google_client_secret = ? WHERE id = ?',
      [clientId ? clientId.trim() : null, clientSecret ? clientSecret.trim() : null, req.user.id]
    );

    return res.json({ message: 'Custom Google API credentials updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update credentials' });
  }
});

// Quick Connect: Connect YouTube using a token directly (Zero Google Cloud Console setup!)
router.post('/quick-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'Please enter a valid Google OAuth token.' });
    }

    const cleanToken = token.trim();
    const axios = require('axios');

    // Test token with YouTube API to verify and get channel information
    const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`
      },
      validateStatus: () => true
    });

    if (ytRes.status !== 200) {
      const errMsg = ytRes.data?.error?.message || 'Invalid or expired token. Make sure it has youtube.upload scope.';
      return res.status(400).json({ error: errMsg });
    }

    let channelId = '';
    let channelTitle = 'My YouTube Channel';
    let channelAvatar = '';

    if (ytRes.data.items && ytRes.data.items.length > 0) {
      const ch = ytRes.data.items[0];
      channelId = ch.id;
      channelTitle = ch.snippet.title;
      channelAvatar = ch.snippet.thumbnails?.default?.url || '';
    }

    // Save token directly for this user
    await db.run(
      `UPDATE users SET 
        google_access_token = ?, 
        google_token_expiry = ?, 
        channel_id = ?, 
        channel_title = ?, 
        channel_avatar = ? 
      WHERE id = ?`,
      [
        cleanToken,
        Date.now() + (3600 * 1000), // 1 hour for standard access token
        channelId,
        channelTitle,
        channelAvatar,
        req.user.id
      ]
    );

    console.log(`[QuickConnect] Connected YouTube channel: ${channelTitle} for user ${req.user.username}`);

    return res.json({
      message: `Connected successfully to "${channelTitle}"!`,
      channelTitle,
      channelAvatar
    });
  } catch (err) {
    console.error('Quick token error:', err);
    return res.status(500).json({ error: err.message || 'Failed to connect with token' });
  }
});

// Update password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const { comparePassword } = require('../auth');
    const match = await comparePassword(currentPassword, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const hashed = await hashPassword(newPassword);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user.id]);

    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
