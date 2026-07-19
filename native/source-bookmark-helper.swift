import Foundation

guard CommandLine.arguments.count == 2,
      let bookmarkData = Data(base64Encoded: CommandLine.arguments[1]) else {
  FileHandle.standardError.write(Data("Expected one base64 security-scoped bookmark.\n".utf8))
  exit(2)
}

do {
  var isStale = false
  let url = try URL(
    resolvingBookmarkData: bookmarkData,
    options: [.withSecurityScope, .withoutUI],
    relativeTo: nil,
    bookmarkDataIsStale: &isStale
  )
  var result: [String: Any] = ["path": url.path, "stale": isStale]
  if isStale {
    let refreshed = try url.bookmarkData(
      options: [.withSecurityScope, .securityScopeAllowOnlyReadAccess],
      includingResourceValuesForKeys: nil,
      relativeTo: nil
    )
    result["refreshedBookmarkData"] = refreshed.base64EncodedString()
  }
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
} catch {
  FileHandle.standardError.write(Data("Could not resolve the security-scoped bookmark: \(error.localizedDescription)\n".utf8))
  exit(1)
}
