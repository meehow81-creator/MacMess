<div align="center">
<img src="media/AppIcon-readme.png" width="160" height="160" alt="MacMess icon: two speech bubbles">
<h1>MacMess</h1>
<p><b>Unofficial Messenger desktop app for macOS, based on Caprine.</b></p>
</div>

MacMess is an experimental, community-maintained fork of [Caprine](https://github.com/sindresorhus/caprine), focused on macOS and Apple Silicon. It is not affiliated with Meta, Facebook, or Messenger. Original Caprine authors and contributors retain credit; see [the MIT license](license) and [upstream documentation](docs/UPSTREAM_README.md).

## Download for macOS Apple Silicon

**[Download MacMess.dmg](https://github.com/meehow81-creator/MacMess/releases/download/v2.61.0-macmess-preview.1/MacMess-2.61.0-mac-arm64.dmg)** · [Release notes and SHA-256 checksum](https://github.com/meehow81-creator/MacMess/releases/tag/v2.61.0-macmess-preview.1)

Experimental preview for M1/M2/M3/M4 Macs. Open the DMG and drag MacMess into Applications. This build is unsigned and not notarized by Apple; macOS may block it. Intel Macs are not supported by this artifact. Existing Caprine installations and profiles are separate.

## What is new

- Local camera preview and device selection.
- A microphone level meter and a recording of up to 10 seconds, with manual playback.
- A short speaker test and clear media-permission errors.
- More restrictive media permissions, no automatic joining of calls, and notification mute checks.
- A separate application identity and original speech-bubble icon.

Open **MacMess → Próbna rozmowa — kamera i mikrofon…** to test your devices. The panel currently uses Polish labels. Recordings remain in memory and are discarded when cleared or when the window closes. The test does not contact Messenger or validate a connection to another person. Device choices in the test do not change Messenger settings.

## Development

Use a supported Node.js version compatible with the locked dependencies:

```sh
npm ci
npm test
npm run build:mac:app
```

The macOS target is arm64. No signed or notarized MacMess release is provided yet. Do not treat the inherited Caprine download links as MacMess downloads. A new name/application identity does not migrate your existing Caprine profile.

## Verification and limitations

TypeScript compilation and 18 automated checks passed on a Mac mini M4. The diagnostic panel was also exercised in Electron with synthetic microphone/camera sources. Physical devices, Bluetooth, macOS permission prompts in a signed build, and live Messenger calls still need manual verification. See [manual testing](MANUAL_TESTING.md).

The inherited dependency tree still needs an Electron/security update. The full lint check has existing failures; the diagnostic panel files pass their targeted checks. This is experimental software, not a claim that Messenger calling or all original Caprine features work.

## Contributing

Bug reports and focused improvements are welcome, especially reproducible macOS permission, audio/video, and attachment issues. Please include macOS version, chip, device type, and reproduction steps; exclude private conversations, credentials, and recordings.

## Credits

Based on **Caprine**, originally created by Sindre Sorhus and maintained by its contributors. Original license and history are preserved. MacMess adds experimental macOS improvements and a local device test panel.
