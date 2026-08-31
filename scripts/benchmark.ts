import { performance } from 'node:perf_hooks';
import { loadConfig } from '../src/config/env.js';
import { hashPassword, verifyPassword } from '../src/security/password.js';

function average(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const config = loadConfig();
const hashTimes: number[] = [];
const verifyTimes: number[] = [];
let hash = '';

for (let index = 0; index < 5; index += 1) {
	const started = performance.now();
	hash = await hashPassword(`benchmark-password-${index}`, config);
	hashTimes.push(performance.now() - started);
}
for (let index = 0; index < 20; index += 1) {
	const started = performance.now();
	await verifyPassword(hash, 'benchmark-password-4');
	verifyTimes.push(performance.now() - started);
}

process.stdout.write(`Argon2id hash average: ${average(hashTimes).toFixed(2)} ms\n`);
process.stdout.write(`Argon2id verify average: ${average(verifyTimes).toFixed(2)} ms\n`);

if (process.env.BENCHMARK_LIVE === 'true') {
	const { buildApp } = await import('../src/app.js');
	const app = await buildApp();
	await app.ready();
	try {
		const healthTimes: number[] = [];
		for (let index = 0; index < 100; index += 1) {
			const started = performance.now();
			await app.inject({ method: 'GET', url: '/health/live' });
			healthTimes.push(performance.now() - started);
		}
		process.stdout.write(`Fastify health inject average: ${average(healthTimes).toFixed(3)} ms\n`);
		process.stdout.write('Repository, session-list and rate-limit timings require seeded BENCHMARK_LIVE infrastructure.\n');
	} finally {
		await app.close();
	}
} else {
	process.stdout.write('API/database/Redis benchmark skipped. Set BENCHMARK_LIVE=true with isolated infrastructure.\n');
}
