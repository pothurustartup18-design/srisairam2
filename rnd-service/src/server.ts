// Load Env first - 'dotenv/config' runs during the import phase, so it executes
// before the hoisted imports below (a plain dotenv.config() call would run after
// them under CommonJS, leaving process.env empty for modules that read it at load time)
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import passport from 'passport';
import path from 'path';
import redisClient from './config/redis';
import { createLoginRateLimiter } from './middlewares/loginRateLimit.middleware';
import { connectDB } from './config/db';
import mongoose from 'mongoose';
import { setupTemplate as setupWhatsAppTemplate } from './scripts/setupWhatsAppTemplate';
import { assertWhatsAppConfig, getWhatsAppMode } from './config/whatsapp';
import { runWhatsAppStartupSelfTest } from './services/whatsappHealth.service';
import { initializeSocket } from './config/socket';
import { assertJwtConfig } from './config/secrets';

// Passport config
import './config/passport';

// Initialize BullMQ Queues (Producers)
import './config/queue';

// Import Middleware
import { authenticateJWT } from './middlewares/auth.middleware';

// Import Routes - Admin
import adminTeacherRoutes from './routes/admin/teacher.routes';
import adminStudentRoutes from './routes/admin/student.routes';
import adminDashboardRoutes from './routes/admin/dashboard.routes';
import adminEventRoutes from './routes/admin/event.routes';
import eventPublicRoutes from './routes/shared/eventPublic.routes';
import adminLeaveRoutes from './routes/admin/leave.routes';
import adminFeedbackRoutes from './routes/admin/feedback.routes';
import adminSettingsRoutes from './routes/admin/settings';
import adminClassRoutes from './routes/admin/class.routes';
import adminFeeStructureRoutes from './routes/admin/feeStructure.routes';
import adminExpenditureRoutes from './routes/admin/expenditure.routes';
import schoolProfileRoutes from './routes/admin/schoolProfile.routes';
import adminCalendarRoutes from './routes/admin/calendar.routes';

// Import Routes - Teacher
import teacherAttendanceRoutes from './routes/teacher/attendance.routes';
import teacherMarksRoutes from './routes/teacher/marks.routes';
import reportCardRoutes from './routes/teacher/reportCard.routes';
import teacherLeaveRoutes from './routes/teacher/leave.routes';
import teacherDelegationRoutes from './routes/teacher/delegation.routes';

// Import Routes - Parent
import parentResultsRoutes from './routes/parent/marks.routes';
import parentFeedbackRoutes from './routes/parent/feedback.routes';
import parentProfileRoutes from './routes/parent/profile.routes';

// Import Routes - Shared
import sharedAuthRoutes from './routes/shared/auth.routes';
import sharedMessageRoutes from './routes/shared/message.routes';
import sharedReceiptRoutes from './routes/shared/receipt.routes';
import sharedHomeworkRoutes from './routes/shared/homework.routes';
import whatsappWebhookRoutes from './routes/shared/whatsappWebhook.routes';

// Import Monitoring Middleware
import { monitorAndLogMiddleware, metricsHandler, recordException } from './middlewares/monitoring.middleware';

const app = express();
const PORT = process.env.PORT || 5000;

// Trust exactly one hop: nginx, which sits directly in front of this process
// (proxy_pass http://127.0.0.1:5000) and sets X-Forwarded-For. Without this,
// Express falls back to the raw socket address for req.ip, which for every
// request is nginx's own loopback connection (127.0.0.1) — every visitor
// looks identical. That silently broke three things: the login rate limiter
// keyed all attempts, from everyone, into one shared bucket (so ~20 logins
// anywhere lock out the next login attempt from anyone, and turns the login
// endpoint into a trivial one-person denial-of-service); and both audit
// logs and stored session device/IP records show every request as
// 127.0.0.1, so neither is useful for telling who actually did what.
app.set('trust proxy', 1);

// Register monitoring middleware early to capture execution duration
app.use(monitorAndLogMiddleware);

// Middleware
// Deployment-specific origins belong in configuration, not in the source tree:
// CORS_ALLOWED_ORIGINS is a comma-separated list (e.g. "https://erp.example.com").
// The localhost entries stay as built-in dev defaults.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];
const allowedOrigins = [
  ...DEV_ORIGINS,
  ...(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
];
const isPrivateLanOrigin = (origin: string) =>
  /^http:\/\/(192\.168\.|172\.(1[6-9]|2\d|3[01])\.|10\.)\d+\.\d+(:\d+)?$/.test(origin);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isPrivateLanOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(compression());
app.use(
  express.json({
    limit: '250mb', // Increased for large event media and base64 uploads
    // Keep the raw body so the WhatsApp webhook can verify Meta's
    // X-Hub-Signature-256 HMAC (computed over the exact bytes received).
    verify: (req, _res, buf) => {
      if (req.url?.startsWith('/api/whatsapp/webhook')) {
        (req as any).rawBody = buf;
      }
    }
  })
);
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Auth Route (Public)
app.use('/api/auth/login', createLoginRateLimiter(redisClient));
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/receipts', sharedReceiptRoutes);
app.use('/api/whatsapp', whatsappWebhookRoutes);
app.use('/api/school-profile', schoolProfileRoutes);
// Mixed public/private router (like schoolProfileRoutes): /verify is public,
// the main aggregation route guards itself inline via authenticateJWT.
app.use('/api/report-card', reportCardRoutes);

// PUBLIC: the permanent Event Announcement gallery link (destination of the
// WhatsApp media_url). Only handles GET /api/events/:eventId/media — every other
// /api/events/* route falls through to the authenticateJWT-gated router below.
app.use('/api/events', eventPublicRoutes);

// Protected API Routes (All routes below require JWT validation)
app.use('/api/teachers', authenticateJWT, adminTeacherRoutes);
app.use('/api/students', authenticateJWT, adminStudentRoutes);
app.use('/api/dashboard', authenticateJWT, adminDashboardRoutes);
app.use('/api/events', authenticateJWT, adminEventRoutes);
app.use('/api/settings', authenticateJWT, adminSettingsRoutes);
app.use('/api/classes', authenticateJWT, adminClassRoutes);
app.use('/api/fee-structures', authenticateJWT, adminFeeStructureRoutes);
app.use('/api/expenditure', authenticateJWT, adminExpenditureRoutes);

// Homework routes (Teacher creates, Parent reads/acknowledges)
app.use('/api/homework', authenticateJWT, sharedHomeworkRoutes);

// Attendance & Calendar routes
app.use('/api/attendance', authenticateJWT, teacherAttendanceRoutes);
app.use('/api/calendar', authenticateJWT, adminCalendarRoutes);

// Marks/Exams routes (Teacher & Parent)
app.use('/api/marks', authenticateJWT, teacherMarksRoutes);
app.use('/api/marks', authenticateJWT, parentResultsRoutes);

// Leaves routes (Admin & Teacher)
app.use('/api/leaves', authenticateJWT, adminLeaveRoutes);
app.use('/api/leaves', authenticateJWT, teacherLeaveRoutes);

// Delegation routes (Teacher)
app.use('/api/delegations', authenticateJWT, teacherDelegationRoutes);

// Feedback routes (Admin & Parent)
app.use('/api/feedbacks', authenticateJWT, adminFeedbackRoutes);
app.use('/api/feedbacks', authenticateJWT, parentFeedbackRoutes);

// Parent self-service profile (WhatsApp contact numbers)
app.use('/api/parent/profile', authenticateJWT, parentProfileRoutes);

// Direct Personal Messages routes (Admin, Teacher, Parent)
app.use('/api/messages', authenticateJWT, sharedMessageRoutes);

// Base Route
// The super-admin console is served by the frontend, not this API. APP_HOST is the
// same setting the receipt / report-card verification links already use.
app.get(['/superadmin', '/super-admin'], (req, res) => {
  res.redirect(`http://${process.env.APP_HOST || 'localhost:5173'}/super-admin`);
});

app.get('/', (req, res) => {
  res.send('School ERP API is running...');
});

// Lightweight unauthenticated health check for uptime monitors / load balancers
app.get('/healthz', (req: Request, res: Response) => {
  const mongoUp = mongoose.connection.readyState === 1;
  const redisUp = redisClient.status === 'ready';
  return res.status(200).json({
    status: mongoUp ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    mongo: mongoUp ? 'connected' : 'disconnected',
    redis: redisUp ? 'connected' : 'disconnected',
    s3: process.env.AWS_BUCKET_NAME ? 'configured' : 'not-configured',
    whatsapp: getWhatsAppMode(), // 'live' or 'simulation'; deep check at GET /api/whatsapp/health
    timestamp: new Date().toISOString()
  });
});

// Prometheus metrics endpoint
app.get('/metrics', metricsHandler);

// Start Server after DB Connection
const startServer = async () => {
  // Fail fast on invalid WhatsApp configuration and bad credentials — a clear
  // startup error beats silent per-request failures later.
  try {
    assertJwtConfig();
    assertWhatsAppConfig();
    runWhatsAppStartupSelfTest().catch((err) => {
      console.error('[WhatsApp Self-Test] Background self-test failed:', err);
    });
  } catch (err: any) {
    console.error(`\n[FATAL] ${err?.message || err}\n`);
    process.exit(1);
  }

  await connectDB();

  // Automatically verify/create WhatsApp fallback template with Meta on startup
  setupWhatsAppTemplate().catch((err) => {
    console.error('[WhatsApp API] Auto template setup failed:', err);
  });

  const httpServer = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Without this, a second instance started on top of an already-running one (e.g.
  // start_all.bat re-run without closing the old windows, or `npm run dev` launched
  // manually in a second terminal) fails to bind silently into the generic
  // uncaughtException handler below — indistinguishable from a real crash, and easy
  // to miss buried in a terminal window nobody's watching. This makes the actual
  // cause immediate and unambiguous instead.
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[FATAL] Port ${PORT} is already in use — another instance of this server is ` +
        `already running (likely a second "npm run dev" / start_all.bat launch on top of ` +
        `one that's still up). Close the other instance first.\n`
      );
      process.exit(1);
    }
    throw err;
  });

  initializeSocket(httpServer);
};

// Last-resort guards so an async bug can never silently kill messaging:
// log unhandled rejections and keep serving; log uncaught exceptions and exit
// non-zero so the process manager (PM2) restarts a clean instance.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception — exiting for a clean restart:', err);
  process.exit(1);
});

// Global JSON error handler — must be last middleware registered
// Catches any error passed via next(err) in any route handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error Handler]', err);
  recordException(req, err);
  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

startServer();

