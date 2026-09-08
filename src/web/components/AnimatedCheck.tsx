export default function AnimatedCheck({ checked = false, indeterminate = false }: { checked?: boolean; indeterminate?: boolean }) {
	return (
		<span className={`checkbox-art${checked || indeterminate ? ' is-checked' : ''}`} aria-hidden="true">
			<svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
				<path className="checkbox-tick" pathLength="1" d={indeterminate ? 'M5 10h10' : 'm4.5 10 3.5 3.5 7.5-7'} />
			</svg>
		</span>
	);
}
