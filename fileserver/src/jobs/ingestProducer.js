const prisma = require('../db/prisma');
const { emitJobEvent } = require('../realtime/jobEvents');
const { getNats, ensureStream } = require('./natsClient');

async function queueIngestJob({ fileId, chunkSize, chunkOverlap }) {
  const job = await prisma.ingestJob.create({
    data: {
      fileId,
      chunkSize,
      chunkOverlap,
      maxAttempts: Number(process.env.INGEST_MAX_RETRIES || 3),
      status: 'QUEUED',
    },
  });

  await ensureStream();
  const { js, sc } = await getNats();
  const subject = process.env.NATS_SUBJECT_INGEST || 'file.ingest.requested';
  await js.publish(
    subject,
    sc.encode(
      JSON.stringify({
        jobId: job.id,
        fileId,
      }),
    ),
  );

  emitJobEvent(job.id, 'job.queued', {
    jobId: job.id,
    fileId,
    status: job.status,
  });

  return job;
}

module.exports = {
  queueIngestJob,
};
