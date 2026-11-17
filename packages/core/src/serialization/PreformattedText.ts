/** Reads preformatted text without marks, retaining both literal newlines and `<br>` lines. */
export function readPreformattedText(element: HTMLElement): string {
	const walker: TreeWalker = element.ownerDocument.createTreeWalker(element);
	const parts: string[] = [];
	let node: Node | null = walker.nextNode();
	while (node) {
		if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '');
		else if (node.nodeName === 'BR') parts.push('\n');
		node = walker.nextNode();
	}
	return parts.join('');
}
