import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedValue {
	ciphertext: string;
	iv: string;
	tag: string;
}

export function encryptAesGcm(value: string, base64Key: string): EncryptedValue {
	const key = Buffer.from(base64Key, 'base64');
	if (key.length !== 32) throw new Error('Encryption key must contain 32 bytes');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptAesGcm(value: EncryptedValue, base64Key: string): string {
	const key = Buffer.from(base64Key, 'base64');
	if (key.length !== 32) throw new Error('Encryption key must contain 32 bytes');
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
