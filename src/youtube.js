const axios = require('axios');
const https = require('https');
const { URL } = require('url');

/**
 * Initiates a YouTube Resumable Upload session.
 */
async function initiateResumableUpload({
  accessToken,
  title,
  description = 'Uploaded via Atik\'s Addaverse directly from Google Drive.',
  privacyStatus = 'private',
  fileSize = null,
  mimeType = 'video/mp4'
}) {
  const metadata = {
    snippet: {
      title: title || 'Atik\'s Addaverse - New Upload',
      description: description,
      tags: ['Addaverse', 'Anime', 'Atik', 'Storytelling']
    },
    status: {
      privacyStatus: privacyStatus || 'private', // Default private so creator reviews in Studio
      selfDeclaredMadeForKids: false
    }
  };

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType
  };

  if (fileSize && fileSize > 0) {
    headers['X-Upload-Content-Length'] = fileSize.toString();
  }

  const endpoint = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

  const res = await axios.post(endpoint, metadata, {
    headers: headers,
    validateStatus: (status) => status === 200
  });

  const uploadUrl = res.headers['location'];
  if (!uploadUrl) {
    throw new Error('YouTube API did not return an upload session URL.');
  }

  return uploadUrl;
}

/**
 * Pipes a readable stream from Google Drive straight to YouTube's upload URL.
 * Never touches the server's disk!
 */
function streamToYouTubeResumableUrl({
  uploadUrl,
  stream,
  fileSize = null,
  mimeType = 'video/mp4',
  onProgress = () => {}
}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(uploadUrl);
    let bytesUploaded = 0;

    const reqHeaders = {
      'Content-Type': mimeType
    };

    if (fileSize && fileSize > 0) {
      reqHeaders['Content-Length'] = fileSize;
    }

    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PUT',
      headers: reqHeaders
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const data = JSON.parse(responseBody);
            const videoId = data.id;
            resolve({
              videoId: videoId,
              watchUrl: `https://youtu.be/${videoId}`,
              studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
              raw: data
            });
          } catch (e) {
            reject(new Error(`Failed to parse YouTube upload response: ${responseBody}`));
          }
        } else {
          reject(new Error(`YouTube upload returned status ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    // Track data flowing through the pipe
    stream.on('data', (chunk) => {
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
    });

    stream.on('error', (err) => {
      req.destroy();
      reject(new Error(`Google Drive stream interrupted: ${err.message}`));
    });

    // Pipe the drive stream directly to YouTube
    stream.pipe(req);
  });
}

module.exports = {
  initiateResumableUpload,
  streamToYouTubeResumableUrl
};
