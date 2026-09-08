import AppsOutlined from '@mui/icons-material/AppsOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Add from '@mui/icons-material/Add';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { Alert, Button, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { lazy, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
const LegacyAdminPage = lazy(() => import('./AdminPage'));
import LoadingPreview from '../components/LoadingPreview';

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
	const [error, setError] = useState('');
	useEffect(() => {
		const controller = new AbortController();
		api<Record<string, unknown>>('/api/v1/admin/dashboard', { signal: controller.signal })
			.then(setValue)
			.catch((cause: Error) => {
				if (!controller.signal.aborted) setError(cause.message);
			});
		return () => controller.abort();
	}, []);
	const metrics = [
		{ label: 'Users', key: 'users', caption: 'Registered accounts', Icon: PeopleOutlined },
		{ label: 'Active sessions', key: 'activeSessions', caption: 'Signed-in devices', Icon: DevicesOutlined },
		{ label: 'Applications', key: 'clients', caption: 'Connected OAuth clients', Icon: AppsOutlined },
		{ label: 'Service', key: 'status', caption: 'Current service status', Icon: ShieldOutlined },
	];
	return (
		<section className="page">
			<Header
				title="Overview"
				subtitle="Your identity infrastructure, at a glance."
				action={
					<Button component={Link} to="/admin/applications" variant="outlined" startIcon={<AppsOutlined />}>
						Applications
					</Button>
				}
			/>
			{error && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}
			<div className="grid metric-grid">
				{metrics.map(({ label, key, caption, Icon }) => (
					<div className="surface section metric-card" key={key}>
						<div className="metric-heading">
							<Typography color="text.secondary" variant="body2">
								{label}
							</Typography>
							<span className="metric-icon">
								<Icon />
							</span>
						</div>
						<div className="metric-value">
							{value ? (value[key]?.toString() ?? '—') : error ? '—' : <div className="skeleton" style={{ width: 70, height: 38 }} />}
						</div>
						<div className="metric-caption">{caption}</div>
					</div>
				))}
			</div>
			<div className="overview-grid">
				<div className="surface section">
					<div className="section-heading">
						<h2>Service health</h2>
						<ShieldOutlined />
					</div>
					{['postgres', 'redis'].map((key) => (
						<div className="health-row" key={key}>
							<div className="health-label">
								<DnsOutlined />
								{key === 'postgres' ? 'PostgreSQL' : 'Redis'}
							</div>
							<span className={`status${value?.[key] === 'up' ? ' status--success' : value?.[key] ? ' status--error' : ''}`}>
								{String(value?.[key] ?? (error ? 'Unavailable' : 'Checking…'))}
							</span>
						</div>
					))}
					<Typography variant="caption" color="text.secondary">
						Service health and security activity for this instance.
					</Typography>
				</div>
				<div className="surface section">
					<div className="section-heading">
						<h2>Workspace</h2>
						<AppsOutlined />
					</div>
					<Link className="quick-link" to="/admin/users">
						<PeopleOutlined />
						<div>
							<strong>Manage users</strong>
							<small>Accounts, verification and access</small>
						</div>
						<ArrowForward />
					</Link>
					<Link className="quick-link" to="/admin/sessions">
						<DevicesOutlined />
						<div>
							<strong>Review sessions</strong>
							<small>Signed-in devices and session history</small>
						</div>
						<ArrowForward />
					</Link>
					<Link className="quick-link" to="/admin/audit">
						<HistoryOutlined />
						<div>
							<strong>Security audit</strong>
							<small>Authentication and administration events</small>
						</div>
						<ArrowForward />
					</Link>
				</div>
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

const fieldLabels: Record<string, string> = {
	name: 'Name',
	projectKey: 'Project',
	type: 'Type',
	enabled: 'Enabled',
	lastUsedAt: 'Last used',
	createdAt: 'Created',
	email: 'Email',
	displayName: 'Display name',
	status: 'Status',
	isAdmin: 'Administrator',
	lastIp: 'IP address',
	lastSeenAt: 'Last active',
	expiresAt: 'Expires',
	revokedAt: 'Revoked',
	success: 'Result',
	requestId: 'Request ID',
	ip: 'IP address',
};
function fieldLabel(key: string) {
	return fieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}
function FieldValue({ value }: { value: unknown }) {
	if (value === null || value === undefined || value === '') return <>—</>;
	if (typeof value === 'boolean') return <span className={`status${value ? ' status--success' : ''}`}>{value ? 'Yes' : 'No'}</span>;
	if (typeof value === 'object') return <pre>{JSON.stringify(value, null, 2)}</pre>;
	if (value === 'active' || value === 'up') return <span className="status status--success">{value}</span>;
	if (value === 'deactivated' || value === 'revoked' || value === 'down') return <span className="status status--error">{value}</span>;
	return <>{String(value)}</>;
}

export function AdminListPage({ kind }: { kind: keyof typeof config }) {
	const definition = config[kind];
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const [data, setData] = useState<PageResult>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);
	const query = params.toString();
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setError('');
		api<PageResult>(`/api/v1/admin/${definition.endpoint}?${query}`, { signal: controller.signal })
			.then((value) => {
				if (!controller.signal.aborted) {
					setData(value);
					setLoading(false);
				}
			})
			.catch((cause: Error) => {
				if (!controller.signal.aborted) {
					setError(cause.message);
					setLoading(false);
				}
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
						<Button component={Link} to="/admin/applications/new" variant="contained" startIcon={<Add />}>
							Create application
						</Button>
					) : undefined
				}
			/>
			<div className="toolbar">
				<TextField
					size="small"
					placeholder={`Search ${definition.title.toLowerCase()}…`}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchOutlined fontSize="small" />
								</InputAdornment>
							),
						},
						htmlInput: { 'aria-label': `Search ${definition.title.toLowerCase()}` },
					}}
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
			<div className="surface table-surface" aria-busy={loading}>
				{loading ? (
					<LoadingPreview rows={5} />
				) : (
					<table className="data-table">
						<thead>
							<tr>
								{definition.columns.map((column) => (
									<th key={column} scope="col">
										{fieldLabel(column)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{data?.items.map((row, index) => (
								<tr
									key={String(row.clientId ?? row.id ?? index)}
									className="list-row-enter"
									style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
									onClick={() => navigate(`/admin/${kind}/${encodeURIComponent(String(row.clientId ?? row.id))}`)}
									onKeyDown={(event) => {
										if (event.key === 'Enter' && event.target === event.currentTarget)
											navigate(`/admin/${kind}/${encodeURIComponent(String(row.clientId ?? row.id))}`);
									}}
									aria-label={`Open ${String(row.name ?? row.email ?? row.id ?? 'record')}`}
									tabIndex={0}
								>
									{definition.columns.map((column) => (
										<td data-label={fieldLabel(column)} key={column}>
											<FieldValue value={row[column]} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				)}
				{!loading && data?.items.length === 0 && (
					<div className="empty-state">
						<SearchOutlined />
						No matching records.
					</div>
				)}
			</div>
			{data && !loading && (
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
	const [error, setError] = useState('');
	useEffect(() => {
		const controller = new AbortController();
		setValue(undefined);
		setError('');
		if (id)
			api<Record<string, unknown>>(`/api/v1/admin/${endpoint}/${encodeURIComponent(id)}`, { signal: controller.signal })
				.then((value) => {
					if (!controller.signal.aborted) setValue(value);
				})
				.catch((error: Error) => {
					if (!controller.signal.aborted) setError(error.message);
				});
		return () => controller.abort();
	}, [endpoint, id]);
	return (
		<section className="page">
			<Header
				title={`${config[kind].title} details`}
				subtitle={id ?? ''}
				action={
					<Button component={Link} to={`/admin/${kind}`} variant="outlined">
						Back to {config[kind].title.toLowerCase()}
					</Button>
				}
			/>
			<div className="surface section">
				{value ? (
					<dl className="detail-list">
						{Object.entries(value).map(([key, field]) => (
							<div className="detail-row" key={key}>
								<dt>{fieldLabel(key)}</dt>
								<dd>
									<FieldValue value={field} />
								</dd>
							</div>
						))}
					</dl>
				) : error ? (
					<Alert severity="error">{error}</Alert>
				) : (
					<LoadingPreview />
				)}
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
