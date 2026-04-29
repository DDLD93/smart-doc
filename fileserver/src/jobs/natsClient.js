const { connect, StringCodec, AckPolicy, DeliverPolicy, ReplayPolicy } = require('nats');

let nc;
let js;
let jsm;
const sc = StringCodec();

async function getNats() {
  if (!nc) {
    nc = await connect({ servers: process.env.NATS_URL || 'nats://127.0.0.1:4222' });
    js = nc.jetstream();
    jsm = await nc.jetstreamManager();
  }

  return { nc, js, jsm, sc };
}

async function ensureStream() {
  const { jsm } = await getNats();
  const stream = process.env.NATS_STREAM || 'FILE_INGEST';
  const subject = process.env.NATS_SUBJECT_INGEST || 'file.ingest.requested';

  try {
    await jsm.streams.info(stream);
  } catch (error) {
    await jsm.streams.add({
      name: stream,
      subjects: [subject],
    });
  }
}

async function ensureConsumer() {
  const { jsm } = await getNats();
  const stream = process.env.NATS_STREAM || 'FILE_INGEST';
  const durableName = process.env.NATS_CONSUMER || 'file-ingest-worker';
  const subject = process.env.NATS_SUBJECT_INGEST || 'file.ingest.requested';

  try {
    await jsm.consumers.info(stream, durableName);
  } catch (error) {
    await jsm.consumers.add(stream, {
      durable_name: durableName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      replay_policy: ReplayPolicy.Instant,
      ack_wait: 30 * 1000 * 1000000,
      max_deliver: Number(process.env.INGEST_MAX_RETRIES || 3) + 1,
      filter_subject: subject,
    });
  }
}

module.exports = {
  getNats,
  ensureStream,
  ensureConsumer,
};
