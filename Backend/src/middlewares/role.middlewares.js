export const checkRole = (requiredRole) => (req, res, next) => {
  if (!req.user) {
    const error = new Error('No user info');
    error.statusCode = 401;
    return next(error);
  }
  if (req.user.role !== requiredRole) {
    const error = new Error('Access denied because of role conflict. This route is only avilable for instructor');
    error.statusCode = 403;
    return next(error);
  }
  next();
};
