/**
 * @typedef {Object} ObjectStorage
 * @property {(fileId: string, originalName: string) => string} buildObjectKey
 * @property {(args: { objectKey: string, buffer: Buffer, mimeType: string }) => Promise<{ bucket: string, objectKey: string, fileUrl: string, checksumSha256: string }>} putObject
 * @property {(objectKey: string) => Promise<void>} deleteObject
 * @property {(objectKey: string) => Promise<Buffer>} getObjectBuffer
 * @property {(objectKey: string, expiresIn?: number) => Promise<string>} getDownloadUrl
 */

module.exports = {};
