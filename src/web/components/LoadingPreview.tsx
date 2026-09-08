import { useTranslation } from 'react-i18next';

export default function LoadingPreview({ rows = 4 }: { rows?: number }) {
	const { t } = useTranslation();
	return (
		<div className="loading-preview" role="status" aria-label={t('common.loading')}>
			<span className="sr-only">{t('common.loading')}</span>
			{['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].slice(0, rows).map((id) => (
				<div className="preview-row" key={id}>
					<div className="skeleton preview-icon" />
					<div className="preview-lines">
						<div className="skeleton" />
						<div className="skeleton" />
					</div>
				</div>
			))}
		</div>
	);
}
