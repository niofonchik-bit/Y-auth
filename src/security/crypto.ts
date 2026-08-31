import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function constantEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashClientSecret(secret: string): string {
  return `sha256:${sha256(secret)}`;
}

export function verifyClientSecret(stored: string, provided: string): boolean {
  if (!stored.startsWith('sha256:')) return false;
  return constantEqual(stored, hashClientSecret(provided));
}
