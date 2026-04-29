const prisma = require('../db/prisma');
const ragService = require('../service/rag.service');
const s3Storage = require('../storage/s3Storage');
const { emitJobEvent } = require('../realtime/jobEvents');
const { getNats, ensureStream, ensureConsumer } = require('./natsClient');

function classifyError(error) {
  const message = (error && error.message) || 'Unknown error';
  if (/invalid|unsupported|no text|chunk/i.test(message)) return { retryable: false, code: 'VALIDATION' };
  return { retryable: true, code: 'TRANSIENT' };
}

async function runIngestJob(jobId) {
  const job = await prisma.ingestJob.findUnique({
    where: { id: jobId },
    include: { file: true },
  });
  if (!job || !job.file) return;

  const nextAttempt = job.attemptCount + 1;
  await prisma.ingestJob.update({
    where: { id: jobId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      attemptCount: nextAttempt,
    },
  });

  const attempt = await prisma.ingestAttempt.create({
    data: {
      jobId,
      attemptNo: nextAttempt,
      status: 'RUNNING',
    },
  });

  await prisma.fileAsset.update({
    where: { id: job.fileId },
    data: { status: 'PROCESSING' },
  });

  emitJobEvent(jobId, 'job.progress', {
    jobId,
    fileId: job.fileId,
    step: 'upload',
    status: 'completed',
    percentage: 20,
    message: 'File stored in S3',
  });

  try {
    const buffer = await s3Storage.getObjectBuffer(job.file.objectKey);
    const result = await ragService.ingestFileBuffer(
      buffer,
      {
        fileId: job.fileId,
        filename: job.file.filename,
        originalName: job.file.originalName,
        mimetype: job.file.mimeType,
      },
      (progress) => {
        emitJobEvent(jobId, 'job.progress', {
          jobId,
          fileId: job.fileId,
          ...progress,
        });
      },
      {
        chunkSize: job.chunkSize,
        chunkOverlap: job.chunkOverlap,
      },
    );

    await prisma.ingestAttempt.update({
      where: { id: attempt.id },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });

    await prisma.ingestJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    await prisma.fileAsset.update({
      where: { id: job.fileId },
      data: { status: 'READY' },
    });

    emitJobEvent(jobId, 'job.completed', {
      jobId,
      fileId: job.fileId,
      status: 'SUCCEEDED',
      stats: {
        vectorCount: result.inserted,
      },
    });
  } catch (error) {
    const { retryable, code } = classifyError(error);
    const maxAttempts = job.maxAttempts || Number(process.env.INGEST_MAX_RETRIES || 3);
    const terminal = !retryable || nextAttempt >= maxAttempts;
    const backoffMs = Number(process.env.INGEST_RETRY_BASE_MS || 2000) * Math.max(1, nextAttempt);

    await prisma.ingestAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode: code,
        errorMessage: error.message,
        backoffMs: terminal ? null : backoffMs,
      },
    });

    await prisma.ingestJob.update({
      where: { id: jobId },
      data: {
        status: terminal ? 'FAILED' : 'RETRY_SCHEDULED',
        lastErrorCode: code,
        lastErrorMessage: error.message,
        finishedAt: terminal ? new Date() : null,
      },
    });

    if (terminal) {
      await prisma.fileAsset.update({
        where: { id: job.fileId },
        data: { status: 'FAILED' },
      });

      emitJobEvent(jobId, 'job.failed', {
        jobId,
        fileId: job.fileId,
        status: 'FAILED',
        error: error.message,
      });
      throw Object.assign(error, { terminal: true });
    }

    emitJobEvent(jobId, 'job.retry', {
      jobId,
      fileId: job.fileId,
      status: 'RETRY_SCHEDULED',
      retryInMs: backoffMs,
      attempt: nextAttempt,
    });

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    throw Object.assign(error, { terminal: false });
  }
}

async function startIngestWorker() {
  await ensureStream();
  await ensureConsumer();
  const { js, sc } = await getNats();
  const stream = process.env.NATS_STREAM || 'FILE_INGEST';
  const durableName = process.env.NATS_CONSUMER || 'file-ingest-worker';

  const consumer = await js.consumers.get(stream, durableName);
  const messages = await consumer.consume();

  (async () => {
    for await (const msg of messages) {
      try {
        const payload = JSON.parse(sc.decode(msg.data));
        await runIngestJob(payload.jobId);
        msg.ack();
      } catch (error) {
        if (error.terminal) {
          msg.ack();
        } else {
          msg.nak();
        }
      }
    }
  })().catch((error) => {
    console.error('[IngestWorker] consumer loop failed:', error);
  });

  console.log('[IngestWorker] JetStream consumer started');
}

module.exports = {
  startIngestWorker,
  runIngestJob,
};
