import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { AuditService } from '../audit/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../shared/errors.js';

export class AvatarService {
	private readonly s3: S3Client | null;

	constructor(
		private readonly db: Database,
		private readonly config: AppConfig,
		private readonly audit: AuditService,
	) {
		this.s3 = config.AVATAR_ENABLED
			? new S3Client({
					region: config.S3_REGION,
					endpoint: config.S3_ENDPOINT ?? '',
					forcePathStyle: true,
					credentials: { accessKeyId: config.S3_ACCESS_KEY_ID ?? '', secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? '' },
				})
			: null;
	}

	private client(): S3Client {
		if (!this.s3 || !this.config.S3_BUCKET) throw new AppError(503, 'AVATAR_STORAGE_DISABLED', 'Avatar storage is disabled');
		return this.s3;
	}

	async upload(userId: string, input: Buffer): Promise<{ url: string; version: number }> {
		if (input.length > 2 * 1024 * 1024) throw new AppError(413, 'AVATAR_TOO_LARGE', 'Avatar must be at most 2 MB');
		let image: Buffer;
		try {
			const source = sharp(input, { failOn: 'error', limitInputPixels: 25_000_000 });
			const metadata = await source.metadata();
			if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported format');
			image = await source.rotate().resize(512, 512, { fit: 'cover', position: 'attention' }).webp({ quality: 86 }).toBuffer();
		} catch {
			throw new AppError(400, 'AVATAR_INVALID', 'Use a valid JPEG, PNG or WebP image');
		}
		const [user] = await this.db
			.select({ key: users.avatarObjectKey, version: users.avatarVersion })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
		const version = user.version + 1;
		const key = `avatars/${userId}/avatar-v${version}.webp`;
		await this.client().send(
			new PutObjectCommand({
				Bucket: this.config.S3_BUCKET,
				Key: key,
				Body: image,
				ContentType: 'image/webp',
				CacheControl: 'private, max-age=300',
			}),
		);
		await this.db
			.update(users)
			.set({ avatarObjectKey: key, avatarVersion: version, avatarUpdatedAt: new Date(), updatedAt: new Date() })
			.where(eq(users.id, userId));
		if (user.key)
			await this.client()
				.send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: user.key }))
				.catch(() => undefined);
		await this.audit.write({ type: 'account.avatar.updated', success: true, actorUserId: userId, targetUserId: userId });
		return { url: `/avatars/${userId}?v=${version}`, version };
	}

	async remove(userId: string): Promise<void> {
		const [user] = await this.db.select({ key: users.avatarObjectKey }).from(users).where(eq(users.id, userId)).limit(1);
		if (user?.key) await this.client().send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: user.key }));
		await this.db
			.update(users)
			.set({ avatarObjectKey: null, avatarUpdatedAt: null, avatarVersion: 0, updatedAt: new Date() })
			.where(eq(users.id, userId));
		await this.audit.write({ type: 'account.avatar.removed', success: true, actorUserId: userId, targetUserId: userId });
	}

	async signedUrl(userId: string): Promise<string> {
		const [user] = await this.db.select({ key: users.avatarObjectKey }).from(users).where(eq(users.id, userId)).limit(1);
		if (!user?.key) throw new AppError(404, 'AVATAR_NOT_FOUND', 'Avatar not found');
		return getSignedUrl(this.client(), new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: user.key }), { expiresIn: 300 });
	}
}
