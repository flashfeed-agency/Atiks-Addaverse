// Atik's Addaverse - Cloud Studio Client Logic

let currentUser = null;
let currentDriveFile = null;
let activeJobPolling = null;

// DOM Elements
const usernameDisplay = document.getElementById('usernameDisplay');
const userInitial = document.getElementById('userInitial');
const ytStatusPill = document.getElementById('ytStatusPill');
const ytIndicator = document.getElementById('ytIndicator');
const ytChannelName = document.getElementById('ytChannelName');
const ytConnectPrompt = document.getElementById('ytConnectPrompt');
const connectYtBtn = document.getElementById('connectYtBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusBanner = document.getElementById('statusBanner');

// Drive Player Elements
const driveUrlInput = document.getElementById('driveUrlInput');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const clearVideoBtn = document.getElementById('clearVideoBtn');
const browseDriveBtn = document.getElementById('browseDriveBtn');
const drivePickerModal = document.getElementById('drivePickerModal');
const closeDrivePickerBtn = document.getElementById('closeDrivePickerBtn');
const driveFilesList = document.getElementById('driveFilesList');
const videoIframe = document.getElementById('videoIframe');
const playerPlaceholder = document.getElementById('playerPlaceholder');
const videoMetaCard = document.getElementById('videoMetaCard');
const metaFileName = document.getElementById('metaFileName');
const metaFileSize = document.getElementById('metaFileSize');

// Upload Form Elements
const uploadForm = document.getElementById('uploadForm');
const videoTitleInput = document.getElementById('videoTitleInput');
const privacySelect = document.getElementById('privacySelect');
const videoDescInput = document.getElementById('videoDescInput');
const startUploadBtn = document.getElementById('startUploadBtn');

// Pipeline Elements
const pipelineContainer = document.getElementById('pipelineContainer');
const liveProgressBar = document.getElementById('liveProgressBar');
const transferStats = document.getElementById('transferStats');
const percentStats = document.getElementById('percentStats');
const stepDrive = document.getElementById('stepDrive');
const stepPipe = document.getElementById('stepPipe');
const stepYt = document.getElementById('stepYt');
const pauseUploadBtn = document.getElementById('pauseUploadBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');

let currentActiveJobId = null;
let isJobPaused = false;

// Success Banner
const uploadSuccessBanner = document.getElementById('uploadSuccessBanner');
const studioEditBtn = document.getElementById('studioEditBtn');
const watchYtBtn = document.getElementById('watchYtBtn');

// History Elements
const historyTableBody = document.getElementById('historyTableBody');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

// Settings Modal Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalYtTitle = document.getElementById('modalYtTitle');
const modalYtAvatar = document.getElementById('modalYtAvatar');
const modalDisconnectBtn = document.getElementById('modalDisconnectBtn');
const customClientId = document.getElementById('customClientId');
const customClientSecret = document.getElementById('customClientSecret');
const saveCredentialsBtn = document.getElementById('saveCredentialsBtn');
const quickTokenInput = document.getElementById('quickTokenInput');
const quickConnectBtn = document.getElementById('quickConnectBtn');
const modalAlert = document.getElementById('modalAlert');

// Format file size helper
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return 'Unknown Size';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Show alert banner
function showBanner(message, type = 'error') {
  statusBanner.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  statusBanner.innerHTML = message;
  statusBanner.style.display = 'block';
  setTimeout(() => {
    statusBanner.style.display = 'none';
  }, 7000);
}

// 1. Initialize Dashboard & Authenticate
async function initDashboard() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }

    const data = await res.json();
    currentUser = data.user;

    // Render User Info
    usernameDisplay.innerText = currentUser.username;
    userInitial.innerText = currentUser.username.charAt(0).toUpperCase();

    // Check YouTube connection
    updateYouTubeStatusUI(currentUser);

    // Check URL parameters for OAuth callbacks
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube_connected') === 'true' || params.get('google_connected') === 'true') {
      showBanner('✅ Google Account connected successfully! You are ready to upload.', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('auth_error')) {
      showBanner('❌ Google connection error: ' + decodeURIComponent(params.get('auth_error')), 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Load History
    loadUploadHistory();

  } catch (err) {
    console.error('Init error:', err);
    window.location.href = '/login.html';
  }
}

// Update YouTube UI
function updateYouTubeStatusUI(user) {
  if (user.isYouTubeConnected && user.channelTitle) {
    ytIndicator.style.background = '#10b981'; // Green
    ytChannelName.innerText = user.channelTitle;
    ytConnectPrompt.style.display = 'none';
    browseDriveBtn.style.display = 'inline-flex';
    startUploadBtn.disabled = !currentDriveFile;

    // Modal
    modalYtTitle.innerText = user.channelTitle;
    modalYtAvatar.innerHTML = user.channelAvatar 
      ? `<img src="${user.channelAvatar}" style="width:100%; height:100%; border-radius:50%;" />`
      : '🎬';
    modalDisconnectBtn.style.display = 'block';
  } else {
    ytIndicator.style.background = '#f59e0b'; // Amber
    ytChannelName.innerText = 'Google Disconnected';
    ytConnectPrompt.style.display = 'block';
    browseDriveBtn.style.display = 'none';
    startUploadBtn.disabled = true;

    // Modal
    modalYtTitle.innerText = 'Not Connected';
    modalYtAvatar.innerHTML = '📺';
    modalDisconnectBtn.style.display = 'none';
  }
}

// 2. Connect YouTube Flow
async function initiateYouTubeConnect() {
  try {
    const res = await fetch('/api/auth/google/url');
    const data = await res.json();

    if (!res.ok) {
      if (data.error && data.error.includes('credentials not configured')) {
        settingsModal.classList.add('active');
        modalAlert.className = 'alert alert-error';
        modalAlert.innerText = 'Please configure your Google Cloud Client ID & Secret first below.';
        modalAlert.style.display = 'block';
        return;
      }
      throw new Error(data.error || 'Failed to start YouTube connection');
    }

    window.location.href = data.authUrl;
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

// 3. Load & Preview Google Drive Video
async function handleLoadVideo() {
  const driveUrl = driveUrlInput.value.trim();
  if (!driveUrl) {
    showBanner('Please enter a Google Drive link or file ID.', 'error');
    return;
  }

  loadVideoBtn.disabled = true;
  loadVideoBtn.innerText = 'Loading...';

  try {
    const res = await fetch('/api/drive/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveUrl })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load video');
    }

    currentDriveFile = data;

    // Render Preview Player
    playerPlaceholder.style.display = 'none';
    videoIframe.src = data.embedUrl;
    videoIframe.style.display = 'block';

    // Metadata Card
    metaFileName.innerText = data.name;
    metaFileSize.innerText = formatBytes(data.size);
    videoMetaCard.style.display = 'grid';

    // Auto-fill Title Input if empty
    if (!videoTitleInput.value.trim()) {
      videoTitleInput.value = data.name.replace(/\.[^/.]+$/, "");
    }

    // Enable upload button if YouTube is connected
    if (currentUser && currentUser.isYouTubeConnected) {
      startUploadBtn.disabled = false;
    }

    clearVideoBtn.style.display = 'inline-flex';
    showBanner('🎬 Video loaded! You can preview it above and upload directly to YouTube.', 'success');

  } catch (err) {
    showBanner(err.message, 'error');
  } finally {
    loadVideoBtn.disabled = false;
    loadVideoBtn.innerText = 'Load & Play';
  }
}

// Stop & Close Video Player (Halts all buffering & network data)
clearVideoBtn.addEventListener('click', () => {
  videoIframe.src = '';
  videoIframe.style.display = 'none';
  playerPlaceholder.style.display = 'flex';
  clearVideoBtn.style.display = 'none';
  showBanner('⏹️ Video player stopped. Buffering halted.', 'success');
});

// 4. Start Direct Cloud-to-Cloud Upload
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentDriveFile) {
    showBanner('Please load a Google Drive video first.', 'error');
    return;
  }

  if (!currentUser.isYouTubeConnected) {
    showBanner('Please connect your YouTube channel first.', 'error');
    return;
  }

  const title = videoTitleInput.value.trim();
  const privacyStatus = privacySelect.value;
  const description = videoDescInput.value.trim();

  startUploadBtn.disabled = true;
  startUploadBtn.innerHTML = `<span>Uploading to YouTube...</span>`;
  uploadSuccessBanner.style.display = 'none';
  pipelineContainer.style.display = 'block';

  // Reset steps
  stepDrive.className = 'flow-step done';
  stepPipe.className = 'flow-step active';
  stepYt.className = 'flow-step';
  liveProgressBar.style.width = '0%';
  percentStats.innerText = '0%';
  transferStats.innerText = 'Initializing upload...';

  try {
    const res = await fetch('/api/upload/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveUrl: currentDriveFile.fileId,
        title,
        privacyStatus,
        description
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to start cloud upload');
    }

    // Start Polling Job
    pollJobProgress(data.jobId);

  } catch (err) {
    showBanner(err.message, 'error');
    startUploadBtn.disabled = false;
    startUploadBtn.innerHTML = `<span>Upload Direct to YouTube</span>`;
    pipelineContainer.style.display = 'none';
  }
});

// 5. Poll Job Progress
function pollJobProgress(jobId) {
  currentActiveJobId = jobId;
  isJobPaused = false;
  pauseUploadBtn.innerText = '⏸️ Pause Upload';
  pauseUploadBtn.style.display = 'inline-flex';
  cancelUploadBtn.style.display = 'inline-flex';

  if (activeJobPolling) clearInterval(activeJobPolling);

  activeJobPolling = setInterval(async () => {
    try {
      const res = await fetch(`/api/upload/jobs/${jobId}`);
      if (!res.ok) return;

      const job = await res.json();

      // Update progress
      const percent = job.progress_percent || 0;
      liveProgressBar.style.width = `${percent}%`;
      percentStats.innerText = `${percent}%`;

      if (job.status === 'paused') {
        isJobPaused = true;
        pauseUploadBtn.innerText = '▶️ Resume Upload';
        transferStats.innerText = `⏸️ Paused at ${percent}% (${formatBytes(job.bytes_uploaded)} / ${formatBytes(job.total_bytes)})`;
        stepPipe.className = 'flow-step';
      } else if (job.status === 'streaming') {
        isJobPaused = false;
        pauseUploadBtn.innerText = '⏸️ Pause Upload';
        stepPipe.className = 'flow-step active';
        if (job.total_bytes && job.total_bytes > 0) {
          transferStats.innerText = `Uploading: ${formatBytes(job.bytes_uploaded)} / ${formatBytes(job.total_bytes)}`;
        } else {
          transferStats.innerText = `Uploading: ${formatBytes(job.bytes_uploaded)} transferred`;
        }
      }

      // Check Status
      if (job.status === 'completed') {
        clearInterval(activeJobPolling);
        stepPipe.className = 'flow-step done';
        stepYt.className = 'flow-step done';
        liveProgressBar.style.width = '100%';
        percentStats.innerText = '100%';
        transferStats.innerText = 'Completed! Ready in YouTube Studio.';

        pauseUploadBtn.style.display = 'none';
        cancelUploadBtn.style.display = 'none';

        // Setup Studio Link
        studioEditBtn.href = job.studioUrl;
        watchYtBtn.href = job.watchUrl;
        uploadSuccessBanner.style.display = 'block';

        startUploadBtn.disabled = false;
        startUploadBtn.innerHTML = `<span>Upload Direct to YouTube</span>`;

        loadUploadHistory();
      } else if (job.status === 'cancelled') {
        clearInterval(activeJobPolling);
        transferStats.innerText = 'Upload cancelled by user.';
        showBanner('Upload cancelled.', 'error');
        pauseUploadBtn.style.display = 'none';
        cancelUploadBtn.style.display = 'none';
        startUploadBtn.disabled = false;
        startUploadBtn.innerHTML = `<span>Upload Direct to YouTube</span>`;
        loadUploadHistory();
      } else if (job.status === 'failed') {
        clearInterval(activeJobPolling);
        stepPipe.className = 'flow-step active';
        stepYt.className = 'flow-step';
        transferStats.innerText = 'Upload failed: ' + (job.error_message || 'Upload error');
        showBanner('Upload failed: ' + (job.error_message || 'Please check your connection'), 'error');

        pauseUploadBtn.style.display = 'none';
        cancelUploadBtn.style.display = 'none';
        startUploadBtn.disabled = false;
        startUploadBtn.innerHTML = `<span>Upload Direct to YouTube</span>`;
        loadUploadHistory();
      }

    } catch (e) {
      console.warn('Poll error:', e);
    }
  }, 1500);
}

// Pause / Resume Button Handler
pauseUploadBtn.addEventListener('click', async () => {
  if (!currentActiveJobId) return;

  try {
    if (isJobPaused) {
      // Resume
      const res = await fetch(`/api/upload/jobs/${currentActiveJobId}/resume`, { method: 'POST' });
      if (res.ok) {
        isJobPaused = false;
        pauseUploadBtn.innerText = '⏸️ Pause Upload';
        transferStats.innerText = 'Resuming upload...';
      }
    } else {
      // Pause
      const res = await fetch(`/api/upload/jobs/${currentActiveJobId}/pause`, { method: 'POST' });
      if (res.ok) {
        isJobPaused = true;
        pauseUploadBtn.innerText = '▶️ Resume Upload';
        transferStats.innerText = 'Upload paused.';
      }
    }
  } catch (err) {
    showBanner('Failed to toggle pause: ' + err.message, 'error');
  }
});

// Cancel Upload Button Handler
cancelUploadBtn.addEventListener('click', async () => {
  if (!currentActiveJobId) return;
  if (!confirm('Are you sure you want to cancel this upload?')) return;

  try {
    const res = await fetch(`/api/upload/jobs/${currentActiveJobId}/cancel`, { method: 'POST' });
    if (res.ok) {
      showBanner('Upload cancelled successfully.', 'error');
      if (activeJobPolling) clearInterval(activeJobPolling);
      pipelineContainer.style.display = 'none';
      startUploadBtn.disabled = false;
      startUploadBtn.innerHTML = `<span>Upload Direct to YouTube</span>`;
      loadUploadHistory();
    }
  } catch (err) {
    showBanner('Failed to cancel upload: ' + err.message, 'error');
  }
});

// 6. Load Upload History (Private to Logged In User)
async function loadUploadHistory() {
  try {
    const res = await fetch('/api/upload/jobs');
    if (!res.ok) return;

    const data = await res.json();
    const jobs = data.jobs || [];

    if (jobs.length === 0) {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No uploads yet. Paste a Google Drive video above to start your first upload!
          </td>
        </tr>
      `;
      return;
    }

    historyTableBody.innerHTML = jobs.map(job => {
      const date = new Date(job.created_at).toLocaleDateString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      let statusBadge = '';
      if (job.status === 'completed') {
        statusBadge = '<span class="badge badge-completed">Completed</span>';
      } else if (job.status === 'streaming' || job.status === 'pending') {
        statusBadge = '<span class="badge badge-streaming">Uploading</span>';
      } else if (job.status === 'paused') {
        statusBadge = '<span class="badge badge-streaming" style="color:#f59e0b;">Paused</span>';
      } else if (job.status === 'cancelled') {
        statusBadge = '<span class="badge badge-failed" style="color:#94a3b8; border-color:#64748b;">Cancelled</span>';
      } else {
        statusBadge = '<span class="badge badge-failed">Failed</span>';
      }

      let studioAction = `
        <div style="display: flex; gap: 6px; align-items: center;">
      `;

      if (job.youtube_video_id) {
        studioAction += `
          <a href="https://studio.youtube.com/video/${job.youtube_video_id}/edit" target="_blank" rel="noopener" class="btn btn-youtube btn-sm" style="padding: 4px 10px; font-size: 0.76rem;">
            Studio ➔
          </a>
        `;
      }

      studioAction += `
          <button class="btn btn-secondary btn-sm delete-job-btn" data-id="${job.id}" style="padding: 4px 8px; font-size: 0.76rem; color: #ef4444;" title="Delete Record">
            🗑️
          </button>
        </div>
      `;

      return `
        <tr>
          <td style="font-weight: 600;">${job.video_title}</td>
          <td>${statusBadge}</td>
          <td>${job.progress_percent}%</td>
          <td style="text-transform: capitalize; color: var(--text-secondary);">${job.privacy_status}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${date}</td>
          <td>${studioAction}</td>
        </tr>
      `;
    }).join('');

    // Attach delete listeners
    document.querySelectorAll('.delete-job-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const jobId = btn.getAttribute('data-id');
        if (!confirm('Delete this upload record from history?')) return;
        try {
          const delRes = await fetch(`/api/upload/jobs/${jobId}`, { method: 'DELETE' });
          if (delRes.ok) {
            loadUploadHistory();
          }
        } catch (err) {
          alert('Failed to delete job: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// 7. Event Listeners
loadVideoBtn.addEventListener('click', handleLoadVideo);
driveUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleLoadVideo();
  }
});

// Browse Google Drive Files Modal
browseDriveBtn.addEventListener('click', async () => {
  drivePickerModal.classList.add('active');
  driveFilesList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">Scanning your Google Drive for videos...</p>';

  try {
    const res = await fetch('/api/drive/my-files');
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch files');
    }

    const files = data.files || [];
    if (files.length === 0) {
      driveFilesList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px;">
          No video files found in your Google Drive root folder.<br>
          <span style="font-size: 0.8rem;">You can always paste any video link directly into the input box!</span>
        </div>
      `;
      return;
    }

    driveFilesList.innerHTML = files.map(file => {
      return `
        <div class="drive-file-card" data-id="${file.id}" data-name="${file.name}" data-size="${file.size || 0}" data-embed="${file.embedUrl}" style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-input); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
            <div style="font-size: 24px;">🎥</div>
            <div style="overflow: hidden;">
              <div style="font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">${file.name}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${formatBytes(file.size)}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 4px 12px;">Select & Play</button>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    document.querySelectorAll('.drive-file-card').forEach(card => {
      card.addEventListener('click', () => {
        const fileId = card.getAttribute('data-id');
        const fileName = card.getAttribute('data-name');
        const fileSize = parseInt(card.getAttribute('data-size'), 10);
        const embedUrl = card.getAttribute('data-embed');

        currentDriveFile = {
          fileId,
          embedUrl,
          name: fileName,
          size: fileSize
        };

        driveUrlInput.value = `https://drive.google.com/file/d/${fileId}/view`;

        // Render Preview Player
        playerPlaceholder.style.display = 'none';
        videoIframe.src = embedUrl;
        videoIframe.style.display = 'block';

        // Metadata Card
        metaFileName.innerText = fileName;
        metaFileSize.innerText = formatBytes(fileSize);
        videoMetaCard.style.display = 'grid';

        // Auto-fill Title Input
        videoTitleInput.value = fileName.replace(/\.[^/.]+$/, "");

        if (currentUser && currentUser.isYouTubeConnected) {
          startUploadBtn.disabled = false;
        }

        drivePickerModal.classList.remove('active');
        showBanner(`🎬 Loaded "${fileName}" from your Google Drive!`, 'success');
      });
    });

  } catch (err) {
    driveFilesList.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px;">${err.message}</p>`;
  }
});

closeDrivePickerBtn.addEventListener('click', () => {
  drivePickerModal.classList.remove('active');
});

drivePickerModal.addEventListener('click', (e) => {
  if (e.target === drivePickerModal) {
    drivePickerModal.classList.remove('active');
  }
});

connectYtBtn.addEventListener('click', () => {
  initiateYouTubeConnect();
});
ytStatusPill.addEventListener('click', () => {
  settingsModal.classList.add('active');
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

refreshHistoryBtn.addEventListener('click', loadUploadHistory);

// Modal Controls
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('active');
  modalAlert.style.display = 'none';
});

closeModalBtn.addEventListener('click', () => {
  settingsModal.classList.remove('active');
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.remove('active');
  }
});

// Modal Disconnect
modalDisconnectBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to disconnect this YouTube channel?')) return;
  try {
    const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
    if (res.ok) {
      window.location.reload();
    }
  } catch (e) {
    alert('Failed to disconnect');
  }
});

// Quick Token Connect (Zero Developer Setup)
quickConnectBtn.addEventListener('click', async () => {
  const token = quickTokenInput.value.trim();
  if (!token) {
    modalAlert.className = 'alert alert-error';
    modalAlert.innerText = 'Please paste your Google OAuth token first.';
    modalAlert.style.display = 'block';
    return;
  }

  quickConnectBtn.disabled = true;
  quickConnectBtn.innerText = 'Connecting...';
  modalAlert.style.display = 'none';

  try {
    const res = await fetch('/api/user/quick-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to connect');

    modalAlert.className = 'alert alert-success';
    modalAlert.innerText = data.message || 'Connected successfully!';
    modalAlert.style.display = 'block';

    setTimeout(() => {
      window.location.reload();
    }, 1000);

  } catch (err) {
    modalAlert.className = 'alert alert-error';
    modalAlert.innerText = err.message;
    modalAlert.style.display = 'block';
    quickConnectBtn.disabled = false;
    quickConnectBtn.innerText = 'Connect';
  }
});

// Modal Save Credentials
saveCredentialsBtn.addEventListener('click', async () => {
  const clientId = customClientId.value.trim();
  const clientSecret = customClientSecret.value.trim();

  saveCredentialsBtn.disabled = true;
  saveCredentialsBtn.innerText = 'Saving...';

  try {
    const res = await fetch('/api/user/google-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    modalAlert.className = 'alert alert-success';
    modalAlert.innerText = 'Credentials saved! Now click "Connect YouTube Channel".';
    modalAlert.style.display = 'block';

    setTimeout(() => {
      initiateYouTubeConnect();
    }, 1200);

  } catch (err) {
    modalAlert.className = 'alert alert-error';
    modalAlert.innerText = err.message;
    modalAlert.style.display = 'block';
  } finally {
    saveCredentialsBtn.disabled = false;
    saveCredentialsBtn.innerText = 'Save Credentials';
  }
});

// Start app
initDashboard();
