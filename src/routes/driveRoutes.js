const express = require('express');
const router = express.Router();
const { requireAuth, getUserOAuthClient } = require('../auth');
const { extractDriveFileId, getDriveEmbedUrl, getDriveFileMetadata } = require('../drive');

// Parse drive URL, validate, and return embed + metadata
router.post('/parse', requireAuth, async (req, res) => {
  try {
    const { driveUrl } = req.body;

    if (!driveUrl) {
      return res.status(400).json({ error: 'Please provide a Google Drive video link or file ID.' });
    }

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) {
      return res.status(400).json({
        error: 'Invalid Google Drive link. Please make sure the link includes the file ID (e.g. https://drive.google.com/file/d/XYZ.../view).'
      });
    }

    let oauth2Client = null;
    if (req.user.google_access_token) {
      try {
        oauth2Client = await getUserOAuthClient(req.user);
      } catch (e) {
        console.warn('OAuth client creation for metadata skipped:', e.message);
      }
    }

    const metadata = await getDriveFileMetadata(fileId, oauth2Client);
    const embedUrl = getDriveEmbedUrl(fileId);

    return res.json({
      fileId,
      embedUrl,
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType
    });
  } catch (err) {
    console.error('Error parsing Drive URL:', err);
    return res.status(500).json({ error: 'Failed to inspect Drive video link.' });
  }
});

module.exports = router;
