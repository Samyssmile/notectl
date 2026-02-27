import { test, expect } from './fixtures/editor-page';

/**
 * Performance test suite: Measures layout performance when pasting large content.
 *
 * Three measurement approaches:
 * 1. Monkey-patching layout-forcing DOM properties (offsetHeight, scrollHeight, etc.)
 *    to detect synchronous forced reflows (JS-triggered layout thrashing)
 * 2. CDP Performance.getMetrics for total LayoutCount and LayoutDuration
 * 3. PerformanceObserver for Long Animation Frames (LoAF)
 */

/** Generates a large block of plain text with N lines. */
function generateLargeText(lineCount: number): string {
	const lines: string[] = [];
	for (let i = 0; i < lineCount; i++) {
		lines.push(
			`This is line number ${i + 1} of the test document with some filler text to be realistic.`,
		);
	}
	return lines.join('\n');
}

/** Generates a large HTML payload with N paragraphs including mixed formatting. */
function generateLargeHTML(paragraphCount: number): string {
	const paragraphs: string[] = [];
	for (let i = 0; i < paragraphCount; i++) {
		const bold: string = i % 3 === 0 ? '<strong>bold text</strong> ' : '';
		const italic: string = i % 5 === 0 ? '<em>italic text</em> ' : '';
		paragraphs.push(
			`<p>${bold}${italic}Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.</p>`,
		);
	}
	return paragraphs.join('');
}

interface LayoutReadLog {
	property: string;
	stack: string;
}

interface CdpMetric {
	name: string;
	value: number;
}

interface LayoutMetrics {
	// Monkey-patch data
	forcedLayoutReads: number;
	readsByProperty: Record<string, number>;
	uniqueCallSites: number;
	sampleStacks: string[];
	// CDP Performance.getMetrics data
	layoutCount: number;
	layoutDurationMs: number;
	// LoAF data
	longFrames: number;
	maxFrameMs: number;
	// Timing
	wallTimeMs: number;
}

// Disabled by default — run manually with: pnpm test:e2e -- --grep "Layout Thrashing"
// Only run on Chromium — uses CDP
test.describe.skip('Performance: Layout Thrashing on Large Paste', () => {

	/** Instruments layout-forcing properties on Element + HTMLElement prototypes. */
	async function installLayoutInstrumentation(
		page: test.FixtureTypes['page'],
	): Promise<void> {
		await page.evaluate(() => {
			const w = window as unknown as Record<string, unknown>;
			w.__layoutReads = [];
			w.__recording = false;

			function captureRead(property: string): void {
				if (!(window as unknown as Record<string, boolean>).__recording) {
					return;
				}
				const stack: string = (new Error().stack ?? '')
					.split('\n')
					.slice(1, 6)
					.join('\n');
				(
					(window as unknown as Record<string, unknown>)
						.__layoutReads as LayoutReadLog[]
				).push({ property, stack });
			}

			function patchGetter(proto: object, prop: string): void {
				const desc: PropertyDescriptor | undefined =
					Object.getOwnPropertyDescriptor(proto, prop);
				if (!desc?.get) return;
				const origGet: () => unknown = desc.get;
				Object.defineProperty(proto, prop, {
					get() {
						captureRead(prop);
						return origGet.call(this);
					},
					set: desc.set,
					configurable: true,
					enumerable: desc.enumerable,
				});
			}

			// HTMLElement-level layout properties
			for (const p of [
				'offsetHeight',
				'offsetWidth',
				'offsetTop',
				'offsetLeft',
			]) {
				patchGetter(HTMLElement.prototype, p);
			}

			// Element-level layout properties
			for (const p of [
				'clientHeight',
				'clientWidth',
				'clientTop',
				'clientLeft',
				'scrollHeight',
				'scrollWidth',
				'scrollTop',
				'scrollLeft',
			]) {
				patchGetter(Element.prototype, p);
			}

			// Element.getBoundingClientRect
			const origBCR = Element.prototype.getBoundingClientRect;
			Element.prototype.getBoundingClientRect = function () {
				captureRead('getBoundingClientRect');
				return origBCR.call(this);
			};

			// Element.getClientRects
			const origCR = Element.prototype.getClientRects;
			Element.prototype.getClientRects = function () {
				captureRead('getClientRects');
				return origCR.call(this);
			};

			// Range.getBoundingClientRect
			const origRBCR = Range.prototype.getBoundingClientRect;
			Range.prototype.getBoundingClientRect = function () {
				captureRead('Range.getBoundingClientRect');
				return origRBCR.call(this);
			};

			// Range.getClientRects
			const origRCR = Range.prototype.getClientRects;
			Range.prototype.getClientRects = function () {
				captureRead('Range.getClientRects');
				return origRCR.call(this);
			};

			// window.getComputedStyle
			const origGCS = window.getComputedStyle;
			window.getComputedStyle = function (
				...args: Parameters<typeof origGCS>
			) {
				captureRead('getComputedStyle');
				return origGCS.apply(this, args);
			};

			// Long Animation Frame observer
			w.__longFrames = [];
			try {
				new PerformanceObserver((list: PerformanceObserverEntryList) => {
					for (const entry of list.getEntries()) {
						(
							(window as unknown as Record<string, unknown>)
								.__longFrames as { duration: number }[]
						).push({ duration: entry.duration });
					}
				}).observe({ type: 'long-animation-frame', buffered: false });
			} catch {
				// LoAF not available
			}
		});

		// Sanity check
		const sanity: number = await page.evaluate(() => {
			(window as unknown as Record<string, boolean>).__recording = true;
			(window as unknown as Record<string, unknown>).__layoutReads = [];
			void document.body.offsetHeight;
			void document.body.scrollHeight;
			void document.body.getBoundingClientRect();
			const n: number = (
				(window as unknown as Record<string, unknown>)
					.__layoutReads as unknown[]
			).length;
			(window as unknown as Record<string, boolean>).__recording = false;
			(window as unknown as Record<string, unknown>).__layoutReads = [];
			return n;
		});
		expect(sanity).toBeGreaterThanOrEqual(3);
	}

	async function startRecording(
		page: test.FixtureTypes['page'],
	): Promise<void> {
		await page.evaluate(() => {
			(window as unknown as Record<string, unknown>).__layoutReads = [];
			(window as unknown as Record<string, unknown>).__longFrames = [];
			(window as unknown as Record<string, boolean>).__recording = true;
		});
	}

	async function stopAndCollect(
		page: test.FixtureTypes['page'],
	): Promise<{
		reads: LayoutReadLog[];
		longFrames: { duration: number }[];
	}> {
		return page.evaluate(() => {
			(window as unknown as Record<string, boolean>).__recording = false;
			return {
				reads: (window as unknown as Record<string, unknown>)
					.__layoutReads as LayoutReadLog[],
				longFrames: (window as unknown as Record<string, unknown>)
					.__longFrames as { duration: number }[],
			};
		});
	}

	/** Gets a specific metric from CDP Performance.getMetrics. */
	function getMetricValue(
		metrics: CdpMetric[],
		name: string,
	): number {
		return metrics.find((m) => m.name === name)?.value ?? 0;
	}

	/** Full analysis combining all measurement sources. */
	function analyze(
		reads: LayoutReadLog[],
		longFrames: { duration: number }[],
		layoutCountBefore: number,
		layoutCountAfter: number,
		layoutDurBefore: number,
		layoutDurAfter: number,
		wallTimeMs: number,
	): LayoutMetrics {
		const readsByProperty: Record<string, number> = {};
		const uniqueStacks: Set<string> = new Set();
		const sampleStacks: string[] = [];

		for (const read of reads) {
			readsByProperty[read.property] =
				(readsByProperty[read.property] ?? 0) + 1;
			const key: string = read.stack.split('\n').slice(0, 2).join('|');
			if (!uniqueStacks.has(key)) {
				uniqueStacks.add(key);
				if (sampleStacks.length < 20) {
					sampleStacks.push(`[${read.property}]\n${read.stack}`);
				}
			}
		}

		return {
			forcedLayoutReads: reads.length,
			readsByProperty,
			uniqueCallSites: uniqueStacks.size,
			sampleStacks,
			layoutCount: layoutCountAfter - layoutCountBefore,
			layoutDurationMs: (layoutDurAfter - layoutDurBefore) * 1000,
			longFrames: longFrames.length,
			maxFrameMs: longFrames.reduce(
				(max, f) => Math.max(max, f.duration),
				0,
			),
			wallTimeMs,
		};
	}

	function printReport(label: string, m: LayoutMetrics): void {
		console.log(`\n${'━'.repeat(64)}`);
		console.log(`  ${label}`);
		console.log('━'.repeat(64));
		console.log(`  CDP Layout Count (total reflows):     ${m.layoutCount}`);
		console.log(
			`  CDP Layout Duration:                  ${m.layoutDurationMs.toFixed(2)} ms`,
		);
		console.log(
			`  JS-Forced Layout Reads (thrashing):   ${m.forcedLayoutReads}`,
		);
		console.log(
			`  Unique Call Sites:                    ${m.uniqueCallSites}`,
		);
		console.log(
			`  Long Animation Frames (>50ms):        ${m.longFrames}`,
		);
		console.log(
			`  Max Frame Duration:                   ${m.maxFrameMs.toFixed(2)} ms`,
		);
		console.log(
			`  Wall Time:                            ${m.wallTimeMs.toFixed(2)} ms`,
		);

		if (Object.keys(m.readsByProperty).length > 0) {
			console.log('\n  Forced reads by property:');
			for (const [prop, count] of Object.entries(
				m.readsByProperty,
			).sort((a, b) => b[1] - a[1])) {
				console.log(`    ${prop}: ${count}`);
			}
		}

		if (m.sampleStacks.length > 0) {
			console.log('\n  Call sites:');
			for (const stack of m.sampleStacks) {
				console.log('  ──────────');
				for (const line of stack.split('\n').slice(0, 4)) {
					console.log(`    ${line.trim()}`);
				}
			}
		}

		console.log('━'.repeat(64));

		// Verdict
		if (m.forcedLayoutReads > 10) {
			console.log(
				`  ⚠️  LAYOUT THRASHING: ${m.forcedLayoutReads} forced reads from ${m.uniqueCallSites} call sites`,
			);
		} else if (m.layoutCount > 20) {
			console.log(
				`  ⚠️  EXCESSIVE LAYOUTS: ${m.layoutCount} layouts in ${m.wallTimeMs.toFixed(0)}ms`,
			);
		} else if (m.longFrames > 0) {
			console.log(
				`  ⚠️  LONG FRAMES: ${m.longFrames} frame(s) >50ms (max: ${m.maxFrameMs.toFixed(0)}ms)`,
			);
		} else {
			console.log('  ✅ No significant performance issues detected.');
		}
		console.log('');
	}

	test('plain text paste (200 lines)', async ({ editor, page }) => {
		await editor.focus();
		await installLayoutInstrumentation(page);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Performance.enable');

		// Baseline CDP metrics
		const before = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcBefore: number = getMetricValue(before, 'LayoutCount');
		const ldBefore: number = getMetricValue(before, 'LayoutDuration');

		await startRecording(page);
		const t0: number = await page.evaluate(() => performance.now());

		await editor.pasteText(generateLargeText(200));
		await page.waitForTimeout(500);

		const t1: number = await page.evaluate(() => performance.now());
		const { reads, longFrames } = await stopAndCollect(page);

		const after = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcAfter: number = getMetricValue(after, 'LayoutCount');
		const ldAfter: number = getMetricValue(after, 'LayoutDuration');

		await cdp.send('Performance.disable');

		const m: LayoutMetrics = analyze(
			reads,
			longFrames,
			lcBefore,
			lcAfter,
			ldBefore,
			ldAfter,
			t1 - t0,
		);
		printReport('200 Lines Plain Text Paste', m);

		const text: string = await editor.getText();
		expect(text).toContain('line number 1');
		expect(text).toContain('line number 200');

		test.info().annotations.push(
			{ type: 'CDP LayoutCount', description: String(m.layoutCount) },
			{
				type: 'CDP LayoutDuration (ms)',
				description: m.layoutDurationMs.toFixed(2),
			},
			{
				type: 'Forced Layout Reads',
				description: String(m.forcedLayoutReads),
			},
			{ type: 'Long Frames', description: String(m.longFrames) },
			{ type: 'Wall Time (ms)', description: m.wallTimeMs.toFixed(2) },
		);
	});

	test('HTML paste (200 paragraphs with formatting)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await installLayoutInstrumentation(page);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Performance.enable');

		const before = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcBefore: number = getMetricValue(before, 'LayoutCount');
		const ldBefore: number = getMetricValue(before, 'LayoutDuration');

		await startRecording(page);
		const t0: number = await page.evaluate(() => performance.now());

		await editor.pasteHTML(generateLargeHTML(200));
		await page.waitForTimeout(500);

		const t1: number = await page.evaluate(() => performance.now());
		const { reads, longFrames } = await stopAndCollect(page);

		const after = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcAfter: number = getMetricValue(after, 'LayoutCount');
		const ldAfter: number = getMetricValue(after, 'LayoutDuration');

		await cdp.send('Performance.disable');

		const m: LayoutMetrics = analyze(
			reads,
			longFrames,
			lcBefore,
			lcAfter,
			ldBefore,
			ldAfter,
			t1 - t0,
		);
		printReport('200 Paragraphs HTML Paste', m);

		const json = await editor.getJSON();
		expect(json.children.length).toBeGreaterThanOrEqual(100);

		test.info().annotations.push(
			{ type: 'CDP LayoutCount', description: String(m.layoutCount) },
			{
				type: 'CDP LayoutDuration (ms)',
				description: m.layoutDurationMs.toFixed(2),
			},
			{
				type: 'Forced Layout Reads',
				description: String(m.forcedLayoutReads),
			},
			{ type: 'Long Frames', description: String(m.longFrames) },
			{ type: 'Wall Time (ms)', description: m.wallTimeMs.toFixed(2) },
		);
	});

	test('incremental typing (500 chars) — baseline', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await installLayoutInstrumentation(page);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Performance.enable');

		const before = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcBefore: number = getMetricValue(before, 'LayoutCount');
		const ldBefore: number = getMetricValue(before, 'LayoutDuration');

		await startRecording(page);
		const t0: number = await page.evaluate(() => performance.now());

		await page.keyboard.type(
			'The quick brown fox jumps over the lazy dog. '.repeat(11),
			{ delay: 2 },
		);
		await page.waitForTimeout(300);

		const t1: number = await page.evaluate(() => performance.now());
		const { reads, longFrames } = await stopAndCollect(page);

		const after = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcAfter: number = getMetricValue(after, 'LayoutCount');
		const ldAfter: number = getMetricValue(after, 'LayoutDuration');

		await cdp.send('Performance.disable');

		const m: LayoutMetrics = analyze(
			reads,
			longFrames,
			lcBefore,
			lcAfter,
			ldBefore,
			ldAfter,
			t1 - t0,
		);
		printReport('Incremental Typing (500 chars) — Baseline', m);

		test.info().annotations.push(
			{ type: 'CDP LayoutCount', description: String(m.layoutCount) },
			{
				type: 'CDP LayoutDuration (ms)',
				description: m.layoutDurationMs.toFixed(2),
			},
			{
				type: 'Forced Layout Reads',
				description: String(m.forcedLayoutReads),
			},
			{ type: 'Wall Time (ms)', description: m.wallTimeMs.toFixed(2) },
		);
	});

	test('stress test: 500 lines plain text paste', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await installLayoutInstrumentation(page);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Performance.enable');

		const before = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcBefore: number = getMetricValue(before, 'LayoutCount');
		const ldBefore: number = getMetricValue(before, 'LayoutDuration');

		await startRecording(page);
		const t0: number = await page.evaluate(() => performance.now());

		await editor.pasteText(generateLargeText(500));
		await page.waitForTimeout(1000);

		const t1: number = await page.evaluate(() => performance.now());
		const { reads, longFrames } = await stopAndCollect(page);

		const after = (await cdp.send('Performance.getMetrics'))
			.metrics as CdpMetric[];
		const lcAfter: number = getMetricValue(after, 'LayoutCount');
		const ldAfter: number = getMetricValue(after, 'LayoutDuration');

		await cdp.send('Performance.disable');

		const m: LayoutMetrics = analyze(
			reads,
			longFrames,
			lcBefore,
			lcAfter,
			ldBefore,
			ldAfter,
			t1 - t0,
		);
		printReport('STRESS: 500 Lines Plain Text Paste', m);

		const text: string = await editor.getText();
		expect(text).toContain('line number 1');
		expect(text).toContain('line number 500');

		test.info().annotations.push(
			{ type: 'CDP LayoutCount', description: String(m.layoutCount) },
			{
				type: 'CDP LayoutDuration (ms)',
				description: m.layoutDurationMs.toFixed(2),
			},
			{
				type: 'Forced Layout Reads',
				description: String(m.forcedLayoutReads),
			},
			{ type: 'Long Frames', description: String(m.longFrames) },
			{
				type: 'Max Frame (ms)',
				description: m.maxFrameMs.toFixed(2),
			},
			{ type: 'Wall Time (ms)', description: m.wallTimeMs.toFixed(2) },
		);
	});
});
