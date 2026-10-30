// Original MacMess speech-bubble artwork. Run from the repository root on macOS.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
func fill(_ path: NSBezierPath, _ color: NSColor) { color.setFill(); path.fill() }
func bubble(_ rect: NSRect, _ color: NSColor, tail: Bool = true) {
    fill(NSBezierPath(roundedRect: rect, xRadius: rect.height * 0.27, yRadius: rect.height * 0.27), color)
    if tail {
        let path = NSBezierPath()
        path.move(to: NSPoint(x: rect.minX + rect.width * 0.18, y: rect.minY + 25))
        path.line(to: NSPoint(x: rect.minX + rect.width * 0.12, y: rect.minY - rect.height * 0.22))
        path.line(to: NSPoint(x: rect.minX + rect.width * 0.43, y: rect.minY + 25))
        path.close(); fill(path, color)
    }
}
func write(_ relative: String, size: Int, tray: Bool = false, unread: Bool = false) throws {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current!.cgContext.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    if tray {
        bubble(NSRect(x: 420, y: 200, width: 440, height: 350), .black)
        bubble(NSRect(x: 95, y: 420, width: 570, height: 400), .black)
        if unread { fill(NSBezierPath(ovalIn: NSRect(x: 780, y: 730, width: 180, height: 180)), .black) }
    } else {
        let background = NSBezierPath(roundedRect: NSRect(x: 64, y: 64, width: 896, height: 896), xRadius: 205, yRadius: 205)
        NSGraphicsContext.saveGraphicsState(); background.addClip()
        NSGradient(starting: NSColor(srgbRed: 0.12, green: 0.36, blue: 0.91, alpha: 1), ending: NSColor(srgbRed: 0.05, green: 0.13, blue: 0.43, alpha: 1))!.draw(in: background, angle: -70)
        NSGraphicsContext.restoreGraphicsState()
        bubble(NSRect(x: 415, y: 235, width: 400, height: 325), NSColor(srgbRed: 0.24, green: 0.91, blue: 0.84, alpha: 1))
        bubble(NSRect(x: 210, y: 410, width: 565, height: 360), .white)
        for x in [340, 475, 610] { fill(NSBezierPath(ovalIn: NSRect(x: x, y: 565, width: 70, height: 70)), NSColor(srgbRed: 0.10, green: 0.28, blue: 0.65, alpha: 1)) }
        if unread { fill(NSBezierPath(ovalIn: NSRect(x: 790, y: 790, width: 170, height: 170)), .systemRed) }
    }
    NSGraphicsContext.restoreGraphicsState()
    let url = root.appendingPathComponent(relative)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try rep.representation(using: .png, properties: [:])!.write(to: url)
}
try write("build/icon.png", size: 1024)
try write("static/Icon.png", size: 1024)
try write("media/AppIcon-readme.png", size: 512)
for size in [16, 32, 48, 64, 128, 256, 512] { try write("build/icons/\(size)x\(size).png", size: size) }
for (suffix, scale) in [("", 1), ("@2x", 2)] {
    try write("static/IconTray\(suffix).png", size: 32 * scale)
    try write("static/IconTrayUnread\(suffix).png", size: 32 * scale, unread: true)
    try write("static/IconMenuBarTemplate\(suffix).png", size: 22 * scale, tray: true)
    try write("static/IconMenuBarUnreadTemplate\(suffix).png", size: 22 * scale, tray: true, unread: true)
}
for size in [16, 32, 128, 256, 512] {
    try write("work-macmess.iconset/icon_\(size)x\(size).png", size: size)
    try write("work-macmess.iconset/icon_\(size)x\(size)@2x.png", size: size * 2)
}
