import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {BrowserWindow, session, systemPreferences} from 'electron';

let testWindow: BrowserWindow | undefined;

export function openMediaTestWindow(): void {
	if (testWindow && !testWindow.isDestroyed()) {
		testWindow.show();
		testWindow.focus();
		return;
	}

	const pagePath = path.join(__dirname, '../static/media-test.html');
	const pageUrl = pathToFileURL(pagePath).href;
	const testSession = session.fromPartition('caprine-media-test');
	const win = new BrowserWindow({
		title: 'Próbna rozmowa — Caprine Enhanced',
		width: 1000,
		height: 820,
		minWidth: 560,
		minHeight: 600,
		webPreferences: {
			session: testSession,
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
		},
	});
	testWindow = win;
	win.setMenu(null);
	const isTestPage = (contents: Electron.WebContents | undefined): boolean =>
		!win.isDestroyed() && contents === win.webContents && contents.getURL() === pageUrl;

	testSession.setPermissionCheckHandler((contents, permission) =>
		permission === 'media' && isTestPage(contents ?? undefined));
	testSession.setPermissionRequestHandler((contents, permission, callback, details) => {
		if (permission !== 'media' || !isTestPage(contents) || details.requestingUrl !== pageUrl) {
			callback(false);
			return;
		}

		void (async () => {
			try {
				// Native permission prompts are intentionally presented one at a time.
				for (const type of details.mediaTypes ?? ['audio', 'video']) {
					if (process.platform === 'darwin') {
						const device = type === 'audio' ? 'microphone' : 'camera';
						const status = systemPreferences.getMediaAccessStatus(device);
						// eslint-disable-next-line no-await-in-loop
						if (status !== 'granted' && (status !== 'not-determined' || !await systemPreferences.askForMediaAccess(device))) {
							callback(false);
							return;
						}
					}
				}

				callback(!win.isDestroyed());
			} catch {
				callback(false);
			}
		})();
	});
	testSession.setDevicePermissionHandler(() => false);
	win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
	win.webContents.on('will-navigate', event => {
		event.preventDefault();
	});
	win.webContents.on('will-redirect', event => {
		event.preventDefault();
	});
	win.on('closed', () => {
		testWindow = undefined;
		testSession.setPermissionRequestHandler((_contents, _permission, callback) => {
			callback(false);
		});
		testSession.setPermissionCheckHandler(() => false);
	});
	void win.loadFile(pagePath);
}
