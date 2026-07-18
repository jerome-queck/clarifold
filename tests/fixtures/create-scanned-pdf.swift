import AppKit
import Foundation
import PDFKit

guard CommandLine.arguments.count == 2 else { exit(1) }
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let image = NSImage(size: NSSize(width: 612, height: 792))
image.lockFocus()
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: 612, height: 792).fill()
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 28),
    .foregroundColor: NSColor.black
]
NSString(string: "Heine Borel compactness theorem.\nx^2 + y^2 = 1").draw(
    in: NSRect(x: 56, y: 580, width: 500, height: 120),
    withAttributes: attributes
)
image.unlockFocus()

guard let page = PDFPage(image: image) else { exit(1) }
let document = PDFDocument()
document.insert(page, at: 0)
guard document.write(to: output) else { exit(1) }
