// The Private Screening Room's TEMPORARY five-second test film.
//
// A real H.264 + AAC MP4 (fast-start) for rehearsing the native video
// lifecycle: fullscreen, controls, natural end and early exit. It is never
// the birthday film. Regenerate on a Mac (no dependencies):
//
//   xcrun swift tools/create-screening-test-film.swift public/media/screening/screening-test-5s.mp4
//
// Picture: dark ground, THE THIRTY CLUB, "SCREENING TEST — 5 SECONDS", a
// large countdown and a progress rule. Sound: one soft chime per second, so
// audio playback can be checked on the iPhone.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments.count > 1
  ? CommandLine.arguments[1]
  : "public/media/screening/screening-test-5s.mp4")
try? FileManager.default.removeItem(at: output)

let width = 1280
let height = 720
let fps: Int32 = 30
let seconds = 5
let frameCount = Int(fps) * seconds
let sampleRate = 44_100.0

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true  // moov first: progressive playback

let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 600_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: Int(fps),
  ],
])
video.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: video,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ])

let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVSampleRateKey: sampleRate,
  AVNumberOfChannelsKey: 1,
  AVEncoderBitRateKey: 64_000,
])
audio.expectsMediaDataInRealTime = false
writer.add(video)
writer.add(audio)
guard writer.startWriting() else { fatalError("\(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

func font(_ name: String, _ size: CGFloat) -> CTFont {
  CTFontCreateWithName(name as CFString, size, nil)
}
let champagne = CGColor(red: 0.85, green: 0.74, blue: 0.52, alpha: 1)
let ivory = CGColor(red: 0.95, green: 0.9, blue: 0.82, alpha: 1)
let muted = CGColor(red: 0.62, green: 0.53, blue: 0.4, alpha: 1)

func draw(_ text: String, _ ctFont: CTFont, _ color: CGColor, y: CGFloat,
          kern: CGFloat = 0, in context: CGContext) {
  let attributed = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): ctFont,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    NSAttributedString.Key(kCTKernAttributeName as String): kern,
  ])
  let line = CTLineCreateWithAttributedString(attributed)
  let bounds = CTLineGetBoundsWithOptions(line, .useOpticalBounds)
  context.textPosition = CGPoint(x: (CGFloat(width) - bounds.width) / 2 - bounds.minX, y: y)
  CTLineDraw(line, context)
}

func frame(_ index: Int) -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  let pixels = buffer!
  CVPixelBufferLockBaseAddress(pixels, [])
  let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height,
    bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  let t = Double(index) / Double(fps)
  context.setFillColor(CGColor(red: 0.04, green: 0.03, blue: 0.025, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  // Brass frame.
  context.setStrokeColor(muted)
  context.setLineWidth(2)
  context.stroke(CGRect(x: 40, y: 40, width: width - 80, height: height - 80))

  draw("THE THIRTY CLUB", font("Futura-Medium", 30), champagne, y: 600, kern: 9, in: context)
  draw("SCREENING TEST — 5 SECONDS", font("Futura-Medium", 22), ivory, y: 548, kern: 4, in: context)
  let remaining = max(1, seconds - Int(t))
  draw("\(remaining)", font("Didot", 260), ivory, y: 230, in: context)
  draw("TEMPORARY TEST FILM · NOT THE BIRTHDAY SCREENING",
       font("Futura-Medium", 16), muted, y: 150, kern: 3, in: context)

  // Progress rule.
  let rule = CGRect(x: 240, y: 104, width: width - 480, height: 4)
  context.setFillColor(CGColor(red: 0.2, green: 0.16, blue: 0.12, alpha: 1))
  context.fill(rule)
  context.setFillColor(champagne)
  context.fill(CGRect(x: rule.minX, y: rule.minY,
                      width: rule.width * CGFloat(min(1, t / Double(seconds))),
                      height: rule.height))
  draw(String(format: "0:%02d / 0:%02d", Int(t), seconds),
       font("Futura-Medium", 16), muted, y: 70, kern: 2, in: context)
  CVPixelBufferUnlockBaseAddress(pixels, [])
  return pixels
}

// Audio: a soft bell-like chime at the start of each second.
let totalSamples = Int(sampleRate) * seconds
var pcm = [Int16](repeating: 0, count: totalSamples)
for i in 0..<totalSamples {
  let s = Double(i) / sampleRate
  let local = s.truncatingRemainder(dividingBy: 1)
  let pitch = Int(s) == seconds - 1 ? 880.0 : 660.0
  let envelope = exp(-local * 5) * min(1, local * 200)
  let tone = sin(2 * .pi * pitch * s) + 0.35 * sin(2 * .pi * pitch * 2.01 * s)
  pcm[i] = Int16(max(-1, min(1, tone * envelope * 0.28)) * Double(Int16.max))
}

func audioSample(from start: Int, count: Int) -> CMSampleBuffer {
  var description = AudioStreamBasicDescription(
    mSampleRate: sampleRate, mFormatID: kAudioFormatLinearPCM,
    mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
    mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2,
    mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
  var format: CMAudioFormatDescription?
  CMAudioFormatDescriptionCreate(
    allocator: nil, asbd: &description, layoutSize: 0, layout: nil,
    magicCookieSize: 0, magicCookie: nil, extensions: nil,
    formatDescriptionOut: &format)
  var block: CMBlockBuffer?
  let bytes = count * 2
  CMBlockBufferCreateWithMemoryBlock(
    allocator: nil, memoryBlock: nil, blockLength: bytes,
    blockAllocator: nil, customBlockSource: nil, offsetToData: 0,
    dataLength: bytes, flags: 0, blockBufferOut: &block)
  pcm.withUnsafeBytes { raw in
    _ = CMBlockBufferReplaceDataBytes(
      with: raw.baseAddress!.advanced(by: start * 2), blockBuffer: block!,
      offsetIntoDestination: 0, dataLength: bytes)
  }
  var sample: CMSampleBuffer?
  CMAudioSampleBufferCreateReadyWithPacketDescriptions(
    allocator: nil, dataBuffer: block!, formatDescription: format!,
    sampleCount: count,
    presentationTimeStamp: CMTime(value: CMTimeValue(start), timescale: CMTimeScale(sampleRate)),
    packetDescriptions: nil, sampleBufferOut: &sample)
  return sample!
}

var nextFrame = 0
var nextAudio = 0
let chunk = 4410
while nextFrame < frameCount || nextAudio < totalSamples {
  if nextFrame < frameCount && video.isReadyForMoreMediaData {
    adaptor.append(frame(nextFrame), withPresentationTime: CMTime(value: CMTimeValue(nextFrame), timescale: fps))
    nextFrame += 1
    if nextFrame == frameCount { video.markAsFinished() }
  }
  if nextAudio < totalSamples && audio.isReadyForMoreMediaData {
    let count = min(chunk, totalSamples - nextAudio)
    audio.append(audioSample(from: nextAudio, count: count))
    nextAudio += count
    if nextAudio >= totalSamples { audio.markAsFinished() }
  }
  if !video.isReadyForMoreMediaData && !audio.isReadyForMoreMediaData {
    usleep(1000)
  }
}
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(seconds), timescale: 1))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fatalError("\(String(describing: writer.error))") }
print("Wrote \(output.path)")
