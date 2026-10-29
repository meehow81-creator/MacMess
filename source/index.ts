import path from 'node:path';
import {readFileSync, existsSync} from 'node:fs';
import {
	app,
	nativeImage,
	screen as electronScreen,
	session,
	shell,
	BrowserWindow,
	Menu,
	Notification,
	MenuItemConstructorOptions,
	systemPreferences,
	nativeTheme,
} from 'electron';
import {ipcMain as ipc} from 'electron-better-ipc';
import {autoUpdater} from 'electron-updater';
import electronDl from 'electron-dl';
import electronContextMenu from 'electron-context-menu';
import electronLocalshortcut from 'electron-localshortcut';
import electronDebug from 'electron-debug';
import {is, darkMode} from 'electron-util';
import {bestFacebookLocaleFor} from 'facebook-locales';
import doNotDisturb from '@sindresorhus/do-not-disturb';
import updateAppMenu from './menu';
import config, {StoreType} from './config';
import tray from './tray';
import {
	sendAction,
	sendBackgroundAction,
	messengerDomain,
	stripTrackingFromUrl,
} from './util';
import {process as processEmojiUrl} from './emoji';
import ensureOnline from './ensure-online';
import {setUpMenuBarMode} from './menu-bar-mode';
import {caprineIconPath} from './constants';

ipc.setMaxListeners(100);

// Hardware acceleration & WebRTC audio/video optimizations for Apple Silicon
if (is.macos) {
	app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,WebRtcHideLocalIpsWithMdns');
	// Prevent WebRTC from aggressively damping or lowering macOS microphone input volume
	app.commandLine.appendSwitch('disable-features', 'WebRtcAllowInputVolumeModification');
}

electronDebug({
	isEnabled: true, // TODO: This is only enabled to allow `Command+R` because messenger.com sometimes gets stuck after computer waking up
	showDevTools: false,
});

electronDl({
	saveAs: true,
	openFolderWhenDone: false,
	showBadge: true,
});
electronContextMenu({
	showCopyImageAddress: true,
	prepend(defaultActions) {
		/*
		TODO: Use menu option or use replacement of options (https://github.com/sindresorhus/electron-context-menu/issues/70)
		See explanation for this hacky solution here: https://github.com/sindresorhus/caprine/pull/1169
		*/
		defaultActions.copyLink({
			transform: stripTrackingFromUrl,
		});

		return [];
	},
});

app.name = 'Caprine Enhanced';
app.setAppUserModelId('com.caprine-enhanced.mac');

if (!config.get('hardwareAcceleration')) {
	app.disableHardwareAcceleration();
}

if (!is.development && config.get('autoUpdate')) {
	(async () => {
		const FOUR_HOURS = 1000 * 60 * 60 * 4;
		setInterval(async () => {
			await autoUpdater.checkForUpdatesAndNotify();
		}, FOUR_HOURS);

		await autoUpdater.checkForUpdatesAndNotify();
	})();
}

let mainWindow: BrowserWindow;
let isQuitting = false;
let previousMessageCount = 0;
let dockMenu: Menu;
let isDNDEnabled = false;

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.show();
	}
});

// Preserves the window position when a display is removed and Caprine is moved to a different screen.
app.on('ready', () => {
	electronScreen.on('display-removed', () => {
		const [x, y] = mainWindow.getPosition();
		mainWindow.setPosition(x, y);
	});
});

async function updateBadge(messageCount: number): Promise<void> {
	if (!is.windows) {
		if (config.get('showUnreadBadge') && !isDNDEnabled) {
			app.badgeCount = messageCount;
		}

		if (
			is.macos
			&& !isDNDEnabled
			&& config.get('bounceDockOnMessage')
			&& previousMessageCount !== messageCount
		) {
			app.dock.bounce('informational');
			previousMessageCount = messageCount;
		}
	}

	if (!is.macos) {
		if (config.get('showUnreadBadge')) {
			tray.setBadge(messageCount > 0);
		}

		if (config.get('flashWindowOnMessage')) {
			mainWindow.flashFrame(messageCount !== 0);
		}
	}

	tray.update(messageCount);

	if (is.windows) {
		if (!config.get('showUnreadBadge') || messageCount === 0) {
			mainWindow.setOverlayIcon(null, '');
		} else {
			// Delegate drawing of overlay icon to renderer process
			updateOverlayIcon(await ipc.callRenderer(mainWindow, 'render-overlay-icon', messageCount));
		}
	}
}

function updateOverlayIcon({data, text}: {data: string; text: string}): void {
	const img = nativeImage.createFromDataURL(data);
	mainWindow.setOverlayIcon(img, text);
}

type BeforeSendHeadersResponse = {
	cancel?: boolean;
	requestHeaders?: Record<string, string>;
};

type OnSendHeadersDetails = {
	id: number;
	url: string;
	method: string;
	webContentsId?: number;
	resourceType: string;
	referrer: string;
	timestamp: number;
	requestHeaders: Record<string, string>;
};

function enableHiresResources(): void {
	const scaleFactor = Math.max(
		...electronScreen.getAllDisplays().map(display => display.scaleFactor),
	);

	if (scaleFactor === 1) {
		return;
	}

	const filter = {urls: [`*://*.${messengerDomain}/`]};

	session.defaultSession.webRequest.onBeforeSendHeaders(
		filter,
		(details: OnSendHeadersDetails, callback: (response: BeforeSendHeadersResponse) => void) => {
			let cookie = details.requestHeaders.Cookie;

			if (cookie && details.method === 'GET') {
				cookie = /(?:; )?dpr=\d/.test(cookie) ? cookie.replace(/dpr=\d/, `dpr=${scaleFactor}`) : `${cookie}; dpr=${scaleFactor}`;

				(details.requestHeaders as any).Cookie = cookie;
			}

			callback({
				cancel: false,
				requestHeaders: details.requestHeaders,
			});
		},
	);
}

function initRequestsFiltering(): void {
	const filter = {
		urls: [
			`*://*.${messengerDomain}/*typ.php*`, // Type indicator blocker
			`*://*.${messengerDomain}/*change_read_status.php*`, // Seen indicator blocker
			`*://*.${messengerDomain}/*delivery_receipts*`, // Delivery receipts indicator blocker
			`*://*.${messengerDomain}/*unread_threads*`, // Delivery receipts indicator blocker
			'*://*.fbcdn.net/images/emoji.php/v9/*', // Emoji
			'*://*.facebook.com/images/emoji.php/v9/*', // Emoji
		],
	};

	session.defaultSession.webRequest.onBeforeRequest(filter, async ({url}, callback) => {
		if (url.includes('emoji.php')) {
			callback(await processEmojiUrl(url));
		} else if (url.includes('typ.php')) {
			callback({cancel: config.get('block.typingIndicator' as any)});
		} else if (url.includes('change_read_status.php')) {
			callback({cancel: config.get('block.chatSeen' as any)});
		} else if (url.includes('delivery_receipts') || url.includes('unread_threads')) {
			callback({cancel: config.get('block.deliveryReceipt' as any)});
		}
	});

	session.defaultSession.webRequest.onHeadersReceived({
		urls: ['*://static.xx.fbcdn.net/rsrc.php/*'],
	}, ({responseHeaders}, callback) => {
		if (!config.get('callRingtoneMuted') || !responseHeaders) {
			callback({});
			return;
		}

		const callRingtoneHash = '2NAu/QVqg211BbktgY5GkA==';
		callback({
			cancel: responseHeaders['content-md5'][0] === callRingtoneHash,
		});
	});
}

function setUserLocale(): void {
	const userLocale = bestFacebookLocaleFor(app.getLocale().replace('-', '_'));
	const cookie = {
		url: 'https://www.messenger.com/',
		name: 'locale',
		secure: true,
		value: userLocale,
	};

	session.defaultSession.cookies.set(cookie);
}

export function isAllowedMessengerDomain(urlString: string | undefined): boolean {
	if (!urlString) {
		return false;
	}

	try {
		const {hostname} = new URL(urlString);
		return (
			hostname === 'messenger.com'
			|| hostname.endsWith('.messenger.com')
			|| hostname === 'facebook.com'
			|| hostname.endsWith('.facebook.com')
			|| hostname === 'workplace.com'
			|| hostname.endsWith('.workplace.com')
			|| hostname.endsWith('.fbcdn.net')
			|| hostname.endsWith('.fbsbx.com')
		);
	} catch {
		return false;
	}
}

export async function requestMediaPermissions(): Promise<{camera: boolean; microphone: boolean}> {
	if (!is.macos) {
		return {camera: true, microphone: true};
	}

	try {
		let micAccess = systemPreferences.getMediaAccessStatus('microphone') === 'granted';
		if (!micAccess) {
			micAccess = await systemPreferences.askForMediaAccess('microphone');
		}

		let cameraAccess = systemPreferences.getMediaAccessStatus('camera') === 'granted';
		if (!cameraAccess) {
			cameraAccess = await systemPreferences.askForMediaAccess('camera');
		}

		return {camera: cameraAccess, microphone: micAccess};
	} catch (error) {
		console.error('Failed to request macOS media permissions:', error);
		return {camera: false, microphone: false};
	}
}

function initSessionPermissions(): void {
	session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
		const url = webContents.getURL() || details.requestingUrl;
		if (!isAllowedMessengerDomain(url)) {
			callback(false);
			return;
		}

		// Allow audio/video capture for calls, notifications, and fullscreen
		if (
			permission === 'media'
			|| permission === 'notifications'
			|| permission === 'fullscreen'
			|| permission === 'pointerLock'
			|| permission === 'openExternal'
		) {
			callback(true);
			return;
		}

		callback(true);
	});

	session.defaultSession.setPermissionCheckHandler((_webContents, _permission, requestingOrigin) => {
		if (!isAllowedMessengerDomain(requestingOrigin)) {
			return false;
		}

		return true;
	});

	if (typeof (session.defaultSession as any).setDevicePermissionHandler === 'function') {
		(session.defaultSession as any).setDevicePermissionHandler((details: {origin: string}) => {
			return isAllowedMessengerDomain(details.origin);
		});
	}
}

function setNotificationsMute(status: boolean): void {
	const label = 'Mute Notifications';
	const muteMenuItem = Menu.getApplicationMenu()!.getMenuItemById('mute-notifications')!;

	config.set('notificationsMuted', status);
	muteMenuItem.checked = status;

	if (is.macos) {
		const item = dockMenu.items.find(x => x.label === label);
		item!.checked = status;
	}
}

function createMainWindow(): BrowserWindow {
	const lastWindowState = config.get('lastWindowState');

	// Messenger or Work Chat
	const mainURL = config.get('useWorkChat')
		? 'https://work.facebook.com/chat'
		: 'https://www.messenger.com/';

	const win = new BrowserWindow({
		title: app.name,
		show: false,
		x: lastWindowState.x,
		y: lastWindowState.y,
		width: lastWindowState.width,
		height: lastWindowState.height,
		icon: is.linux ? caprineIconPath : undefined,
		minWidth: 400,
		minHeight: 200,
		alwaysOnTop: config.get('alwaysOnTop'),
		titleBarStyle: 'hiddenInset',
		trafficLightPosition: {
			x: 80,
			y: 20,
		},
		autoHideMenuBar: config.get('autoHideMenuBar'),
		webPreferences: {
			preload: path.join(__dirname, 'browser.js'),
			contextIsolation: true,
			nodeIntegration: true,
			spellcheck: config.get('isSpellCheckerEnabled'),
			plugins: true,
		},
	});

	require('@electron/remote/main').initialize();
	require('@electron/remote/main').enable(win.webContents);

	setUserLocale();
	initRequestsFiltering();

	let previousDarkMode = darkMode.isEnabled;
	darkMode.onChange(() => {
		if (darkMode.isEnabled !== previousDarkMode) {
			previousDarkMode = darkMode.isEnabled;
			win.webContents.send('set-theme');
		}
	});

	if (is.macos) {
		win.setSheetOffset(40);
	}

	win.loadURL(mainURL);

	win.on('close', event => {
		if (config.get('quitOnWindowClose')) {
			app.quit();
			return;
		}

		// Workaround for https://github.com/electron/electron/issues/20263
		// Closing the app window when on full screen leaves a black screen
		// Exit fullscreen before closing
		if (is.macos && mainWindow.isFullScreen()) {
			mainWindow.once('leave-full-screen', () => {
				mainWindow.hide();
			});
			mainWindow.setFullScreen(false);
		}

		if (!isQuitting) {
			event.preventDefault();

			// Workaround for https://github.com/electron/electron/issues/10023
			win.blur();
			if (is.macos) {
				// On macOS we're using `app.hide()` in order to focus the previous window correctly
				app.hide();
			} else {
				win.hide();
			}
		}
	});

	win.on('focus', () => {
		if (config.get('flashWindowOnMessage')) {
			// This is a security in the case where messageCount is not reset by page title update
			win.flashFrame(false);
		}
	});

	win.on('page-title-updated', (_event, title) => {
		// Messenger formats unread count in title: "(3) Messenger" or "(99+) Messenger"
		const match = /^\((\d+)\+?\)/.exec(title);
		if (match) {
			const count = Number.parseInt(match[1], 10);
			updateBadge(count);
		} else if (title.includes('Messenger') && !title.startsWith('(')) {
			updateBadge(0);
		}
	});

	win.on('resize', () => {
		const {isMaximized} = config.get('lastWindowState');
		config.set('lastWindowState', {...win.getNormalBounds(), isMaximized});
	});

	win.on('maximize', () => {
		config.set('lastWindowState.isMaximized', true);
	});

	win.on('unmaximize', () => {
		config.set('lastWindowState.isMaximized', false);
	});

	return win;
}

(async () => {
	await Promise.all([ensureOnline(), app.whenReady()]);
	initSessionPermissions();
	if (is.macos) {
		void requestMediaPermissions();
	}
	await updateAppMenu();
	mainWindow = createMainWindow();

	// Workaround for https://github.com/electron/electron/issues/5256
	electronLocalshortcut.register(mainWindow, 'CommandOrControl+=', () => {
		sendAction('zoom-in');
	});

	// Start in menu bar mode if enabled, otherwise start normally
	setUpMenuBarMode(mainWindow);

	if (is.macos) {
		const firstItem: MenuItemConstructorOptions = {
			label: 'Mute Notifications',
			type: 'checkbox',
			visible: is.development,
			checked: config.get('notificationsMuted'),
			async click() {
				setNotificationsMute(await ipc.callRenderer(mainWindow, 'toggle-mute-notifications'));
			},
		};

		dockMenu = Menu.buildFromTemplate([firstItem]);
		app.dock.setMenu(dockMenu);

		// Dock icon is hidden initially on macOS
		if (config.get('showDockIcon')) {
			app.dock.show();
		}

		ipc.once('conversations', () => {
			// Messenger sorts the conversations by unread state.
			// We select the first conversation from the list.
			sendAction('jump-to-conversation', 1);
		});

		ipc.answerRenderer('conversations', (conversations: Conversation[]) => {
			if (conversations.length === 0) {
				return;
			}

			const items = conversations.map(({label, icon}, index) => ({
				label: `${label}`,
				icon: nativeImage.createFromDataURL(icon),
				click() {
					mainWindow.show();
					sendAction('jump-to-conversation', index + 1);
				},
			}));

			app.dock.setMenu(Menu.buildFromTemplate([firstItem, {type: 'separator'}, ...items]));
		});
	}

	// Update badge on conversations change
	ipc.answerRenderer('update-tray-icon', async (messageCount: number) => {
		updateBadge(messageCount);
	});

	enableHiresResources();

	const {webContents} = mainWindow;

	webContents.on('dom-ready', async () => {
		// Set window title to Caprine
		mainWindow.setTitle(app.name);

		await updateAppMenu();

		const files = ['browser.css', 'dark-mode.css', 'vibrancy.css', 'code-blocks.css', 'autoplay.css', 'scrollbar.css'];

		const cssPath = path.join(__dirname, '..', 'css');

		for (const file of files) {
			if (existsSync(path.join(cssPath, file))) {
				webContents.insertCSS(readFileSync(path.join(cssPath, file), 'utf8'));
			}
		}

		if (config.get('useWorkChat') && existsSync(path.join(cssPath, 'workchat.css'))) {
			webContents.insertCSS(
				readFileSync(path.join(cssPath, 'workchat.css'), 'utf8'),
			);
		}

		if (existsSync(path.join(app.getPath('userData'), 'custom.css'))) {
			webContents.insertCSS(readFileSync(path.join(app.getPath('userData'), 'custom.css'), 'utf8'));
		}

		if (config.get('launchMinimized') || app.getLoginItemSettings().wasOpenedAsHidden) {
			mainWindow.hide();
			tray.create(mainWindow);
		} else {
			if (config.get('lastWindowState').isMaximized) {
				mainWindow.maximize();
			}

			mainWindow.show();
		}

		if (is.macos) {
			// TODO: 'update-dnd-mode' is not called
			ipc.answerRenderer('update-dnd-mode', async (initialSoundsValue: boolean) => {
				doNotDisturb.on('change', (doNotDisturb: boolean) => {
					isDNDEnabled = doNotDisturb;
					ipc.callRenderer(mainWindow, 'toggle-sounds', {checked: isDNDEnabled ? false : initialSoundsValue});
				});

				isDNDEnabled = await doNotDisturb.isEnabled();

				return isDNDEnabled ? false : initialSoundsValue;
			});
		}

		// TODO: Re-enable this when muting notifications is fixed
		// setNotificationsMute(await ipc.callRenderer(mainWindow, 'toggle-mute-notifications', {
		// 	defaultStatus: config.get('notificationsMuted'),
		// }));

		ipc.callRenderer(mainWindow, 'toggle-message-buttons', config.get('showMessageButtons'));

		await webContents.executeJavaScript(
			readFileSync(path.join(__dirname, 'notifications-isolated.js'), 'utf8'),
		);

		if (is.macos) {
			await import('./touch-bar');
		}
	});

	function isCallUrl(url: string): boolean {
		try {
			const parsed = new URL(url);
			const hostname = parsed.hostname.toLowerCase();
			const isMessengerOrFb =
				hostname === 'messenger.com'
				|| hostname.endsWith('.messenger.com')
				|| hostname === 'facebook.com'
				|| hostname.endsWith('.facebook.com');

			if (!isMessengerOrFb) {
				return false;
			}

			const pathname = parsed.pathname.toLowerCase();
			return (
				pathname.includes('/videocall')
				|| pathname.includes('/groupcall')
				|| pathname.includes('/call')
				|| pathname.includes('/rtc')
				|| pathname.includes('/rooms')
			);
		} catch {
			return false;
		}
	}

	function isAuthPopupUrl(url: string): boolean {
		try {
			const parsed = new URL(url);
			const hostname = parsed.hostname.toLowerCase();
			const isMeta =
				hostname === 'facebook.com'
				|| hostname.endsWith('.facebook.com')
				|| hostname === 'meta.com'
				|| hostname.endsWith('.meta.com')
				|| hostname === 'accountscenter.facebook.com'
				|| hostname.endsWith('.accountscenter.facebook.com')
				|| hostname === 'messenger.com'
				|| hostname.endsWith('.messenger.com');

			if (!isMeta) {
				return false;
			}

			const path = parsed.pathname.toLowerCase();
			return (
				path.includes('login')
				|| path.includes('auth')
				|| path.includes('checkpoint')
				|| path.includes('oauth')
				|| path.includes('recover')
				|| path.includes('two_step')
				|| path.includes('two_factor')
			);
		} catch {
			return false;
		}
	}

	webContents.setWindowOpenHandler(details => {
		const {url} = details;

		// Voice/video call popup, WebRTC rooms, or call about:blank
		if (
			url === 'about:blank'
			|| url === 'about:blank#blocked'
			|| isCallUrl(url)
		) {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					show: true,
					width: 960,
					height: 640,
					minWidth: 480,
					minHeight: 360,
					title: 'Caprine Enhanced — Call',
					titleBarStyle: 'default',
					webPreferences: {
						nodeIntegration: false,
						contextIsolation: true,
						preload: path.join(__dirname, 'browser-call.js'),
					},
				},
			};
		}

		// Authentication / OAuth / 2FA popups for Facebook / Meta
		if (isAuthPopupUrl(url)) {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					show: true,
					width: 600,
					height: 700,
					title: 'Caprine Enhanced — Login',
					webPreferences: {
						nodeIntegration: false,
						contextIsolation: true,
					},
				},
			};
		}

		// External link: strip tracking and open in default system browser
		const targetUrl = stripTrackingFromUrl(url);
		shell.openExternal(targetUrl);
		return {action: 'deny'};
	});

	webContents.on('did-create-window', childWindow => {
		childWindow.setTitle('Caprine Enhanced — Call');
		childWindow.webContents.setWindowOpenHandler(childDetails => {
			if (isCallUrl(childDetails.url) || isAuthPopupUrl(childDetails.url)) {
				return {action: 'allow'};
			}

			shell.openExternal(stripTrackingFromUrl(childDetails.url));
			return {action: 'deny'};
		});
	});

	webContents.on('will-navigate', async (event, url) => {
		const isInternalNavigation = (navUrl: string): boolean => {
			try {
				const parsed = new URL(navUrl);
				const hostname = parsed.hostname.toLowerCase();
				const pathname = parsed.pathname.toLowerCase();

				// All messenger.com domains
				if (hostname === 'messenger.com' || hostname.endsWith('.messenger.com')) {
					return true;
				}

				// Accounts center
				if (hostname === 'accountscenter.facebook.com' || hostname.endsWith('.accountscenter.facebook.com')) {
					return true;
				}

				// Facebook & Meta authentication, login, checkpoints, 2FA, OAuth
				if (
					hostname === 'facebook.com'
					|| hostname.endsWith('.facebook.com')
					|| hostname === 'meta.com'
					|| hostname.endsWith('.meta.com')
				) {
					if (
						pathname.includes('login')
						|| pathname.startsWith('/checkpoint')
						|| pathname.startsWith('/recover')
						|| pathname.startsWith('/two_step')
						|| pathname.startsWith('/two_factor')
						|| pathname.startsWith('/security')
						|| pathname.startsWith('/auth')
						|| pathname.includes('oauth')
						|| pathname.includes('dialog')
						|| pathname.startsWith('/chat')
						|| pathname.startsWith('/messages')
						|| pathname.startsWith('/videocall')
						|| pathname.startsWith('/call')
						|| pathname.startsWith('/cookie')
						|| pathname.startsWith('/privacy')
						|| pathname.startsWith('/help')
						|| pathname === '/'
					) {
						return true;
					}
				}

				// Workchat / workplace
				if (
					hostname === 'work.facebook.com'
					|| hostname === 'work.workplace.com'
					|| hostname.endsWith('.workplace.com')
				) {
					return true;
				}

				// Microsoft Online SSO for workplace
				if (hostname === 'login.microsoftonline.com') {
					return true;
				}

				// Media attachments and CDN assets
				if (
					hostname.endsWith('.fbcdn.net')
					|| hostname.endsWith('.fbsbx.com')
					|| pathname.includes('/attachment/')
					|| pathname.includes('/messages/attachment/')
				) {
					return true;
				}

				return false;
			} catch {
				return false;
			}
		};

		if (isInternalNavigation(url)) {
			return;
		}

		event.preventDefault();
		const cleanUrl = stripTrackingFromUrl(url);
		await shell.openExternal(cleanUrl);
	});
})();

if (is.macos) {
	ipc.answerRenderer('set-vibrancy', () => {
		mainWindow.setBackgroundColor('#80FFFFFF'); // Transparent, workaround for vibrancy issue.
		mainWindow.setVibrancy('sidebar');
	});
}

function toggleMaximized(): void {
	if (mainWindow.isMaximized()) {
		mainWindow.unmaximize();
	} else {
		mainWindow.maximize();
	}
}

ipc.answerRenderer('titlebar-doubleclick', () => {
	if (is.macos) {
		const doubleClickAction = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');

		if (doubleClickAction === 'Minimize') {
			mainWindow.minimize();
		} else if (doubleClickAction === 'Maximize') {
			toggleMaximized();
		}
	} else {
		toggleMaximized();
	}
});

app.on('activate', () => {
	if (mainWindow) {
		mainWindow.show();
	}
});

app.on('before-quit', async () => {
	isQuitting = true;

	try {
		await session.defaultSession.cookies.flushStore();
	} catch (error) {
		console.error('Failed to flush cookies on quit:', error);
	}

	// Checking whether the window exists to work around an Electron race issue:
	// https://github.com/sindresorhus/caprine/issues/809
	if (mainWindow) {
		const {isMaximized} = config.get('lastWindowState');
		config.set('lastWindowState', {...mainWindow.getNormalBounds(), isMaximized});
	}
});

const notifications = new Map();

ipc.answerRenderer(
	'notification',
	({id, title, body, icon, silent}: {id: number; title: string; body: string; icon: string; silent: boolean}) => {
		// Don't send notifications when the window is focused
		if (mainWindow.isFocused()) {
			return;
		}

		const notification = new Notification({
			title,
			body: config.get('notificationMessagePreview') ? body : 'You have a new message',
			hasReply: true,
			icon: nativeImage.createFromDataURL(icon),
			silent,
		});

		notifications.set(id, notification);

		notification.on('click', () => {
			sendAction('notification-callback', {callbackName: 'onclick', id});

			notifications.delete(id);
		});

		notification.on('reply', (_event, reply: string) => {
			// We use onclick event used by messenger to go to the right convo
			sendBackgroundAction('notification-reply-callback', {callbackName: 'onclick', id, reply});

			notifications.delete(id);
		});

		notification.on('close', () => {
			sendBackgroundAction('notification-callback', {callbackName: 'onclose', id});
			notifications.delete(id);
		});

		notification.show();
	},
);

type ThemeSource = typeof nativeTheme.themeSource;

ipc.answerRenderer<undefined, StoreType['useWorkChat']>('get-config-useWorkChat', async () => config.get('useWorkChat'));
ipc.answerRenderer<undefined, StoreType['showMessageButtons']>('get-config-showMessageButtons', async () => config.get('showMessageButtons'));
ipc.answerRenderer<undefined, ThemeSource>('get-config-theme', async () => config.get('theme'));
ipc.answerRenderer<undefined, StoreType['privateMode']>('get-config-privateMode', async () => config.get('privateMode'));
ipc.answerRenderer<undefined, StoreType['vibrancy']>('get-config-vibrancy', async () => config.get('vibrancy'));
ipc.answerRenderer<undefined, StoreType['sidebar']>('get-config-sidebar', async () => config.get('sidebar'));
ipc.answerRenderer<undefined, StoreType['zoomFactor']>('get-config-zoomFactor', async () => config.get('zoomFactor'));
ipc.answerRenderer<StoreType['zoomFactor'], void>('set-config-zoomFactor', async zoomFactor => {
	config.set('zoomFactor', zoomFactor);
});
ipc.answerRenderer<undefined, StoreType['keepMeSignedIn']>('get-config-keepMeSignedIn', async () => config.get('keepMeSignedIn'));
ipc.answerRenderer<StoreType['keepMeSignedIn'], void>('set-config-keepMeSignedIn', async keepMeSignedIn => {
	config.set('keepMeSignedIn', keepMeSignedIn);
});
ipc.answerRenderer<undefined, StoreType['autoplayVideos']>('get-config-autoplayVideos', async () => config.get('autoplayVideos'));
ipc.answerRenderer<undefined, StoreType['emojiStyle']>('get-config-emojiStyle', async () => config.get('emojiStyle'));
ipc.answerRenderer<StoreType['emojiStyle'], void>('set-config-emojiStyle', async emojiStyle => {
	config.set('emojiStyle', emojiStyle);
});
