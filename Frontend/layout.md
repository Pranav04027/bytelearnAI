src/
├── api/
│   ├── auth.js              // /api/v1/users/*
│   ├── videos.js            // /api/v1/videos/*
│   ├── playlists.js         // /api/v1/playlists/*
│   ├── subscriptions.js     // /api/v1/subscriptions/*
│   ├── comments.js          // /api/v1/comments/*
│   ├── posts.js             // /api/v1/tweets/* (usertweets/:userId, createtweet, updatetweet/:tweetId, deletetweet/:tweetId)
│   ├── likes.js             // /api/v1/likes/*
│   ├── bookmarks.js         // /api/v1/bookmarks/*
│   ├── progress.js          // /api/v1/progress/*
│   ├── recommendations.js   // /api/v1/recommendations/*
│   └── quizzes.js           // /api/v1/quizzes/* (create, :videoId, :videoId/submit)
│
├── components/
│   ├── Layout.jsx
│   ├── Navbar.jsx
│   └── ProtectedRoute.jsx
│
├── contexts/
│   └── AuthContext.jsx
│
├── hooks/
│   └── useAuth.js
│
├── pages/
│   ├── Auth/
│   │   ├── Login.jsx              // POST /api/v1/users/login
│   │   ├── Register.jsx           // POST /api/v1/users/register
│   │   └── Logout.jsx             // POST /api/v1/users/logout
│   │
│   ├── Videos/
│   │   ├── VideoList.jsx          // GET /api/v1/videos/getallvideos
│   │   ├── VideoDetail.jsx        // GET /api/v1/videos/v/:videoId
│   │   └── UploadVideo.jsx        // POST /api/v1/videos/uploadvideo
│   │
│   ├── Playlists/
│   │   ├── MyPlaylists.jsx        // GET /api/v1/playlists/my-playlists
│   │   ├── UserPlaylists.jsx      // GET /api/v1/playlists/p/:userId
│   │   └── EditPlaylist.jsx       // PATCH /api/v1/playlists/p/:playlistId/v/:videoId
│   │
│   ├── Subscriptions/
│   │   └── Subscriptions.jsx      // GET /api/v1/subscriptions/subscribed-channels/:subscriberId, POST /api/v1/subscriptions/togglesubscription/:channelId
│   │
│   ├── Comments/
│   │   └── VideoComments.jsx      // GET /api/v1/comments/getvideocomments/:videoId, POST /api/v1/comments/comment/:videoId
│   │
│   ├── Likes/
│   │   └── LikedVideos.jsx        // GET /api/v1/likes/likedvideos, POST /api/v1/likes/likevideo/:videoId, POST /api/v1/likes/likecomment/:commentId, POST /api/v1/likes/liketweet/:tweetId
│   │
│   ├── Bookmarks/
│   │   └── Bookmarks.jsx          // GET /api/v1/bookmarks/mybookmarks, POST /api/v1/bookmarks/addBookmark/:videoId, DELETE /api/v1/bookmarks/removeBookmark/:videoId
│   │
│   ├── Progress/
│   │   └── ContinueWatching.jsx   // GET /api/v1/progress/continue, POST /api/v1/progress/update/:videoId
│   │
│   ├── Recommendations/
│   │   └── Recommendations.jsx    // GET /api/v1/recommendations/recommended
│   │
│   ├── Quizzes/
│   │   ├── CreateQuiz.jsx         // POST /api/v1/quizzes/create { video, questions }
│   │   └── TakeQuiz.jsx           // GET /api/v1/quizzes/:videoId, POST /api/v1/quizzes/:videoId/submit
│   │
│   ├── Profile/
│   │   ├── MyProfile.jsx          // GET /api/v1/users/current-user, PATCH /api/v1/users/update-account-details
│   │   ├── EditAvatar.jsx         // PATCH /api/v1/users/update-avatar
│   │   ├── EditCover.jsx          // PATCH /api/v1/users/update-coverimage
│   │   └── UserChannel.jsx        // GET /api/v1/users/c/:username
│   │
│   ├── Posts/
│   │   └── Posts.jsx              // GET /api/v1/tweets/usertweets/:userId, POST /api/v1/tweets/createtweet, PATCH /api/v1/tweets/updatetweet/:tweetId, DELETE /api/v1/tweets/deletetweet/:tweetId
│   │
│   ├── History/
│   │   └── History.jsx            // GET /api/v1/users/watch-history
│   │
│   ├── Dashboard/
│   │   └── Dashboard.jsx          // GET /api/v1/users/dashboard (learner), GET /api/v1/dashboard/channel-stats, GET /api/v1/dashboard/channel-videos/:userId (instructor)
│   │
│   └── Healthcheck/
│       └── Healthcheck.jsx       // GET /api/v1/healthcheck
│
└── routes/
    └── AppRoutes.jsx             // Maps:
                                 // / → VideoList.jsx
                                 // /login → Login.jsx
                                 // /register → Register.jsx
                                 // /logout → Logout.jsx
                                 // /videos → VideoList.jsx
                                 // /videos/:id → VideoDetail.jsx
                                 // /videos/upload → UploadVideo.jsx
                                 // /playlists → MyPlaylists.jsx
                                 // /playlists/:userId → UserPlaylists.jsx
                                 // /playlists/:playlistId/edit → EditPlaylist.jsx
                                 // /subscriptions → Subscriptions.jsx
                                 // /videos/:videoId/comments → VideoComments.jsx
                                 // /likes → LikedVideos.jsx
                                 // /bookmarks → Bookmarks.jsx
                                 // /continue → ContinueWatching.jsx
                                 // /recommendations → Recommendations.jsx
                                 // /quizzes/create → CreateQuiz.jsx
                                 // /quizzes/:videoId → TakeQuiz.jsx
                                 // /profile → MyProfile.jsx
                                 // /profile/edit/avatar → EditAvatar.jsx
                                 // /profile/edit/cover → EditCover.jsx
                                 // /u/:username → UserChannel.jsx
                                 // /posts → Posts.jsx
                                 // /history → History.jsx
                                 // /dashboard → Dashboard.jsx
                                 // /healthcheck → Healthcheck.jsx