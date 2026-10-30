/* Local media lifecycle; no network or persistent storage. */
globalThis.CaprineMediaTest = class {
	constructor(onChange = () => {}) {
		this.onChange = onChange;
		this.audioGeneration = 0;
		this.videoGeneration = 0;
		this.closed = false;
	}

	stopTracks(stream) {
		for (const track of stream?.getTracks() ?? []) {
			track.stop();
		}
	}

	async preview(deviceId) {
		this.stopCamera();
		const generation = this.videoGeneration;
		const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: deviceId ? {deviceId: {exact: deviceId}} : true});
		if (this.closed || generation !== this.videoGeneration) {
			this.stopTracks(stream);
			return;
		}

		this.video = stream;
		this.onChange();
	}

	stopCamera() {
		this.videoGeneration++;
		this.stopTracks(this.video);
		this.video = undefined;
		this.onChange();
	}

	async record(deviceId) {
		this.clear();
		const generation = this.audioGeneration;
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				autoGainControl: false, echoCancellation: true, noiseSuppression: true, ...(deviceId ? {deviceId: {exact: deviceId}} : {}),
			},
			video: false,
		});
		if (this.closed || generation !== this.audioGeneration) {
			this.stopTracks(stream);
			return;
		}

		this.audio = stream;
		try {
			const recorder = new MediaRecorder(stream);
			const chunks = [];
			recorder.ondataavailable = event => {
				if (event.data.size > 0) {
					chunks.push(event.data);
				}
			};

			recorder.onstop = () => {
				if (!this.closed && generation === this.audioGeneration && chunks.length > 0) {
					this.sample = URL.createObjectURL(new Blob(chunks, {type: recorder.mimeType}));
				}

				this.onChange();
			};

			recorder.addEventListener('error', () => {
				this.clear();
				this.onChange('Nie udało się nagrać próbki. Spróbuj ponownie.');
			});

			this.recorder = recorder;
			recorder.start();
			this.timer = setTimeout(() => this.stopRecording(), 10_000);
			this.onChange();
		} catch (error) {
			this.clear();
			throw error;
		}
	}

	stopRecording() {
		clearTimeout(this.timer);
		if (this.recorder?.state !== 'inactive' && this.recorder) {
			this.recorder.stop();
		}

		this.stopTracks(this.audio);
		this.audio = undefined;
		this.onChange();
	}

	clear() {
		this.audioGeneration++;
		this.stopRecording();
		if (this.sample) {
			URL.revokeObjectURL(this.sample);
			this.sample = undefined;
		}

		this.onChange();
	}

	close() {
		this.closed = true;
		this.clear();
		this.stopCamera();
	}
};
