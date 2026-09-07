// SPDX-License-Identifier: CC0-1.0
import type { Action } from 'svelte/action';

interface BlurOptions {
	/** Milliseconds between word starts (92 hero / 58 headings). */
	stagger?: number;
	/** Play immediately instead of waiting for scroll into view. */
	immediate?: boolean;
}

/** Split the node's text into per-word spans that the CSS staggers in. */
function split(node: HTMLElement): void {
	const text = (node.textContent ?? '').trim();
	node.setAttribute('aria-label', text);
	node.textContent = '';
	text.split(/\s+/).forEach((word, i) => {
		const span = document.createElement('span');
		span.textContent = word;
		span.setAttribute('aria-hidden', 'true');
		span.style.setProperty('--word-i', String(i));
		node.appendChild(span);
		node.appendChild(document.createTextNode(' '));
	});
	node.classList.add('blur-words');
}

/**
 * Word-stagger blur-in, per the design language's motion recipe.
 * Screen readers get the intact string via aria-label; the spans are
 * aria-hidden. Reduced-motion users see static text (handled in CSS).
 */
export const blurWords: Action<HTMLElement, BlurOptions | undefined> = (node, options) => {
	const { stagger = 58, immediate = false } = options ?? {};
	split(node);
	node.style.setProperty('--stagger', `${stagger}ms`);

	if (immediate) {
		node.classList.add('play');
		return;
	}

	const io = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				node.classList.add('play');
				io.disconnect();
			}
		},
		{ threshold: 0.3 }
	);
	io.observe(node);
	return { destroy: () => io.disconnect() };
};
