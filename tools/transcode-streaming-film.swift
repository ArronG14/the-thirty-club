// Streaming derivatives of the club's films (birthday film, Nyla's film).
//
// Apple's own encoder (AVFoundation / VideoToolbox, hardware H.264 on Apple
// silicon); no dependencies. The source is only read, never changed.
//
//   xcrun swift tools/transcode-streaming-film.swift <source> <output.mp4> \
//     <width> <height> <videoKbps>
//
// Output: MP4, H.264 High (8-bit 4:2:0, i.e. yuv420p), BT.709, every
// source frame at its own time (no frame-rate conversion; check with
// tools/verify-streaming-film.swift), a key frame every 2 s (quick
// seeking over HTTP byte ranges), the
// first AAC track passed through untouched, `moov` before `mdat` (fast start)
// and NO metadata: iPhone recordings carry the place they were filmed, and
// that must not travel with the film. Extra tracks (Apple spatial audio,
// timed metadata) are dropped. The picture is drawn upright (the source's
// rotation is applied) and scaled to fit the frame, centred.
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count == 6, let width = Int(args[3]), let height = Int(args[4]),
  let kbps = Int(args[5])
else {
  FileHandle.standardError.write(
    "usage: transcode-streaming-film.swift <source> <output.mp4> <width> <height> <videoKbps>\n"
      .data(using: .utf8)!)
  exit(2)
}
let source = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
if FileManager.default.fileExists(atPath: output.path) {
  FileHandle.standardError.write("refusing to overwrite \(output.path)\n".data(using: .utf8)!)
  exit(2)
}
let fps: Int32 = 30  // nominal: key-frame spacing and the compositor's fallback

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
  exit(1)
}

let done = DispatchSemaphore(value: 0)
Task {
  do {
    let asset = AVURLAsset(url: source)
    let duration = try await asset.load(.duration)
    guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
      fail("no video track")
    }
    // The first plain AAC track; spatial (APAC) tracks are left behind.
    var audioTrack: AVAssetTrack?
    for track in try await asset.loadTracks(withMediaType: .audio) {
      let fds = try await track.load(.formatDescriptions)
      if fds.contains(where: { CMFormatDescriptionGetMediaSubType($0) == kAudioFormatMPEG4AAC }) {
        audioTrack = track
        break
      }
    }
    let natural = try await videoTrack.load(.naturalSize)
    let transform = try await videoTrack.load(.preferredTransform)
    let upright = CGRect(origin: .zero, size: natural).applying(transform)
    let scale = min(CGFloat(width) / abs(upright.width), CGFloat(height) / abs(upright.height))
    let drawn = CGSize(width: abs(upright.width) * scale, height: abs(upright.height) * scale)
    let place = transform
      .concatenating(CGAffineTransform(translationX: -upright.minX, y: -upright.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(
        translationX: (CGFloat(width) - drawn.width) / 2,
        y: (CGFloat(height) - drawn.height) / 2))

    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layer.setTransform(place, at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    instruction.layerInstructions = [layer]
    instruction.backgroundColor = CGColor(red: 0, green: 0, blue: 0, alpha: 1)
    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: width, height: height)
    composition.frameDuration = CMTime(value: 1, timescale: fps)
    composition.instructions = [instruction]
    // Without this the compositor resamples to `frameDuration` and silently
    // drops frames from a 29.97 fps CapCut export (measured: a quarter of
    // them). With it, every source frame is rendered at its own time.
    composition.sourceTrackIDForFrameTiming = videoTrack.trackID
    composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2

    let reader = try AVAssetReader(asset: asset)
    let videoOut = AVAssetReaderVideoCompositionOutput(
      videoTracks: [videoTrack],
      videoSettings: [
        kCVPixelBufferPixelFormatTypeKey as String:
          kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      ])
    videoOut.videoComposition = composition
    videoOut.alwaysCopiesSampleData = false
    reader.add(videoOut)
    var audioOut: AVAssetReaderTrackOutput?
    if let audioTrack {
      let out = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
      out.alwaysCopiesSampleData = false
      reader.add(out)
      audioOut = out
    }

    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true  // moov first: fast start
    writer.metadata = []  // no location, device or software tags
    let videoIn = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoColorPropertiesKey: [
          AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
          AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
          AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: kbps * 1000,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
          AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
          AVVideoMaxKeyFrameIntervalDurationKey: 2,
          AVVideoExpectedSourceFrameRateKey: Int(fps),
          AVVideoAllowFrameReorderingKey: true,
        ],
      ])
    videoIn.expectsMediaDataInRealTime = false
    writer.add(videoIn)
    var audioIn: AVAssetWriterInput?
    if let audioTrack {
      let hint = try await audioTrack.load(.formatDescriptions).first
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: hint)
      input.expectsMediaDataInRealTime = false
      writer.add(input)
      audioIn = input
    }

    guard reader.startReading() else { fail("reader: \(String(describing: reader.error))") }
    guard writer.startWriting() else { fail("writer: \(String(describing: writer.error))") }
    writer.startSession(atSourceTime: .zero)

    let total = duration.seconds
    let group = DispatchGroup()
    let videoQueue = DispatchQueue(label: "video")
    let audioQueue = DispatchQueue(label: "audio")
    var lastReport = -10.0
    group.enter()
    videoIn.requestMediaDataWhenReady(on: videoQueue) {
      while videoIn.isReadyForMoreMediaData {
        guard let sample = videoOut.copyNextSampleBuffer() else {
          videoIn.markAsFinished()
          group.leave()
          return
        }
        let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
        if t - lastReport >= 30 {
          lastReport = t
          print(String(format: "  %@ %5.1f%%", output.lastPathComponent, 100 * t / total))
        }
        if !videoIn.append(sample) { fail("video append: \(String(describing: writer.error))") }
      }
    }
    if let audioIn, let audioOut {
      group.enter()
      audioIn.requestMediaDataWhenReady(on: audioQueue) {
        while audioIn.isReadyForMoreMediaData {
          guard let sample = audioOut.copyNextSampleBuffer() else {
            audioIn.markAsFinished()
            group.leave()
            return
          }
          if !audioIn.append(sample) { fail("audio append: \(String(describing: writer.error))") }
        }
      }
    }
    group.wait()
    if reader.status == .failed { fail("reader: \(String(describing: reader.error))") }
    await writer.finishWriting()
    if writer.status != .completed { fail("writer: \(String(describing: writer.error))") }
    print("  done \(output.path)")
  } catch {
    fail("\(error)")
  }
  done.signal()
}
done.wait()
