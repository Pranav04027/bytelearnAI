# ByteLearn Frontend

**ByteLearn** is a modern, high-performance video-based learning platform built with React 19 and Vite. It provides a seamless experience for learners to watch educational content, track progress, participate in quizzes, and interact with creators through posts and comments.

## 🚀 Features

### 📺 Video & Learning

* **Video Discovery:** Browse and search through a vast library of educational content.
* **Smart Playback:** Track your "Continue Watching" progress and view your watch history.
* **Interactive Quizzes:** Test your knowledge with video-specific quizzes.
* **Bookmarks:** Save videos for later reference in a dedicated bookmark section.

### 👤 User Experience

* **Personalized Dashboard:** View stats, enrolled courses, and activity.
* **Custom Profiles:** Manage your channel, update avatars, and customize cover images.
* **Subscriptions:** Follow your favorite instructors to stay updated.

### 💬 Engagement

* **Community Posts:** Stay updated with "tweets" (short posts) from creators.
* **Comments & Likes:** Engage with content through nested comments and reactions.
* **Playlists:** Create and manage curated lists of videos.

---

## 🛠️ Tech Stack

* **Core:** React 19 (Functional Components & Hooks)
* **Routing:** React Router DOM v7
* **Styling:** Tailwind CSS with PostCSS
* **State & Logic:** Context API (Auth) and Custom Hooks (`useAuth`, etc.)
* **API Client:** Axios for robust HTTP requests
* **Build Tool:** Vite

---

## 📂 Project Structure

The project follows a modular, feature-based directory structure for high maintainability:

```text
src/
├── api/          # Axios instances and API service modules (with interceptors)
├── components/   # Reusable UI components (Layouts, Navbars, etc.)
├── contexts/     # Global state management (AuthContext)
├── hooks/        # Custom React hooks
├── pages/        # Feature-specific page components (Auth, Dashboard, Videos, etc.)
└── routes/       # Centralized route definitions
```

---

## 🚦 Getting Started

### Prerequisites

* Node.js (v18 or higher recommended)
* npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/bytelearn-frontend.git
cd bytelearn-frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure Environment**
Create a `.env` file in the root directory and add your backend API URL:
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

4. **Run in development mode**
```bash
npm run dev
```

5. **Build for production**
```bash
npm run build
```

---

## 🔗 Related Project

This is the frontend repository for ByteLearn. The backend API source code can be found at: https://github.com/Pranav04027/byteLearn-backend

---

## 📄 License

This project is licensed under the MIT License.