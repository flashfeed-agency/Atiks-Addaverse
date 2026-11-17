const axios = require('axios');
const { google } = require('googleapis');

/**
 * Extracts Google Drive File ID from varied URL formats or raw ID string.
 */
function extractDriveFileId(input) {
  if (!input || typeof input !== 'string') return null;
  const cleanInput = input.trim();

  // Pattern 1: /file/d/<id>/
  const matchFileD = cleanInput.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/);
  if (matchFileD) return matchFileD[1];

  // Pattern 2: ?id=<id> or &id=<id>
  const matchIdParam = cleanInput.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (matchIdParam) return matchIdParam[1];

  // Pattern 3: /open?id=<id>
  const matchOpenId = cleanInput.match(/\/open\?id=([a-zA-Z0-9_-]{25,})/);
  if (matchOpenId) return matchOpenId[1];

  // Pattern 4: /d/<id>
  const matchShortD = cleanInput.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (matchShortD) return matchShortD[1];

  // Pattern 5: Raw ID (usually 28 to 45 alphanumeric characters with underscores/dashes)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(cleanInput)) {
    return cleanInput;
  }

  return null;
}

/**
 * Generates the direct streaming iframe embed URL for Google Drive.
 */
function getDriveEmbedUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Fetch metadata for a Drive file.
 */
async function getDriveFileMetadata(fileId, oauth2Client = null) {
  if (oauth2Client) {
    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const res = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType, thumbnailLink'
      });
      return {
        id: res.data.id,
        name: res.data.name || `Video_${fileId}.mp4`,
        size: res.data.size ? parseInt(res.data.size, 10) : null,
        mimeType: res.data.mimeType || 'video/mp4'
      };
    } catch (err) {
      console.warn('[Drive] OAuth metadata fetch failed, falling back to public check:', err.message);
    }
  }

  // Fallback for public links: check headers via HEAD request
  try {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const headRes = await axios.head(downloadUrl, { maxRedirects: 5 });
    const contentDisposition = headRes.headers['content-disposition'] || '';
    const matchName = contentDisposition.match(/filename="?([^";]+)"?/);
    const fileName = matchName ? matchName[1] : `Addaverse_Video_${fileId}.mp4`;
    const contentLength = headRes.headers['content-length'] ? parseInt(headRes.headers['content-length'], 10) : null;
    const contentType = headRes.headers['content-type'] || 'video/mp4';

    return {
      id: fileId,
      name: fileName,
      size: contentLength,
      mimeType: contentType
    };
  } catch (err) {
    return {
      id: fileId,
      name: `Addaverse_Video_${fileId}.mp4`,
      size: null,
      mimeType: 'video/mp4'
    };
  }
}

/**
 * Gets a readable stream for the Drive file.
 */
async function getDriveFileStream(fileId, oauth2Client = null) {
  // If we have authenticated OAuth2 client, use Google Drive API directly
  if (oauth2Client) {
    try {
      console.log(`[Drive] Fetching authenticated stream via Drive API for ${fileId}...`);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      
      const metaRes = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType'
      });

      const streamRes = await drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return {
        stream: streamRes.data,
        name: metaRes.data.name || `Video_${fileId}.mp4`,
        size: metaRes.data.size ? parseInt(metaRes.data.size, 10) : null,
        mimeType: metaRes.data.mimeType || 'video/mp4'
      };
    } catch (oauthErr) {
      console.warn(`[Drive] OAuth stream failed (${oauthErr.message}), trying public download stream...`);
    }
  }

  // Fallback to public download stream with virus scan confirm bypass
  console.log(`[Drive] Fetching public stream for ${fileId}...`);
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  // Step 1: Request initial response
  const initialRes = await axios.get(downloadUrl, {
    responseType: 'stream',
    validateStatus: () => true
  });

  // Check if Google Drive returned a virus scan warning confirmation page
  const contentType = initialRes.headers['content-type'] || '';
  if (contentType.includes('text/html')) {
    let htmlBuffer = '';
    for await (const chunk of initialRes.data) {
      htmlBuffer += chunk.toString();
      if (htmlBuffer.length > 50000) break; // enough to find the token
    }

    const confirmMatch = htmlBuffer.match(/confirm=([0-9A-Za-z_]+)/) || htmlBuffer.match(/name="confirm" value="([0-9A-Za-z_]+)"/);
    const confirmToken = confirmMatch ? confirmMatch[1] : 't';
    
    // Cookie handling
    const cookies = initialRes.headers['set-cookie'] || [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    console.log(`[Drive] Found virus-scan confirmation token: ${confirmToken}. Re-fetching confirmed stream...`);
    const confirmedRes = await axios.get(`https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmToken}`, {
      responseType: 'stream',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const size = confirmedRes.headers['content-length'] ? parseInt(confirmedRes.headers['content-length'], 10) : null;
    return {
      stream: confirmedRes.data,
      name: `Addaverse_Video_${fileId}.mp4`,
      size: size,
      mimeType: confirmedRes.headers['content-type'] || 'video/mp4'
    };
  }

  const size = initialRes.headers['content-length'] ? parseInt(initialRes.headers['content-length'], 10) : null;
  return {
    stream: initialRes.data,
    name: `Addaverse_Video_${fileId}.mp4`,
    size: size,
    mimeType: initialRes.headers['content-type'] || 'video/mp4'
  };
}

module.exports = {
  extractDriveFileId,
  getDriveEmbedUrl,
  getDriveFileMetadata,
  getDriveFileStream
};
