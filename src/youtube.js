const { google } = require('googleapis');
const { Transform } = require('stream');

/**
 * Robust cloud-to-cloud upload to YouTube using Google's official Resumable Upload SDK.
 * Handles automatic chunking, retries, and network blips with ZERO socket hang-ups.
 */
async function uploadVideoToYouTube({
  oauth2Client,
  title,
  description = 'Uploaded via Atik\'s Addaverse directly from Google Drive.',
  privacyStatus = 'private',
  stream,
  fileSize = null,
  mimeType = 'video/mp4',
  controller = null,
  onProgress = () => {}
}) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  let bytesUploaded = 0;

  // Transform stream to monitor real-time bytes flowing to YouTube
  const progressStream = new Transform({
    transform(chunk, encoding, callback) {
      if (controller && controller.isCancelled) {
        return callback(new Error('Upload cancelled by user.'));
      }
      bytesUploaded += chunk.length;
      let percent = 0;
      if (fileSize && fileSize > 0) {
        percent = Math.min(99, Math.round((bytesUploaded / fileSize) * 100));
      }
      onProgress({
        bytesUploaded,
        totalBytes: fileSize,
        percent
      });
      callback(null, chunk);
    }
  });

  // Attach pause/resume/cancel controls
  if (controller) {
    controller.pause = () => {
      controller.isPaused = true;
      stream.pause();
    };
    controller.resume = () => {
      controller.isPaused = false;
      stream.resume();
    };
    controller.cancel = () => {
      controller.isCancelled = true;
      try { stream.destroy(); } catch (e) {}
      try { progressStream.destroy(); } catch (e) {}
    };
  }

  stream.pipe(progressStream);

  console.log(`[YouTube SDK] Initiating resilient upload for: "${title}" (Size: ${fileSize || 'unknown'})...`);

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: title || 'Atik\'s Addaverse - New Upload',
          description: description || 'Uploaded via Atik\'s Addaverse.',
          tags: ['Addaverse', 'Anime', 'Storytelling']
        },
        status: {
          privacyStatus: privacyStatus || 'private', // Strictly private draft
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        mimeType: mimeType || 'video/mp4',
        body: progressStream
      }
    },
    {
      // Resumable upload with 5 automatic retries on network blips or timeouts
      retry: true,
      retryConfig: {
        retry: 5,
        retryDelay: 2000,
        statusCodesToRetry: [[100, 199], [408, 408], [429, 429], [500, 599]]
      }
    }
  );

  const videoId = res.data.id;
  return {
    videoId: videoId,
    watchUrl: `https://youtu.be/${videoId}`,
    studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
    raw: res.data
  };
}

module.exports = {
  uploadVideoToYouTube
};
