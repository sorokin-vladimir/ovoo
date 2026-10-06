// Turns `size-limit --json` output into a Markdown table for the GitHub job summary
import { readFileSync } from 'node:fs';

interface SizeResult {
	readonly name: string;
	readonly passed: boolean;
	readonly size: number;
	readonly sizeLimit: number;
}

// size-limit counts in decimal units, so 1 kB is 1000 bytes here too
function formatBytes(bytes: number): string {
	return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(2)} kB`;
}

const file = process.argv[2];
if (file === undefined) {
	throw new Error('Usage: node scripts/size-summary.ts <size-limit.json>');
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape fixed by size-limit --json
const results = JSON.parse(readFileSync(file, 'utf8')) as SizeResult[];

const rows = results.map(({ name, passed, size, sizeLimit }) => {
	const share = Math.round((size / sizeLimit) * 100);
	const status = passed ? 'ok' : '**over budget**';
	return `| \`${name}\` | ${formatBytes(size)} | ${formatBytes(sizeLimit)} | ${share}% | ${status} |`;
});

console.log(
	[
		'### Bundle size (min+gzip)',
		'',
		'| Package | Size | Budget | Used | Status |',
		'| --- | ---: | ---: | ---: | --- |',
		...rows,
	].join('\n'),
);
