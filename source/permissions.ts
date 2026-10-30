// CDN attachments are deliberately excluded from device and notification permissions.
export function isAllowedMessengerDomain(urlString: string | undefined): boolean {
	if (!urlString) {
		return false;
	}

	try {
		const {protocol, hostname} = new URL(urlString);
		return protocol === 'https:' && ['messenger.com', 'facebook.com', 'workplace.com']
			.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
	} catch {
		return false;
	}
}

export function isAllowedPermission(origin: string | undefined, permission: string): boolean {
	return isAllowedMessengerDomain(origin)
		&& ['media', 'notifications', 'fullscreen'].includes(permission);
}
