(() => {
	const element = id => document.querySelector(`#${id}`);
	const status = text => {
		element('status').textContent = text;
	};

	let busy = false;
	let audioContext;
	let meterFrame;
	let measuredStream;
	let peak = 0;
	const test = new globalThis.CaprineMediaTest(message => {
		element('video').srcObject = test.video ?? null;
		element('camera-stop').disabled = !test.video;
		element('stop').disabled = !test.audio;
		element('record').disabled = busy || Boolean(test.audio);
		if (test.sample && element('playback').getAttribute('src') !== test.sample) {
			element('playback').src = test.sample;
			status(peak > 0.01 ? 'Próbka gotowa. Odtwórz ją i sprawdź, czy słyszysz swój głos.' : 'Próbka gotowa, ale sygnał był bardzo cichy. Sprawdź mikrofon i odsłuchaj nagranie.');
		} else if (!test.sample && element('playback').getAttribute('src')) {
			element('playback').pause();
			element('playback').removeAttribute('src');
			element('playback').load();
		}

		if (measuredStream !== test.audio) {
			stopMeter();
			if (test.audio) {
				startMeter(test.audio);
			}
		}

		if (message) {
			status(message);
		}
	});

	function stopMeter() {
		cancelAnimationFrame(meterFrame);
		if (audioContext) {
			audioContext.close().catch(() => {});
		}

		audioContext = undefined;
		measuredStream = undefined;
		element('level').value = 0;
	}

	function startMeter(stream) {
		try {
			measuredStream = stream;
			peak = 0;
			audioContext = new AudioContext();
			audioContext.resume().catch(() => {});
			const analyser = audioContext.createAnalyser();
			audioContext.createMediaStreamSource(stream).connect(analyser);
			const samples = new Float32Array(analyser.fftSize);
			const update = () => {
				analyser.getFloatTimeDomainData(samples);
				const level = Math.sqrt(samples.reduce((sum, value) => sum + (value * value), 0) / samples.length);
				peak = Math.max(peak, level);
				element('level').value = Math.min(1, level * 4);
				meterFrame = requestAnimationFrame(update);
			};

			update();
		} catch {
			status('Wskaźnik poziomu jest niedostępny. Sprawdź dźwięk przez odsłuch próbki.');
		}
	}

	function explain(error) {
		const messages = {
			NotAllowedError: 'Brak dostępu. Sprawdź uprawnienia MacMess w Ustawieniach systemowych → Prywatność i ochrona → Mikrofon / Kamera.',
			NotFoundError: 'Nie znaleziono urządzenia. Podłącz kamerę lub mikrofon i spróbuj ponownie.',
			NotReadableError: 'Urządzenie jest niedostępne. Zamknij aplikację, która może go używać, i spróbuj ponownie.',
			OverconstrainedError: 'Wybrane urządzenie jest niedostępne. Wybierz inne lub urządzenie domyślne.',
		};
		status(messages[error.name] ?? 'Test nie powiódł się. Sprawdź urządzenie i spróbuj ponownie.');
	}

	async function refreshDevices() {
		const devices = await navigator.mediaDevices.enumerateDevices();
		for (const [id, kind, fallback] of [['camera', 'videoinput', 'Domyślna kamera'], ['microphone', 'audioinput', 'Domyślny mikrofon']]) {
			const select = element(id);
			const previous = select.value;
			select.replaceChildren(new Option(fallback, ''));
			for (const device of devices.filter(item => item.kind === kind && item.deviceId)) {
				select.add(new Option(device.label || `${fallback} ${select.options.length}`, device.deviceId));
			}

			if ([...select.options].some(option => option.value === previous)) {
				select.value = previous;
			}
		}
	}

	async function run(action, message) {
		if (busy) {
			return;
		}

		busy = true;
		element('record').disabled = true;
		element('preview').disabled = true;
		status(message);
		try {
			await action();
			await refreshDevices().catch(() => {});
		} catch (error) {
			explain(error);
		} finally {
			busy = false;
			element('record').disabled = Boolean(test.audio);
			element('preview').disabled = false;
		}
	}

	element('preview').addEventListener('click', () => run(async () => {
		await test.preview(element('camera').value);
		if (test.video) {
			status('Podgląd kamery działa. Sprawdź obraz.');
		}
	}, 'Uruchamianie kamery…'));
	element('record').addEventListener('click', () => run(async () => {
		element('playback').pause();
		await test.record(element('microphone').value);
		if (test.audio) {
			status('Mów teraz. Nagrywanie zakończy się po 10 sekundach.');
		}
	}, 'Uruchamianie mikrofonu…'));
	element('stop').addEventListener('click', () => test.stopRecording());
	element('camera-stop').addEventListener('click', () => {
		test.stopCamera();
		status('Kamera wyłączona.');
	});
	element('clear').addEventListener('click', () => {
		test.clear();
		status('Nagranie usunięte.');
	});
	element('camera').addEventListener('change', () => {
		test.stopCamera();
		status('Wybrano kamerę. Włącz podgląd.');
	});
	element('microphone').addEventListener('change', () => {
		test.clear();
		status('Wybrano mikrofon. Nagraj nową próbkę.');
	});
	let toneContext;
	element('tone').addEventListener('click', async () => {
		try {
			element('tone').disabled = true;
			toneContext = new AudioContext();
			await toneContext.resume();
			const oscillator = toneContext.createOscillator();
			const gain = toneContext.createGain();
			const now = toneContext.currentTime;
			gain.gain.setValueAtTime(0, now);
			gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
			gain.gain.linearRampToValueAtTime(0, now + 0.6);
			oscillator.connect(gain).connect(toneContext.destination);
			oscillator.addEventListener('ended', () => {
				toneContext.close();
				element('tone').disabled = false;
			});
			oscillator.start();
			oscillator.stop(now + 0.65);
			status('Odtwarzam krótki sygnał. Sprawdź, czy go słyszysz.');
		} catch {
			element('tone').disabled = false;
			status('Nie udało się odtworzyć sygnału. Sprawdź wyjście dźwięku macOS.');
		}
	});

	element('finish').addEventListener('click', () => window.close());
	window.addEventListener('pagehide', () => {
		test.close();
		stopMeter();
		toneContext?.close().catch(() => {});
	});
	navigator.mediaDevices.addEventListener('devicechange', () => {
		refreshDevices().catch(() => {});
	});
	refreshDevices().catch(explain);
})();
