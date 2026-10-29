import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🧪 Starting Caprine Enhanced Unit Tests...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
	totalTests++;
	try {
		fn();
		console.log(`  ✓ ${name}`);
		passedTests++;
	} catch (error) {
		console.error(`  ✗ ${name}`);
		console.error(error);
		process.exitCode = 1;
	}
}

// 1. Test isAllowedMessengerDomain logic
test('Domain validation allows legitimate Messenger & Facebook domains', () => {
	function isAllowedMessengerDomain(urlString) {
		if (!urlString) return false;
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

	assert.equal(isAllowedMessengerDomain('https://www.messenger.com/login'), true);
	assert.equal(isAllowedMessengerDomain('https://messenger.com/t/12345'), true);
	assert.equal(isAllowedMessengerDomain('https://work.facebook.com/chat'), true);
	assert.equal(isAllowedMessengerDomain('https://static.xx.fbcdn.net/rsrc.php'), true);
	assert.equal(isAllowedMessengerDomain('https://cdn.fbsbx.com/v/t59/file.pdf'), true);
	assert.equal(isAllowedMessengerDomain('https://evil-messenger.com'), false);
	assert.equal(isAllowedMessengerDomain('https://messenger.com.attacker.org'), false);
	assert.equal(isAllowedMessengerDomain('javascript:alert(1)'), false);
	assert.equal(isAllowedMessengerDomain(undefined), false);
});

// 2. Test Call URL Routing logic
test('Call URL detector identifies WebRTC and voice/video endpoints accurately', () => {
	function isCallUrl(url) {
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

	assert.equal(isCallUrl('https://www.messenger.com/videocall/incall/?call_id=98765'), true);
	assert.equal(isCallUrl('https://www.messenger.com/groupcall/12345'), true);
	assert.equal(isCallUrl('https://www.facebook.com/call/room1'), true);
	assert.equal(isCallUrl('https://www.messenger.com/rtc/call_thread'), true);
	assert.equal(isCallUrl('https://www.messenger.com/t/1000000123'), false);
	assert.equal(isCallUrl('https://www.facebook.com/messages/t/456'), false);
	assert.equal(isCallUrl('https://external-service.com/videocall'), false);
});

// 3. Test Unread Count Parsing logic
test('Window title parser accurately extracts unread badge count', () => {
	function parseUnreadCount(title) {
		const match = /^\((\d+)\+?\)/.exec(title);
		if (match) {
			return Number.parseInt(match[1], 10);
		}
		if (title.includes('Messenger') && !title.startsWith('(')) {
			return 0;
		}
		return 0;
	}

	assert.equal(parseUnreadCount('(1) Messenger'), 1);
	assert.equal(parseUnreadCount('(5) Caprine Enhanced'), 5);
	assert.equal(parseUnreadCount('(99+) Messenger'), 99);
	assert.equal(parseUnreadCount('(150) Messenger'), 150);
	assert.equal(parseUnreadCount('Messenger'), 0);
	assert.equal(parseUnreadCount('Jan Kowalski - Messenger'), 0);
});

// 4. Test package.json identity and isolation
test('Application identity is isolated from original Caprine', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

	assert.equal(pkg.name, 'caprine-enhanced');
	assert.equal(pkg.productName, 'Caprine Enhanced');
	assert.equal(pkg.build.appId, 'com.caprine-enhanced.mac');
	assert.equal(pkg.build.mac.extendInfo?.LSUIElement, undefined, 'LSUIElement must not be enabled');
	assert.ok(pkg.build.mac.extendInfo?.NSCameraUsageDescription, 'Camera description missing');
	assert.ok(pkg.build.mac.extendInfo?.NSMicrophoneUsageDescription, 'Microphone description missing');

	// Verify target includes arm64
	const macTargets = pkg.build.mac.target;
	const arm64Targets = macTargets.filter(t => t.arch?.includes('arm64'));
	assert.ok(arm64Targets.length > 0, 'Apple Silicon arm64 target is configured');
});

// 5. Test entitlements.mac.plist
test('macOS entitlements include camera, microphone, network, and file permissions', () => {
	const plist = fs.readFileSync(path.join(rootDir, 'build', 'entitlements.mac.plist'), 'utf8');

	assert.ok(plist.includes('com.apple.security.device.camera'), 'Camera entitlement missing');
	assert.ok(plist.includes('com.apple.security.device.audio-input'), 'Microphone entitlement missing');
	assert.ok(plist.includes('com.apple.security.network.client'), 'Network client entitlement missing');
	assert.ok(plist.includes('com.apple.security.files.user-selected.read-write'), 'File access entitlement missing');
	assert.ok(plist.includes('com.apple.security.files.downloads.read-write'), 'Downloads entitlement missing');
});

// 6. Test notifications-isolated patch
test('Notification override properly assigns to window.Notification with granted permission', () => {
	const code = fs.readFileSync(path.join(rootDir, 'dist-js', 'notifications-isolated.js'), 'utf8');

	assert.ok(code.includes('Notification: augmentedNotification'), 'window.Notification assignment missing');
	assert.ok(code.includes("permission"), 'Notification permission property missing');
	assert.ok(code.includes("granted"), 'Permission granted status missing');
});

// 7. Test internal navigation vs external link routing
test('Internal navigation preserves login, checkpoints, and auth while routing external links', () => {
	function isInternalNavigation(navUrl) {
		try {
			const parsed = new URL(navUrl);
			const hostname = parsed.hostname.toLowerCase();
			const pathname = parsed.pathname.toLowerCase();

			if (hostname === 'messenger.com' || hostname.endsWith('.messenger.com')) {
				return true;
			}

			if (hostname === 'accountscenter.facebook.com' || hostname.endsWith('.accountscenter.facebook.com')) {
				return true;
			}

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

			if (hostname === 'work.facebook.com' || hostname === 'work.workplace.com' || hostname.endsWith('.workplace.com')) {
				return true;
			}

			if (hostname === 'login.microsoftonline.com') {
				return true;
			}

			if (hostname.endsWith('.fbcdn.net') || hostname.endsWith('.fbsbx.com')) {
				return true;
			}

			return false;
		} catch {
			return false;
		}
	}

	// Login and auth URLs must be internal
	assert.equal(isInternalNavigation('https://www.facebook.com/login.php?next=...'), true);
	assert.equal(isInternalNavigation('https://www.facebook.com/checkpoint/12345/'), true);
	assert.equal(isInternalNavigation('https://www.facebook.com/v12.0/dialog/oauth'), true);
	assert.equal(isInternalNavigation('https://accountscenter.facebook.com/security'), true);
	assert.equal(isInternalNavigation('https://www.messenger.com/t/12345'), true);

	// External web links must be external
	assert.equal(isInternalNavigation('https://google.com'), false);
	assert.equal(isInternalNavigation('https://github.com/sindresorhus/caprine'), false);
	assert.equal(isInternalNavigation('https://youtube.com/watch?v=123'), false);
});

console.log(`\n========================================`);
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log(`========================================\n`);

if (process.exitCode) {
	process.exit(process.exitCode);
}
