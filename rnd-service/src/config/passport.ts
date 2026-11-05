import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { User, IUser } from '../models/user.model';
import { Teacher } from '../models/teacher.model';
import { matchesInitialCredential } from '../services/parentAccount.service';
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
        const trimmed = username.trim();
        const lowerUsername = trimmed.toLowerCase();
        const upperUsername = trimmed.toUpperCase();

        // Query User by username, employeeId, email, or phone
        let user: IUser | null = await User.findOne({
          $or: [
            { username: lowerUsername },
            { username: upperUsername },
            { employeeId: upperUsername },
            { employeeId: lowerUsername },
            { email: lowerUsername },
            { phone: trimmed }
          ]
        }).select('+password') as IUser | null;
        
        // Backward-compatible fallback: search by Teacher model employeeId or phone
        if (!user) {
          const teacher = await Teacher.findOne({
            $or: [
              { employeeId: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
              { phone: trimmed }
            ]
          });
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

        let isMatch = await user.comparePassword(password);

        // Parents who haven't set their own password yet may also sign in with the
        // student's primary number or date of birth (see parentAccount.service).
        if (!isMatch) isMatch = await matchesInitialCredential(user, password);

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
