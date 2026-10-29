import {webFrame} from 'electron';

// Browser script for Caprine Enhanced Call Window
(async () => {
	document.addEventListener('DOMContentLoaded', () => {
		if (!document.title || document.title === 'about:blank') {
			document.title = 'Caprine Enhanced — Call';
		}
	});

	// Inject WebRTC audio optimization into the call window to prevent mic volume drop
	try {
		await webFrame.executeJavaScript(`
			(() => {
				if (window.__caprineWebRtcPatched) return;
				window.__caprineWebRtcPatched = true;

				if (navigator?.mediaDevices?.getUserMedia) {
					const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
					navigator.mediaDevices.getUserMedia = async function(c) {
						if (c && c.audio) {
							if (typeof c.audio === 'object') {
								c.audio.autoGainControl = false;
								c.audio.googAutoGainControl = false;
								c.audio.googAutoGainControl2 = false;
								if (c.audio.echoCancellation === undefined) c.audio.echoCancellation = true;
								if (c.audio.noiseSuppression === undefined) c.audio.noiseSuppression = true;
							} else if (c.audio === true) {
								c.audio = {
									autoGainControl: false,
									googAutoGainControl: false,
									googAutoGainControl2: false,
									echoCancellation: true,
									noiseSuppression: true,
								};
							}
						}
						try {
							return await origGetUserMedia(c);
						} catch (e) {
							return origGetUserMedia(c);
						}
					};
				}

				if (window.MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
					const origApplyConstraints = MediaStreamTrack.prototype.applyConstraints;
					MediaStreamTrack.prototype.applyConstraints = function(constraints) {
						if (this.kind === 'audio' && constraints) {
							if (typeof constraints === 'object') {
								constraints.autoGainControl = false;
								constraints.googAutoGainControl = false;
								constraints.googAutoGainControl2 = false;
							}
						}
						return origApplyConstraints.call(this, constraints);
					};
				}
			})();
		`);
	} catch (error) {
		console.warn('Call window WebRTC patch error:', error);
	}

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
