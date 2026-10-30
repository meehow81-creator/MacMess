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
						return origGetUserMedia(c);
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

	// Joining a call requires an explicit user action.
})();
