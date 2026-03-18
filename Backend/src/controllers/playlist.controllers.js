import { prisma } from "../db/index.js";

const createPlaylist = async (req, res, next) => {
  try {
    const { name, description, videos } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!videos || !Array.isArray(videos)) {
      return res.status(400).json({ success: false, message: "videos array is required" });
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        description,
        ownerId: req.user.id,
        videos: {
          create: videos.map(videoId => ({
            video: { connect: { id: videoId } }
          }))
        }
      },
      include: {
        videos: {
          include: { video: true }
        }
      }
    });

    if (!playlist) {
      return res.status(501).json({ success: false, message: "A problem occured while creating the playlist" });
    }

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: playlist,
        message: "Successfully created the playlist"
      });
  } catch (err) {
    next(err);
  }
};

// Get my playlists
const getMyPlaylists = async (req, res, next) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { ownerId: req.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        videos: {
          select: {
            video: {
              select: {
                id: true,
                title: true,
                description: true,
                thumbnail: true,
                category: true,
                difficulty: true,
                duration: true,
                views: true,
                isPublished: true,
                createdAt: true
              }
            }
          }
        }
      }
    });
    
    // Format response to match old aggregate structure
    const formattedPlaylists = playlists.map(pl => ({
      ...pl,
      videos: pl.videos.map(v => v.video)
    }));
    
    if (!formattedPlaylists) {
      return res.status(500).json({ success: false, message: "An error occured while finding the Playlist" });
    }

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: formattedPlaylists,
        message: "Retrived playlist sucessfully"
      });
  } catch (err) {
    next(err);
  }
};

//Get playlist of any user by UserId in parameters
const getUserPlaylists = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Could not get userId from params" });
    }

    const playlists = await prisma.playlist.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        videos: {
          select: {
            video: {
              select: {
                id: true,
                title: true,
                description: true,
                thumbnail: true,
                category: true,
                difficulty: true,
                duration: true,
                tags: true,
                views: true,
                isPublished: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!playlists) {
       return res.status(500).json({ success: false, message: "Could not get the playlists" });
    }

    // Format response to match old aggregate structure
    const formattedPlaylists = playlists.map(pl => ({
      ...pl,
      videos: pl.videos.map(v => v.video)
    }));

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: formattedPlaylists,
        message: "Retrieved playlists successfully"
      });
  } catch (err) {
    next(err);
  }
};

const addVideoToPlaylist = async (req, res, next) => {
  try {
    const { playlistId, videoId } = req.params;

    if (!playlistId || !videoId) {
      return res.status(400).json({ success: false, message: "Could not get data from URL params" });
    }

    // Check ownership
    const checkPlaylist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });
    
    if (!checkPlaylist) {
      return res.status(404).json({ success: false, message: "Playlist not found" });
    }

    if (checkPlaylist.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "There was an authorization error." });
    }

    // Add video avoiding duplicates (Prisma `connectOrCreate` or explicit creation handling PK)
    let playlist;
    try {
      playlist = await prisma.playlist.update({
        where: { id: playlistId },
        data: {
          videos: {
            upsert: {
              where: {
                playlistId_videoId: { playlistId: playlistId, videoId: videoId }
              },
              create: { videoId: videoId },
              update: {} // Do nothing if it already exists
            }
          }
        },
        include: {
          videos: { include: { video: true } }
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Something went wrong while adding the video", errors: [error.message] });
    }

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: playlist,
        message: "Added successfully"
      });
  } catch (err) {
    next(err);
  }
};

export { createPlaylist, getMyPlaylists, getUserPlaylists, addVideoToPlaylist };
