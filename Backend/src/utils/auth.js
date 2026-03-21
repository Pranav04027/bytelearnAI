import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

export const isPasswordCorrect = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user.id,
      email: user.email,
      username: user.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      _id: user.id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );
};
