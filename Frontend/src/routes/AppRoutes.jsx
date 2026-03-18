
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import RoleRoute from "../components/RoleRoute.jsx";
import Login from "../pages/Auth/Login.jsx";
import Register from "../pages/Auth/Register.jsx";
import Logout from "../pages/Auth/Logout.jsx";
import VideoList from "../pages/Videos/VideoList.jsx";
import VideoDetail from "../pages/Videos/VideoDetail.jsx";
import UploadVideo from "../pages/Videos/UploadVideo.jsx";
import Dashboard from "../pages/Dashboard/Dashboard.jsx";
import InstructorDashboard from "../pages/Dashboard/InstructorDashboard.jsx";
import LearnerDashboard from "../pages/Dashboard/LearnerDashboard.jsx";
import MyProfile from "../pages/Profile/MyProfile.jsx";
import EditProfile from "../pages/Profile/EditProfile.jsx";
import EditAvatar from "../pages/Profile/EditAvatar.jsx";
import EditCover from "../pages/Profile/EditCover.jsx";
import History from "../pages/History/History.jsx";
import UserChannel from "../pages/Profile/UserChannel.jsx";
import MyPlaylists from "../pages/Playlists/MyPlaylists.jsx";
import UserPlaylists from "../pages/Playlists/UserPlaylists.jsx";
import PlaylistDetail from "../pages/Playlists/PlaylistDetail.jsx";
import Bookmarks from "../pages/Bookmarks/Bookmarks.jsx";
import LikedVideos from "../pages/Likes/LikedVideos.jsx";
import Subscriptions from "../pages/Subscriptions/Subscriptions.jsx";
import Recommendations from "../pages/Recommendations/Recommendations.jsx";
import ContinueWatching from "../pages/Progress/ContinueWatching.jsx";
import Healthcheck from "../pages/Healthcheck/Healthcheck.jsx";
import Posts from "../pages/Posts/Posts.jsx";
import CreateQuiz from "../pages/Quizzes/CreateQuiz.jsx";
import TakeQuiz from "../pages/Quizzes/TakeQuiz.jsx";
import NotFound from "../pages/NotFound.jsx";
import Search from "../pages/Search/Search.jsx";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<VideoList />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="logout" element={<Logout />} />

        {/* Public content */}
        <Route path="videos/:id" element={<VideoDetail />} />
        <Route path="search" element={<Search />} />
        <Route path="u/:username" element={<UserChannel />} />
        <Route path="health" element={<Healthcheck />} />

        {/* Protected content */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="instructor"
          element={
            <RoleRoute role="instructor">
              <InstructorDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="learner/dashboard"
          element={
            <ProtectedRoute>
              <LearnerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/edit"
          element={
            <ProtectedRoute>
              <EditProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/edit-avatar"
          element={
            <ProtectedRoute>
              <EditAvatar />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/edit-cover"
          element={
            <ProtectedRoute>
              <EditCover />
            </ProtectedRoute>
          }
        />
        <Route
          path="playlists"
          element={
            <ProtectedRoute>
              <MyPlaylists />
            </ProtectedRoute>
          }
        />
        <Route
          path="playlists/:playlistId"
          element={
            <ProtectedRoute>
              <PlaylistDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="playlists/u/:userId"
          element={<UserPlaylists />}
        />
        <Route
          path="bookmarks"
          element={
            <ProtectedRoute>
              <Bookmarks />
            </ProtectedRoute>
          }
        />
        <Route
          path="likes"
          element={
            <ProtectedRoute>
              <LikedVideos />
            </ProtectedRoute>
          }
        />
        <Route
          path="subscriptions"
          element={
            <ProtectedRoute>
              <Subscriptions />
            </ProtectedRoute>
          }
        />
        <Route
          path="recommendations"
          element={
            <ProtectedRoute>
              <Recommendations />
            </ProtectedRoute>
          }
        />
        <Route
          path="continue"
          element={
            <ProtectedRoute>
              <ContinueWatching />
            </ProtectedRoute>
          }
        />
        <Route
          path="posts"
          element={
            <ProtectedRoute>
              <Posts />
            </ProtectedRoute>
          }
        />
        <Route
          path="history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* Instructor-only */}
        <Route
          path="videos/upload"
          element={
            <RoleRoute role="instructor">
              <UploadVideo />
            </RoleRoute>
          }
        />
        <Route
          path="quizzes/create/:videoId"
          element={
            <RoleRoute role="instructor">
              <CreateQuiz />
            </RoleRoute>
          }
        />

        {/* Quizzes (learner) */}
        <Route
          path="quizzes/:videoId"
          element={
            <ProtectedRoute>
              <TakeQuiz />
            </ProtectedRoute>
          }
        />

        {/* Not found */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
