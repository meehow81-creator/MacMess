const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function setup(getUserMedia) {
	const recordings = [];
	const revoked = [];
	let timer;
	class Recorder {
		addEventListener() {}
		constructor(stream) {
			this.stream = stream;
			this.state = 'inactive';
			this.mimeType = 'audio/webm';
			recordings.push(this);
		}

		start() {
			this.state = 'recording';
		}

		stop() {
			this.state = 'inactive';
			this.ondataavailable({data: new Blob(['voice'])});
			queueMicrotask(() => this.onstop());
		}
	}
	const context = vm.createContext({
		navigator: {mediaDevices: {getUserMedia}},
		MediaRecorder: Recorder, Blob, queueMicrotask,
		URL: {createObjectURL: () => 'blob:sample', revokeObjectURL: url => revoked.push(url)},
		setTimeout(callback, delay) {
			assert.equal(delay, 10_000);
			timer = callback;
			return 1;
		},
		clearTimeout() {},
	});
	vm.runInContext(fs.readFileSync('static/media-test-controller.js', 'utf8'), context);
	return {
		controller: new context.CaprineMediaTest(), recordings, revoked, timeout: () => timer(),
	};
}

function stream() {
	const track = {
		stopped: false, stop() {
			this.stopped = true;
		},
	};
	return {track, getTracks: () => [track]};
}

test('recording selects only audio, stops after ten seconds, and revokes the sample on close', async () => {
	const microphone = stream();
	let constraints;
	const fixture = setup(async value => {
		constraints = value;
		return microphone;
	});
	await fixture.controller.record('selected-microphone');
	assert.equal(constraints.audio.deviceId.exact, 'selected-microphone');
	assert.equal(constraints.audio.autoGainControl, false);
	assert.equal(constraints.video, false);
	fixture.timeout();
	await Promise.resolve();
	assert.equal(microphone.track.stopped, true);
	assert.equal(fixture.controller.sample, 'blob:sample');
	fixture.controller.close();
	assert.deepEqual(fixture.revoked, ['blob:sample']);
});

test('late permission grant after closing releases the microphone without recording', async () => {
	let resolve;
	const microphone = stream();
	const fixture = setup(() => new Promise(done => {
		resolve = done;
	}));
	const pending = fixture.controller.record('');
	fixture.controller.close();
	resolve(microphone);
	await pending;
	assert.equal(microphone.track.stopped, true);
	assert.equal(fixture.recordings.length, 0);
});

test('late camera grant after stopping preview releases the camera', async () => {
	let resolve;
	const camera = stream();
	const fixture = setup(() => new Promise(done => {
		resolve = done;
	}));
	const pending = fixture.controller.preview('');
	fixture.controller.stopCamera();
	resolve(camera);
	await pending;
	assert.equal(camera.track.stopped, true);
	assert.equal(fixture.controller.video, undefined);
});

test('deleting a recording before its final event prevents a new sample', async () => {
	const microphone = stream();
	const fixture = setup(async () => microphone);
	await fixture.controller.record('');
	fixture.controller.clear();
	await Promise.resolve();
	assert.equal(fixture.controller.sample, undefined);
	assert.equal(microphone.track.stopped, true);
});

test('permission denial propagates without retrying', async () => {
	let calls = 0;
	const failure = new Error('denied');
	const fixture = setup(async () => {
		calls++;
		throw failure;
	});
	await assert.rejects(fixture.controller.record(''), error => error === failure);
	assert.equal(calls, 1);
	assert.equal(fixture.controller.audio, undefined);
});

test('camera and microphone are both stopped on close', async () => {
	const camera = stream();
	const microphone = stream();
	const fixture = setup(async value => value.video ? camera : microphone);
	await fixture.controller.preview('camera-id');
	await fixture.controller.record('');
	fixture.controller.close();
	await Promise.resolve();
	assert.equal(camera.track.stopped, true);
	assert.equal(microphone.track.stopped, true);
	assert.equal(fixture.controller.sample, undefined);
});
