/**
 * Manual end-to-end send test:
 *   npx ts-node-dev --transpile-only src/scripts/testSendWhatsApp.ts <phone> "[message]"
 *
 * Prints the full send result (mode, Meta message id, error classification) and,
 * when MongoDB is connected, the stored lifecycle record.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { assertWhatsAppConfig } from '../config/whatsapp';
import { sendWhatsAppTextDetailed } from '../services/whatsapp.service';
import { WhatsAppMessage } from '../models/whatsappMessage.model';

const args = process.argv.slice(2);
const toPhone = args[0];
const text = args[1] || 'Test message from School ERP Backend! If you see this, your permanent WhatsApp credentials are working.';

if (!toPhone) {
  console.error('Usage: npx ts-node-dev --transpile-only src/scripts/testSendWhatsApp.ts <phone_number> "[message]"');
  process.exit(1);
}

async function main() {
  assertWhatsAppConfig();

  // Optional DB connection so the lifecycle record is persisted/visible
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 } as any);
      console.log('[Test Script] MongoDB connected — message lifecycle will be recorded.');
    } catch {
      console.warn('[Test Script] MongoDB not reachable — sending without DB lifecycle record.');
    }
  }

  console.log(`[Test Script] Sending WhatsApp text to ${toPhone}...`);
  const result = await sendWhatsAppTextDetailed(toPhone, text);

  console.log('[Test Script] Result:', JSON.stringify(result, null, 2));

  if (result.success && result.wamid && mongoose.connection.readyState === 1) {
    const record = await WhatsAppMessage.findOne({ wamid: result.wamid }).lean();
    if (record) {
      console.log('[Test Script] DB record:', JSON.stringify({
        status: record.status,
        wamid: record.wamid,
        attempts: record.attempts,
        statusHistory: record.statusHistory
      }, null, 2));
      console.log('[Test Script] delivered/read updates arrive via the Meta webhook once it is publicly reachable.');
    }
  }

  await mongoose.disconnect().catch(() => undefined);
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('[Test Script] Unexpected exception:', err);
  process.exit(1);
});
