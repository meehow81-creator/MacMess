// Browser script for Caprine Enhanced Call Window
(async () => {
	document.addEventListener('DOMContentLoaded', () => {
		if (!document.title || document.title === 'about:blank') {
			document.title = 'Caprine Enhanced — Call';
		}
	});

	// Attempt to auto-focus or auto-join if a join call button exists (with safe timeout)
	try {
		const callJoinSelectors = [
			'[aria-label*="Join" i][role="button"]',
			'[aria-label*="Dołącz" i][role="button"]',
			'[role="button"][data-testid*="call"]',
			'button[type="submit"]',
		];

		const startTime = Date.now();
		const interval = setInterval(() => {
			if (Date.now() - startTime > 5000) {
				clearInterval(interval);
				return;
			}

			for (const selector of callJoinSelectors) {
				const button = document.querySelector<HTMLElement>(selector);
				if (button && button.offsetParent !== null) {
					// Found an active join button
					clearInterval(interval);
					button.click();
					break;
				}
			}
		}, 500);
	} catch (error) {
		console.warn('Call setup helper encountered non-critical error:', error);
	}
})();
