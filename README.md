# 🎬 Atik's Addaverse - Cloud Studio

> **Direct Google Drive Video Player & Cloud-to-YouTube Streamer**  
> Inspired by **[@Addaverse_atik](https://www.youtube.com/@Addaverse_atik)** (Anime & Manga Storytelling).

---

## ✨ Features

1. **Stream & Play Directly from Google Drive:**
   * Paste any Google Drive video link or file ID.
   * Watch the video inside an embedded 16:9 cinema player without downloading it to your computer.
2. **Direct Cloud-to-Cloud YouTube Upload (0MB Local Disk):**
   * Piped streaming: Google Drive ➔ Addaverse Server ➔ YouTube Resumable Upload API.
   * Does **not** download the file to your local computer, phone, or tablet.
   * Real-time live transfer progress bar.
   * Uploads as **Private** (or Unlisted) draft.
3. **Instant YouTube Studio Access:**
   * Provides a direct 1-click button to open the video in **YouTube Studio** (`https://studio.youtube.com/video/{id}/edit`).
   * Add your tags, custom thumbnail, end screens, and publish directly from Studio.
4. **Multi-User Account System & Privacy Isolation:**
   * Multiple team members/creators can register and use the app.
   * Complete data privacy: Each user has their own connected YouTube channel, upload history, and Drive links. User A can never see User B's uploads or credentials.
   * Passwords securely hashed with `bcryptjs` and session managed via encrypted JWT cookies.
5. **Ready for Render.com:**
   * Pre-configured with `render.yaml` and `Procfile`.
   * Dual database support: built-in SQLite (works with zero config) + PostgreSQL (if `DATABASE_URL` is provided).

---

## 🚀 Quick Start (Local)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (.env)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your desired secret keys and Google OAuth credentials.

### 3. Start the Server
```bash
npm start
```
Open your browser at: **`http://localhost:3000`**

---

## ⚡ 30-Second Quick Connect (Zero Google Cloud Console Setup!)

**You do NOT need to create a Google Cloud project or add a credit card.**

To connect your YouTube channel in 30 seconds:
1. Open the app (`http://localhost:3000` or on Render).
2. Click **Connect YouTube Channel**.
3. In the modal, click the pre-configured link: [Google OAuth Playground](https://developers.google.com/oauthplayground/#step1&apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload&url=https%3A%2F%2F&content_type=application%2Fjson&http_method=GET&useErrorParam=false).
4. Click the blue **"Authorize APIs"** button and log in with your YouTube account.
5. Click **"Exchange authorization code for tokens"**.
6. Copy the **Access token** (starts with `ya29...`) and paste it into the app.
7. Click **Connect**!

You are now ready to stream any Google Drive video straight into YouTube!

---

## 📓 Alternative: 1-Click Google Colab Notebook

We also include **`Atiks_Addaverse_Studio.ipynb`**:
* Upload this `.ipynb` file to [Google Colab](https://colab.research.google.com/).
* It runs on Google's cloud servers with zero installation.
* Paste your Drive link, click Run, sign in with Google in 1 click, and it streams your video directly to YouTube in seconds!

---

## 🔑 Optional: Setting Up Full Google OAuth Client ID (For Production)

To allow the application to stream videos directly into your YouTube channel:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Atik Addaverse Studio`).
3. Under **APIs & Services ➔ Library**, search and enable:
   * **YouTube Data API v3**
   * **Google Drive API**
4. Under **APIs & Services ➔ OAuth consent screen**:
   * Choose **External**.
   * Fill in the App Name (`Atik's Addaverse`), User Support Email, and Developer Contact.
   * In **Scopes**, add:
     * `.../auth/youtube.upload`
     * `.../auth/youtube.readonly`
     * `.../auth/drive.readonly`
   * In **Test users**, add your Google email address.
5. Under **APIs & Services ➔ Credentials**:
   * Click **Create Credentials ➔ OAuth client ID**.
   * Application type: **Web application**.
   * Name: `Addaverse Web Client`.
   * In **Authorized redirect URIs**, add:
     * For Local: `http://localhost:3000/api/auth/google/callback`
     * For Render: `https://<YOUR-RENDER-APP-NAME>.onrender.com/api/auth/google/callback`
6. Copy your **Client ID** and **Client Secret**.

---

## ☁️ Deploying to Render.com (100% Free)

### Method 1: Using Render Blueprint (`render.yaml`)
1. Push this repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/).
3. Click **New ➔ Blueprint**.
4. Select your GitHub repository.
5. Render reads `render.yaml` and creates the Web Service automatically.
6. Under Environment Variables, fill in:
   * `APP_URL`: `https://your-service-name.onrender.com`
   * `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   * `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
   * `GOOGLE_REDIRECT_URI`: `https://your-service-name.onrender.com/api/auth/google/callback`
7. Click **Apply**.

### Method 2: Manual Web Service
1. Click **New ➔ Web Service**.
2. Connect your GitHub repository.
3. Settings:
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Plan:** `Free`
4. Add the Environment Variables from above.
5. Click **Deploy Web Service**.

---

## 🎨 Theme & Inspiration

* **Channel:** [@Addaverse_atik](https://www.youtube.com/@Addaverse_atik)
* **Design:** Crimson Flame & Obsidian Dark Studio with smooth glassmorphism and anime creator aesthetics.
