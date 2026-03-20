import jwt from "jsonwebtoken";
import { prisma } from "../db/index.js";

const createUnauthorizedError = () => {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    return error;
};

// We injected the req with user.
const verifyJWT = async (req, res, next) => {
    // 2 possible places where client can send JWT access tokens
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        return next(createUnauthorizedError());
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET); // Verifies and decodes.

        // Retrieve user excluding password and refreshToken
        const user = await prisma.user.findUnique({
            where: { id: decodedToken._id },
            select: {
                id: true,
                username: true,
                email: true,
                fullname: true,
                avatar: true,
                coverImage: true,
                role: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!user) {
            return next(createUnauthorizedError());
        }

        req.user = user; // Adding user field to the req

        return next();
    } catch (error) {
        return next(createUnauthorizedError());
    }
};

const verifyJWTOptional = async (req, res, next) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        return next();
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decodedToken._id },
            select: {
                id: true,
                username: true,
                email: true,
                fullname: true,
                avatar: true,
                coverImage: true,
                role: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (user) {
            req.user = user;
        }
    } catch (_) {
        // Intentionally ignore invalid tokens for optional auth flow.
    }

    return next();
};

export { verifyJWT, verifyJWTOptional };
