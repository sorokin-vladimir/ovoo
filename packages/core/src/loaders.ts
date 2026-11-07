import { isOutcome } from './outcome.ts';
import type { ResolutionInput } from './resolve.ts';

// Default strategy: guards top-down, loads in parallel, render from the leaf up
export async function loaders({
	match,
	chain,
	url,
	signal,
	context,
}: ResolutionInput): Promise<unknown> {
	const { params } = match;
	// Context each route sees: the given one extended by the guards from the root down to it
	const contexts: unknown[] = [];
	for (const node of chain) {
		const extension = await node.guard?.({ params, context, url, signal });
		if (isOutcome(extension)) return extension;
		// Object.assign, because the context arrives untyped and may be absent
		if (extension !== undefined) context = Object.assign({}, context, extension);
		contexts.push(context);
	}
	const data = await Promise.all(
		chain.map(async (node, index) => {
			const loaded = await node.load?.({ params, context: contexts[index], url, signal });
			// Thrown, so a returned outcome ends the parallel loads like a thrown one
			if (isOutcome(loaded)) throw loaded;
			return loaded;
		}),
	);
	let result: unknown;
	for (let index = chain.length - 1; index >= 0; index--) {
		const node = chain[index]!;
		const isLeaf = index === chain.length - 1;
		if (node.render) {
			const own = { data: data[index], params, context: contexts[index], url };
			result = node.render(isLeaf ? own : { ...own, child: result });
			if (isOutcome(result)) return result;
		} else if (isLeaf) {
			result = data[index];
		}
	}
	return result;
}
