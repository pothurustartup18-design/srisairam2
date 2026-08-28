import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access token is invalid, expired, or missing.'
      });
    }
    req.user = user;
    return next();
  })(req, res, next);
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const user = req.user as any;

    const userRole = user.role;
    if (userRole === 'superadmin' || allowedRoles.includes(userRole)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Forbidden: Insufficient privileges. Required role: ${allowedRoles.join(' or ')}`
    });
  };
};
