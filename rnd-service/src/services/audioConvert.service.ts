import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

/**
 * Converts a WebM/Opus buffer (what browsers actually produce from MediaRecorder)
 * into an OGG/Opus buffer. WhatsApp Cloud API only accepts audio/ogg with Opus
 * codecs for playable voice notes — WebM is rejected outright.
 */
export async function convertWebmToOggOpus(inputBuffer: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not available (ffmpeg-static returned null for this platform).');
  }

  const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inputPath = path.join(os.tmpdir(), `${id}-voice-in.webm`);
  const outputPath = path.join(os.tmpdir(), `${id}-voice-out.ogg`);

  await fs.promises.writeFile(inputPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as string, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', '48000',
        '-c:a', 'libopus',
        '-b:a', '32k',
        outputPath
      ]);

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });

    return await fs.promises.readFile(outputPath);
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}
