import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { User, IUser } from '../models/user.model';
import { Teacher } from '../models/teacher.model';
import redisClient from './redis';
import { JWT_SECRET } from './secrets';

// Local Strategy for username/password login
passport.use(
  new LocalStrategy(
    {
      usernameField: 'username',
      passwordField: 'password'
    },
    async (username, password, done) => {
      try {
        const lowerUsername = username.trim().toLowerCase();

        // --- MongoDB Database Connection Active ---
        // Query User by username, email, employeeId, or phone
        let user: IUser | null = await User.findOne({
          $or: [
            { username: lowerUsername },
            { email: lowerUsername },
            { employeeId: lowerUsername.toUpperCase() },
            { phone: username.trim() } // phone login for employees
          ]
        }).select('+password') as IUser | null;
        
        // Backward-compatible fallback: search by Teacher model employeeId
        if (!user) {
          const teacher = await Teacher.findOne({ employeeId: { $regex: new RegExp(`^${lowerUsername}$`, 'i') } });
          if (teacher && teacher.userId) {
            user = await User.findById(teacher.userId).select('+password') as IUser | null;
          }
        }
        // Also try phone on Teacher model
        if (!user) {
          const teacher = await Teacher.findOne({ phone: username.trim() });
          if (teacher && teacher.userId) {
            user = await User.findById(teacher.userId).select('+password') as IUser | null;
          }
        }

        if (!user) {
          return done(null, false, { message: 'Incorrect Employee ID, phone or password.' });
        }

        if (!user.isActive) {
          return done(null, false, { message: 'Account is deactivated.' });
        }

        // Check if account is locked
        if (user.lockUntil && user.lockUntil > new Date()) {
          return done(null, false, { message: 'Account is temporarily locked. Try again later.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          // Increment login attempts (only if DB is connected)
          user.loginAttempts += 1;
          if (user.loginAttempts >= 10) {
            user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // lock for 30 mins
          }
          await user.save();
          return done(null, false, { message: 'Incorrect password.' });
        }

        // Reset login attempts on success
        if (user.loginAttempts > 0) {
          user.loginAttempts = 0;
          user.lockUntil = undefined;
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// JWT Strategy for token verification
const jwtSecret = JWT_SECRET;

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret
    },
    async (jwtPayload, done) => {
      try {
        const cacheKey = `user:profile:${jwtPayload.sub}`;
        let cachedUser = null;
        if (redisClient.status === 'ready') {
          try {
            const data = await redisClient.get(cacheKey);
            if (data) {
              cachedUser = JSON.parse(data);
            }
          } catch (cacheErr) {
            console.error('[Passport Cache Read Error]:', cacheErr);
          }
        }

        if (cachedUser) {
          return done(null, cachedUser);
        }

        const user = await User.findById(jwtPayload.sub);
        if (!user) {
          return done(null, false);
        }

        if (!user.isActive) {
          return done(null, false);
        }

        if (redisClient.status === 'ready') {
          try {
            // Cache user profile for 10 minutes (600 seconds)
            await redisClient.setex(cacheKey, 600, JSON.stringify(user));
          } catch (cacheErr) {
            console.error('[Passport Cache Write Error]:', cacheErr);
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

export default passport;
