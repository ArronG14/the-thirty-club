// Checks a streaming derivative against its source before it is uploaded
// (docs/MEDIA_DELIVERY.md). No dependencies:
//
//   xcrun swift tools/verify-streaming-film.swift <source> <derivative.mp4>
//
// Fails (exit 1) unless the derivative is H.264 video with AAC audio, its
// `moov` atom precedes `mdat` (fast start), it carries no metadata atoms or
// location, it lasts as long as the source (±0.2 s) and it kept every
// source frame (±0.5 %). Prints size, bitrate, dimensions and frame timing.
import AVFoundation
import Foundation

func fourcc(_ c: FourCharCode) -> String {
  String(bytes: [24, 16, 8, 0].map { UInt8((c >> $0) & 255) }, encoding: .ascii) ?? "?"
}

/// Top-level atoms, and whether any metadata container exists anywhere.
func atoms(_ url: URL) throws -> (top: [String], metadata: Bool) {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  let end = try handle.seekToEnd()
  var top: [String] = []
  var metadata = false
  func walk(_ start: UInt64, _ stop: UInt64, _ depth: Int) throws {
    var pos = start
    while pos + 8 <= stop {
      try handle.seek(toOffset: pos)
      let header = handle.readData(ofLength: 16)
      var size = UInt64(header.prefix(4).reduce(0) { $0 << 8 | UInt32($1) })
      let kind = String(bytes: header[4..<8], encoding: .isoLatin1) ?? "?"
      var body: UInt64 = 8
      if size == 1 { size = header[8..<16].reduce(0) { $0 << 8 | UInt64($1) }; body = 16 }
      if size == 0 { size = stop - pos }
      if size < 8 { break }
      if depth == 0 { top.append(kind) }
      if ["udta", "meta", "ilst", "keys", "loci", "\u{A9}xyz"].contains(kind) { metadata = true }
      if ["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf"].contains(kind) {
        try walk(pos + body, pos + size, depth + 1)
      }
      pos += size
    }
  }
  try walk(0, end, 0)
  return (top, metadata)
}

func frames(_ asset: AVURLAsset) async throws -> [Double] {
  let track = try await asset.loadTracks(withMediaType: .video).first!
  let reader = try AVAssetReader(asset: asset)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
  reader.add(out)
  reader.startReading()
  var pts: [Double] = []
  while let sample = out.copyNextSampleBuffer() {
    if CMSampleBufferGetNumSamples(sample) > 0 {
      pts.append(CMSampleBufferGetPresentationTimeStamp(sample).seconds)
    }
  }
  return pts.sorted()
}

let done = DispatchSemaphore(value: 0)
var failures: [String] = []
Task {
  do {
    let source = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
    let url = URL(fileURLWithPath: CommandLine.arguments[2])
    let film = AVURLAsset(url: url)
    let bytes = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.doubleValue ?? 0
    let duration = try await film.load(.duration).seconds
    let sourceDuration = try await source.load(.duration).seconds
    print(String(format: "%@: %.1f MB, %.2f s, %.0f kbit/s overall", url.lastPathComponent, bytes / 1e6, duration, bytes * 8 / duration / 1000))
    if abs(duration - sourceDuration) > 0.2 { failures.append("duration \(duration) vs source \(sourceDuration)") }
    for track in try await film.load(.tracks) {
      for fd in try await track.load(.formatDescriptions) {
        let codec = fourcc(CMFormatDescriptionGetMediaSubType(fd))
        if track.mediaType == .video {
          let size = try await track.load(.naturalSize)
          let transform = try await track.load(.preferredTransform)
          print("  video \(codec) \(Int(size.width))x\(Int(size.height)) \(String(format: "%.0f", try await track.load(.estimatedDataRate) / 1000)) kbit/s")
          if codec != "avc1" { failures.append("video codec \(codec)") }
          if !transform.isIdentity { failures.append("rotation in metadata (draw it upright instead)") }
        } else if track.mediaType == .audio {
          print("  audio \(codec) \(String(format: "%.0f", try await track.load(.estimatedDataRate) / 1000)) kbit/s")
          if codec != "aac " { failures.append("audio codec \(codec)") }
        } else {
          failures.append("unexpected \(track.mediaType.rawValue) track")
        }
      }
    }
    let layout = try atoms(url)
    print("  atoms: \(layout.top.joined(separator: " "))")
    if let moov = layout.top.firstIndex(of: "moov"), let mdat = layout.top.firstIndex(of: "mdat"), moov < mdat {
    } else { failures.append("not fast start (moov must precede mdat)") }
    if layout.metadata { failures.append("metadata atoms present") }
    let mine = try await frames(film)
    let theirs = try await frames(source)
    let longest = zip(mine.dropFirst(), mine).map { $0 - $1 }.max() ?? 0
    print(String(format: "  frames %d of the source's %d; longest gap %.0f ms", mine.count, theirs.count, longest * 1000))
    if Double(abs(mine.count - theirs.count)) > Double(theirs.count) * 0.005 { failures.append("frames dropped") }
  } catch {
    failures.append("\(error)")
  }
  done.signal()
}
done.wait()
if failures.isEmpty {
  print("  PASS")
} else {
  print("  FAIL: \(failures.joined(separator: "; "))")
  exit(1)
}
