import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Server as HTTPServer } from 'http';
import { JWT_SECRET } from './secrets';
import { User } from '../models/user.model';
import { Teacher } from '../models/teacher.model';

let io: SocketIOServer | null = null;

export const initializeSocket = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      // The access token issued by auth.controller carries the user id in `sub`.
      // This previously read `decoded.id`, which is never present, so every socket
      // had an undefined userId and the userSockets map stayed permanently empty.
      const userId = String(decoded.sub || decoded.id || '');
      if (!userId) {
        return next(new Error('Authentication error: Invalid token'));
      }

      // Resolve the delivery scopes this connection is allowed to receive on.
      // Doing it once at handshake keeps per-message emits cheap.
      const user = await User.findById(userId).lean();
      if (!user || user.isActive === false) {
        return next(new Error('Authentication error: Invalid token'));
      }

      let teacherId: string | null = null;
      if (user.role === 'teacher') {
        const teacher = await Teacher.findOne({ userId: user._id }).select('_id').lean();
        teacherId = teacher ? String(teacher._id) : null;
      }

      socket.data = {
        userId,
        username: decoded.username,
        role: user.role,
        studentId: user.studentId ? String(user.studentId) : null,
        teacherId
      };
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role, studentId, teacherId } = socket.data as {
      userId: string; role: string; studentId: string | null; teacherId: string | null;
    };

    if (userId) {
      // Rooms are the delivery boundary: without them every `io.emit` fan-out
      // reached every logged-in browser, so one parent's socket received the
      // full text of every message sent anywhere in the school.
      socket.join(`user:${userId}`);
      socket.join(`role:${role}`);
      if (studentId) socket.join(`student:${studentId}`);
      if (teacherId) socket.join(`teacher:${teacherId}`);

      console.log(`[Socket] User ${userId} (${role}) connected on socket ${socket.id}`);
    }

    socket.on('disconnect', () => {
      if (userId) {
        console.log(`[Socket] User ${userId} disconnected`);
      }
    });
  });
};

/** Staff who may see any thread in the school. */
const STAFF_ROOMS = ['role:admin', 'role:superadmin'];

/**
 * Deliver a new message only to the parties on that thread:
 * the parent(s) of the student it belongs to, the school staff, and — for
 * student threads, which teachers also work from — the teacher role.
 */
export const emitNewMessage = (message: { studentId?: unknown; teacherId?: unknown }) => {
  if (!io) return;
  const studentId = message.studentId ? String(message.studentId) : null;
  const teacherId = message.teacherId ? String(message.teacherId) : null;

  let channel = io.to(STAFF_ROOMS);
  if (studentId) {
    channel = channel.to(`student:${studentId}`).to('role:teacher');
  } else if (teacherId) {
    channel = channel.to(`teacher:${teacherId}`);
  } else {
    return; // unaddressed message: nothing to fan out to
  }
  channel.emit('new_message', message);
};

/** Broadcast school-wide configuration that every signed-in client renders. */
export const emitToAll = (event: string, data: any) => {
  if (!io) return;
  io.emit(event, data);
};

