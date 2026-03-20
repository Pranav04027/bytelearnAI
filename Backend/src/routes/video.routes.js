import {Router} from "express"
import {verifyJWT, verifyJWTOptional} from "../middlewares/auth.middlewares.js"
import {
        publishVideo,
        getVideoById,
        deleteVideo,
        updateVideo,
        togglePublishStatus,
        getAllVideos,
        addVideoView
} from "../controllers/video.controllers.js"

const router = Router()

//Unprotectd Routes
router.route("/v/:videoId").get(verifyJWTOptional, getVideoById)

router.route("/getallvideos").get(getAllVideos)

//Protected Routes
router.route("/uploadvideo").post(verifyJWT, publishVideo)

router.route("/delete-video/:videoId").delete(verifyJWT , deleteVideo)

router.route("/update-video/:videoId").patch(verifyJWT, updateVideo)

router.route("/toggleispublished/:videoId").patch(verifyJWT , togglePublishStatus)

router.route("/addview/:id").patch(verifyJWT , addVideoView)

export default router
