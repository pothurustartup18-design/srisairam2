import { Router } from 'express';
import { login, refresh, logout, me, forgotPassword, resetPassword, changePassword } from '../../controllers/auth.controller';
import { authenticateJWT } from '../../middlewares/auth.middleware';

const router = Router();

// Login
router.post('/login', login);

// Token Refresh (rotates tokens using HttpOnly cookie)
router.post('/refresh', refresh);

// Logout (invalidates session & clears cookie)
router.post('/logout', logout);

// Profile session check
router.get('/me', authenticateJWT, me);

// Password Reset Flow
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Password Change (Authenticated)
router.post('/change-password', authenticateJWT, changePassword);

export default router;
