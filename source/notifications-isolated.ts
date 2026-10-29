((window, notification) => {
	const notifications = new Map<number, Notification>();

	// Handle events sent from the browser process
	window.addEventListener('message', ({data: {type, data}}) => {
		if (type === 'notification-callback') {
			const {callbackName, id}: NotificationCallback = data;
			const notification = notifications.get(id);

			if (!notification) {
				return;
			}

			if (notification[callbackName]) {
				notification[callbackName]();
			}

			if (callbackName === 'onclose') {
				notifications.delete(id);
			}
		}

		if (type === 'notification-reply-callback') {
			const {callbackName, id, previousConversation, reply}: NotificationReplyCallback = data;
			const notification = notifications.get(id);

			if (!notification) {
				return;
			}

			if (notification[callbackName]) {
				notification[callbackName]();
			}

			notifications.delete(id);
			window.postMessage({type: 'notification-reply', data: {previousConversation, reply}}, '*');
		}
	});

	let counter = 1;

	const augmentedNotification = Object.assign(
		class {
			private readonly _id: number;

			constructor(title: string, options: NotificationOptions) {
				// According to https://github.com/sindresorhus/caprine/pull/637, the Notification
				// constructor can be called with non-string title and body.
				let {body} = options;
				const bodyProperties = (body as any).props;
				body = bodyProperties ? bodyProperties.content[0] : options.body;

				const titleProperties = (title as any).props;
				title = titleProperties ? titleProperties.content[0] : title;

				this._id = counter++;

				notifications.set(this._id, this as any);

				window.postMessage(
					{
						type: 'notification',
						data: {
							title,
							id: this._id,
							...options,
							body,
						},
					},
					'*',
				);
			}

			// No-op, but Messenger expects this method to be present
			close(): void {} // eslint-disable-line @typescript-eslint/no-empty-function

			static get permission(): NotificationPermission {
				return 'granted';
			}

			static async requestPermission(): Promise<NotificationPermission> {
				return 'granted';
			}
		},
		notification,
	);

	// Ensure both window.Notification and property assignment work across contexts
	Object.assign(window, {Notification: augmentedNotification, notification: augmentedNotification});
	try {
		(window as any).Notification = augmentedNotification;
	} catch {}

	// Optimize WebRTC microphone gain to prevent audio volume attenuation during calls
	try {
		if (navigator?.mediaDevices?.getUserMedia) {
			const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
			navigator.mediaDevices.getUserMedia = async function (constraints: MediaStreamConstraints) {
				if (constraints && constraints.audio) {
					if (typeof constraints.audio === 'object') {
						constraints.audio.autoGainControl = false;
						(constraints.audio as any).googAutoGainControl = false;
						(constraints.audio as any).googAutoGainControl2 = false;
						if (constraints.audio.echoCancellation === undefined) {
							constraints.audio.echoCancellation = true;
						}
						if (constraints.audio.noiseSuppression === undefined) {
							constraints.audio.noiseSuppression = true;
						}
					} else if (constraints.audio === true) {
						constraints.audio = {
							autoGainControl: false,
							googAutoGainControl: false,
							googAutoGainControl2: false,
							echoCancellation: true,
							noiseSuppression: true,
						} as any;
					}
				}

				try {
					return await originalGetUserMedia(constraints);
				} catch {
					return originalGetUserMedia(constraints);
				}
			};
		}

		if (window.MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
			const originalApplyConstraints = MediaStreamTrack.prototype.applyConstraints;
			MediaStreamTrack.prototype.applyConstraints = function (constraints?: MediaTrackConstraints) {
				if (this.kind === 'audio' && constraints && typeof constraints === 'object') {
					constraints.autoGainControl = false;
					(constraints as any).googAutoGainControl = false;
					(constraints as any).googAutoGainControl2 = false;
				}
				return originalApplyConstraints.call(this, constraints);
			};
		}
	} catch (error) {
		console.warn('WebRTC audio enhancement error:', error);
	}
})(window, Notification);
