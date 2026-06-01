/**
 * Spacing command handlers (`\,`, `\quad`, `~`, …).
 *
 * Layer A (framework-agnostic, zero notectl imports). Each maps to an `mspace`
 * with an explicit width in `em`; `\!` yields a negative thin space.
 */

import { mspace } from '../../mathml/index.js';

const SPACE_WIDTHS: Readonly<Record<string, string>> = {
	',': '0.167em',
	':': '0.222em',
	';': '0.278em',
	'!': '-0.167em',
	' ': '0.25em',
	quad: '1em',
	qquad: '2em',
	thinspace: '0.167em',
	medspace: '0.222em',
	thickspace: '0.278em',
	negthinspace: '-0.167em',
	negmedspace: '-0.222em',
	negthickspace: '-0.278em',
	enspace: '0.5em',
};

/** Returns true when `name` is a spacing command. */
export function isSpacing(name: string): boolean {
	return name in SPACE_WIDTHS;
}

/** Returns the `mspace` markup for a spacing command, or undefined if unknown. */
export function spacingMarkup(name: string): string | undefined {
	const width: string | undefined = SPACE_WIDTHS[name];
	if (width === undefined) return undefined;
	return mspace({ width });
}

/** The non-breaking-space (`~`) markup. */
export function nbSpaceMarkup(): string {
	return mspace({ width: '0.25em' });
}
