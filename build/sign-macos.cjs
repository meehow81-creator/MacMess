const {execFileSync} = require('node:child_process');
const {signAsync} = require('@electron/osx-sign');

// Seal every nested executable and the final bundle, even for preview builds.
// An ad-hoc signature provides integrity, not Developer ID trust or notarization.
module.exports = async options => {
	await signAsync({
		...options,
		identity: options.identity || '-',
		identityValidation: false,
		preAutoEntitlements: false,
	});
	execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', options.app], {stdio: 'inherit'});
};
