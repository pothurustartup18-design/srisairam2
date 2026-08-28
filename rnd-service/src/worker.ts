// Load Env first
import 'dotenv/config';

import { connectDB } from './config/db';
import { startDatabaseScheduler } from './services/scheduler';

// Connect to MongoDB
connectDB().then(() => {
  console.log('[Worker Process] Database connected successfully.');
  
  // Start the background database scheduler sweeps (reminders & overdue markers)
  startDatabaseScheduler();
  
  // Import worker configurations to instantiate the worker loops
  require('./config/worker');
}).catch(err => {
  console.error('[Worker Process] Database connection failed:', err);
  process.exit(1);
});
