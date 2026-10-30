const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

async function loadCallPreload(getUserMedia) {
	const context = vm.createContext({
		window: {},
		navigator: {mediaDevices: {getUserMedia}},
	});
	let injection;
	vm.runInNewContext(fs.readFileSync('dist-js/browser-call.js', 'utf8'), {
		exports: {},
		require: () => ({
			webFrame: {
				executeJavaScript(code) {
					injection = Promise.resolve(vm.runInContext(code, context));
					return injection;
				},
			},
		}),
		document: {addEventListener() {}},
		console,
	});
	await injection;
	return context.navigator.mediaDevices;
}

test('call preload preserves the selected camera and microphone while disabling AGC', async () => {
	let received;
	const stream = {};
	const devices = await loadCallPreload(async constraints => {
		received = constraints;
		return stream;
	});
	assert.equal(await devices.getUserMedia({
		audio: {deviceId: {exact: 'microphone'}, echoCancellation: false},
		video: {deviceId: {exact: 'camera'}},
	}), stream);
	assert.equal(received.audio.autoGainControl, false);
	assert.equal(received.audio.deviceId.exact, 'microphone');
	assert.equal(received.audio.echoCancellation, false);
	assert.equal(received.video.deviceId.exact, 'camera');
});

test('camera-only capture does not enable the microphone', async () => {
	let received;
	const devices = await loadCallPreload(async constraints => {
		received = constraints;
	});
	await devices.getUserMedia({audio: false, video: true});
	assert.equal(received.audio, false);
	assert.equal(received.video, true);
});

test('a denied microphone request propagates once without retrying', async () => {
	let calls = 0;
	const denial = new Error('Permission denied');
	const devices = await loadCallPreload(async () => {
		calls++;
		throw denial;
	});
	await assert.rejects(devices.getUserMedia({audio: true}), error => error === denial);
	assert.equal(calls, 1);
});
