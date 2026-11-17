const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, getUserOAuthClient } = require('../auth');
const { extractDriveFileId, getDriveFileStream, getDriveFileMetadata } = require('../drive');
const { initiateResumableUpload, streamToYouTubeResumableUrl } = require('../youtube');

// Start direct cloud-to-cloud upload from Google Drive to YouTube
router.post('/start', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { driveUrl, title, description, privacyStatus = 'private' } = req.body;

    if (!driveUrl) {
      return res.status(400).json({ error: 'Google Drive URL or file ID is required.' });
    }

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) {
      return res.status(400).json({ error: 'Invalid Google Drive link format.' });
    }

    if (!user.google_access_token) {
      return res.status(400).json({
        error: 'Please connect your YouTube channel first by clicking "Connect YouTube" in your dashboard.'
      });
    }

    // Prepare OAuth client
    const oauth2Client = await getUserOAuthClient(user);
    const accessToken = (await oauth2Client.getAccessToken()).token;

    // Get metadata
    const metadata = await getDriveFileMetadata(fileId, oauth2Client);
    const videoTitle = title && title.trim().length > 0 
      ? title.trim() 
      : metadata.name.replace(/\.[^/.]+$/, ""); // strip extension

    // Create job ID
    const jobId = 'job_' + crypto.randomBytes(8).toString('hex');

    await db.run(
      `INSERT INTO upload_jobs (
        id, user_id, drive_file_id, drive_file_name, video_title, privacy_status, status, total_bytes, progress_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        user.id,
        fileId,
        metadata.name,
        videoTitle,
        privacyStatus,
        'pending',
        metadata.size || 0,
        0
      ]
    );

    // Return immediate response with jobId so UI can monitor progress
    res.json({
      message: 'Cloud-to-cloud upload started!',
      jobId,
      videoTitle,
      fileSize: metadata.size
    });

    // Run the direct cloud-to-cloud streaming in the background
    (async () => {
      try {
        console.log(`[UploadJob ${jobId}] Starting Drive ➔ YouTube stream for ${fileId}...`);
        
        await db.run('UPDATE upload_jobs SET status = ? WHERE id = ?', ['streaming', jobId]);

        // Step 1: Open Google Drive stream
        const driveData = await getDriveFileStream(fileId, oauth2Client);

        // Step 2: Initiate YouTube Resumable Upload Session
        const uploadUrl = await initiateResumableUpload({
          accessToken,
          title: videoTitle,
          description: description || `Uploaded via Atik's Addaverse direct from Google Drive.\nOriginal: ${driveData.name}`,
          privacyStatus: privacyStatus || 'private',
          fileSize: driveData.size,
          mimeType: driveData.mimeType || 'video/mp4'
        });

        // Step 3: Stream video chunks directly through RAM to YouTube
        let lastReportedPercent = 0;
        let lastUpdateTime = Date.now();

        const uploadResult = await streamToYouTubeResumableUrl({
          uploadUrl,
          stream: driveData.stream,
          fileSize: driveData.size,
          mimeType: driveData.mimeType || 'video/mp4',
          onProgress: async ({ bytesUploaded, totalBytes, percent }) => {
            const now = Date.now();
            // Throttled database update (every 2% or every 2 seconds)
            if (percent !== lastReportedPercent && (now - lastUpdateTime > 1500 || percent === 100)) {
              lastReportedPercent = percent;
              lastUpdateTime = now;
              try {
                await db.run(
                  'UPDATE upload_jobs SET bytes_uploaded = ?, total_bytes = ?, progress_percent = ? WHERE id = ?',
                  [bytesUploaded, totalBytes || 0, percent, jobId]
                );
              } catch (e) {
                // Ignore DB busy error during fast streaming
              }
            }
          }
        });

        // Step 4: Mark completed with YouTube video ID
        console.log(`[UploadJob ${jobId}] SUCCESS! Uploaded videoId: ${uploadResult.videoId}`);
        await db.run(
          `UPDATE upload_jobs SET 
            status = 'completed', 
            progress_percent = 100, 
            youtube_video_id = ?, 
            completed_at = CURRENT_TIMESTAMP 
          WHERE id = ?`,
          [uploadResult.videoId, jobId]
        );

      } catch (uploadError) {
        console.error(`[UploadJob ${jobId}] FAILED:`, uploadError);
        await db.run(
          'UPDATE upload_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['failed', uploadError.message || 'Stream upload failed', jobId]
        );
      }
    })();

  } catch (err) {
    console.error('Error starting upload:', err);
    return res.status(500).json({ error: err.message || 'Failed to start upload' });
  }
});

// Get user's upload history (Strict privacy: user only sees their own uploads)
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const jobs = await db.query(
      `SELECT id, drive_file_id, drive_file_name, video_title, privacy_status, 
              youtube_video_id, status, bytes_uploaded, total_bytes, progress_percent, 
              error_message, created_at, completed_at
       FROM upload_jobs 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );

    return res.json({ jobs });
  } catch (err) {
    console.error('Error fetching jobs:', err);
    return res.status(500).json({ error: 'Failed to retrieve uploads' });
  }
});

// Get single job progress
router.get('/jobs/:id', requireAuth, async (req, res) => {
  try {
    const job = await db.get(
      `SELECT id, drive_file_id, drive_file_name, video_title, privacy_status, 
              youtube_video_id, status, bytes_uploaded, total_bytes, progress_percent, 
              error_message, created_at, completed_at
       FROM upload_jobs 
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let studioUrl = null;
    let watchUrl = null;
    if (job.youtube_video_id) {
      studioUrl = `https://studio.youtube.com/video/${job.youtube_video_id}/edit`;
      watchUrl = `https://youtu.be/${job.youtube_video_id}`;
    }

    return res.json({
      ...job,
      studioUrl,
      watchUrl
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve job status' });
  }
});

module.exports = router;
