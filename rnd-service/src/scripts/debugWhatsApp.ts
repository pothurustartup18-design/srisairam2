import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined in .env file');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  // Check the WhatsAppMessage collection dynamically since we don't have the model import handy,
  // or we can import/require it if needed. Let's find it.
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);
  console.log('Collections:', names);

  // Look for WhatsAppMessage collection name. In typical setups, it is lowercase pluralized, e.g. "whatsappmessages".
  const waCollectionName = names.find(n => n.toLowerCase().includes('whatsapp'));
  if (!waCollectionName) {
    console.log('No whatsapp message collection found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Querying last 10 messages in collection "${waCollectionName}"...`);
  const waMessages = await db.collection(waCollectionName).find().sort({ createdAt: -1 }).limit(10).toArray();
  for (const msg of waMessages) {
    console.log(`\nID: ${msg._id}`);
    console.log(`To: ${msg.to}`);
    console.log(`Status: ${msg.status}`);
    console.log(`Type: ${msg.messageType}`);
    console.log(`Body Preview: ${msg.bodyPreview}`);
    console.log(`Attempts: ${msg.attempts}`);
    console.log(`Error:`, msg.error);
    console.log(`CreatedAt: ${msg.createdAt}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
