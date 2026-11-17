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
