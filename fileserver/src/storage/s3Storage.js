const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3Storage {
  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';
    const resolvedAccessKeyId =
      process.env.S3_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.ACCESS_KEY_ID ||
      '';
    const resolvedSecretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.SECRET_ACCESS_KEY ||
      '';
    const credentials = {
      accessKeyId: resolvedAccessKeyId,
      secretAccessKey: resolvedSecretAccessKey,
    };

    this.bucket = process.env.S3_BUCKET || '';
    this.publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || '';
    this.endpoint = endpoint || '';
    this.region = region;
    this.accessKeyId = credentials.accessKeyId;
    this.secretAccessKey = credentials.secretAccessKey;
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
      credentials,
    });
  }

  maskSecret(value) {
    if (!value) return '<empty>';
    if (value.length <= 4) return '****';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  buildObjectKey(fileId, originalName) {
    const normalizedName = (originalName || 'upload.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `uploads/${fileId}/${Date.now()}-${normalizedName}`;
  }

  async putObject({ objectKey, buffer, mimeType }) {
    console.log('[S3Storage] Upload using credentials:', {
      endpoint: this.endpoint || '<aws-default>',
      region: this.region,
      bucket: this.bucket,
      accessKeyId: this.maskSecret(this.accessKeyId),
      secretAccessKey: this.maskSecret(this.secretAccessKey),
      objectKey,
    });

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return {
      bucket: this.bucket,
      objectKey,
      fileUrl: this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`
        : `s3://${this.bucket}/${objectKey}`,
      checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async deleteObject(objectKey) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async getObjectBuffer(objectKey) {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    const chunks = [];
    for await (const chunk of output.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getDownloadUrl(objectKey, expiresIn = 900) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }
}

module.exports = new S3Storage();
