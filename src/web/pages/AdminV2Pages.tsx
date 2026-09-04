import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import LegacyAdminPage from './AdminPage';

interface PageResult {
	items: Array<Record<string, unknown>>;
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}
function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
	return (
		<header className="page-header">
			<div>
				<h1 className="page-title">{title}</h1>
				<p className="page-subtitle">{subtitle}</p>
			</div>
			{action}
		</header>
	);
}

export function AdminOverview() {
	const [value, setValue] = useState<Record<string, unknown>>();
	useEffect(() => {
		api<Record<string, unknown>>('/api/v1/admin/dashboard').then(setValue);
	}, []);
	const metrics: Array<[string, string]> = [
		['Users', 'users'],
		['Active sessions', 'activeSessions'],
		['Applications', 'clients'],
		['Service', 'status'],
	];
	return (
		<section className="page">
			<Header title="Overview" subtitle="Service health and security activity." />
			<div className="grid metric-grid">
				{metrics.map(([label, key]) => (
					<div className="surface section" key={key}>
						<Typography color="text.secondary" variant="body2">
							{label}
						</Typography>
						<div className="metric-value">{value?.[key]?.toString() ?? '—'}</div>
					</div>
				))}
			</div>
			<div className="surface section" style={{ marginTop: 16 }}>
				<h2>Service health</h2>
				<Stack direction="row" spacing={3}>
					<span className={`status status--${value?.postgres === 'up' ? 'success' : 'error'}`}>
						PostgreSQL {String(value?.postgres ?? 'checking')}
					</span>
					<span className={`status status--${value?.redis === 'up' ? 'success' : 'error'}`}>
						Redis {String(value?.redis ?? 'checking')}
					</span>
				</Stack>
			</div>
		</section>
	);
}

const config = {
	applications: {
		endpoint: 'clients',
		title: 'Applications',
		subtitle: 'OAuth/OIDC client applications registered with Y.auth',
		columns: ['name', 'projectKey', 'type', 'enabled', 'lastUsedAt', 'createdAt'],
		detail: 'clients',
	},
	users: {
		endpoint: 'users',
		title: 'Users',
		subtitle: 'Accounts, verification and access status.',
		columns: ['email', 'displayName', 'status', 'isAdmin', 'createdAt'],
		detail: 'users',
	},
	sessions: {
		endpoint: 'sessions',
		title: 'Sessions',
		subtitle: 'Active, expired and revoked browser sessions.',
		columns: ['email', 'lastIp', 'lastSeenAt', 'expiresAt', 'revokedAt'],
		detail: 'sessions',
	},
	audit: {
		endpoint: 'audit',
		title: 'Audit',
		subtitle: 'Searchable security and administration history.',
		columns: ['createdAt', 'type', 'success', 'requestId', 'ip'],
		detail: 'audit',
	},
} as const;

export function AdminListPage({ kind }: { kind: keyof typeof config }) {
	const definition = config[kind];
	const [params, setParams] = useSearchParams();
	const [data, setData] = useState<PageResult>();
	const [error, setError] = useState('');
	const query = params.toString();
	useEffect(() => {
		const controller = new AbortController();
		api<PageResult>(`/api/v1/admin/${definition.endpoint}?${query}`, { signal: controller.signal })
			.then(setData)
			.catch((cause: Error) => {
				if (!controller.signal.aborted) setError(cause.message);
			});
		return () => controller.abort();
	}, [definition.endpoint, query]);
	const set = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value) next.set(key, value);
		else next.delete(key);
		if (key !== 'page') next.set('page', '1');
		setParams(next);
	};
	return (
		<section className="page">
			<Header
				title={definition.title}
				subtitle={definition.subtitle}
				action={
					kind === 'applications' ? (
						<Button component={Link} to="/admin/applications/new" variant="contained">
							Create application
						</Button>
					) : undefined
				}
			/>
			<div className="toolbar">
				<TextField
					size="small"
					placeholder="Search"
					defaultValue={params.get('search') ?? ''}
					onChange={(event) => set('search', event.target.value)}
				/>
				<TextField
					select
					size="small"
					label="Rows"
					value={params.get('pageSize') ?? '25'}
					onChange={(event) => set('pageSize', event.target.value)}
					sx={{ width: 100 }}
				>
					{[25, 50, 100].map((size) => (
						<MenuItem key={size} value={size}>
							{size}
						</MenuItem>
					))}
				</TextField>
			</div>
			{error && <Alert severity="error">{error}</Alert>}
			<div className={`surface${!data ? ' pending-edge' : ''}`}>
				<table className="data-table">
					<thead>
						<tr>
							{definition.columns.map((column) => (
								<th key={column}>{column}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{data?.items.map((row, index) => (
							<tr
								key={String(row.id ?? index)}
								onClick={() => location.assign(`/admin/${kind}/${String(row.clientId ?? row.id)}`)}
								tabIndex={0}
							>
								{definition.columns.map((column) => (
									<td data-label={column} key={column}>
										{row[column] === null || row[column] === undefined ? '—' : String(row[column])}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				{data?.items.length === 0 && <div className="empty-state">No matching records.</div>}
			</div>
			{data && (
				<Stack direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between' }}>
					<Typography variant="body2">
						Page {data.page} of {data.totalPages} · {data.total} records
					</Typography>
					<Stack direction="row" spacing={1}>
						<Button disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>
							Previous
						</Button>
						<Button disabled={data.page >= data.totalPages} onClick={() => set('page', String(data.page + 1))}>
							Next
						</Button>
					</Stack>
				</Stack>
			)}
		</section>
	);
}

export function AdminDetailPage({ kind }: { kind: 'applications' | 'users' | 'sessions' | 'audit' }) {
	const params = useParams();
	const id = params.clientId ?? params.userId ?? params.sessionId ?? params.eventId;
	const endpoint = kind === 'applications' ? 'clients' : kind;
	const [value, setValue] = useState<Record<string, unknown>>();
	useEffect(() => {
		if (id) api<Record<string, unknown>>(`/api/v1/admin/${endpoint}/${encodeURIComponent(id)}`).then(setValue);
	}, [endpoint, id]);
	return (
		<section className="page">
			<Header title={`${config[kind].title} details`} subtitle={id ?? ''} />
			<div className="surface section">
				<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value ? JSON.stringify(value, null, 2) : 'Loading…'}</pre>
			</div>
		</section>
	);
}

export function AdminSettings() {
	useLocation();
	return <LegacyAdminPage />;
}

export function ApplicationForm() {
	return <LegacyAdminPage />;
}
