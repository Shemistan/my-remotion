// vision-detect (Task 30): лица, люди, руки и салиентность на PNG-кадрах через Apple Vision.
// `vision-detect <png>…` → stdout JSON-массив по кадрам; `vision-detect --version`.
// Только чтение переданных файлов, без сети. Координаты — как у Vision: доли кадра,
// начало слева СНИЗУ (переворот делает сервер, `fromVisionRect`). Кадр, который не читается
// или который Vision не обработал, — пустой результат с полем `error` (код 0, остальные кадры
// выдаются); код ≠ 0 — только ошибка вызова (флаги, не PNG, нет аргументов) или сбой JSON.
import CoreGraphics
import Foundation
import ImageIO
import Vision

let VERSION = "vision-detect 2"

struct Box: Encodable {
  let x: Double
  let y: Double
  let w: Double
  let h: Double
  let confidence: Double
}

struct Frame: Encodable {
  let path: String
  let width: Int
  let height: Int
  let faces: [Box]
  let humans: [Box]
  let hands: [Box]
  let saliency: [Box]
  /// Причина, если кадр не обработан (без поля — кадр прочитан).
  let error: String?
}

func fail(_ message: String, code: Int32 = 2) -> Never {
  FileHandle.standardError.write(("vision-detect: " + message + "\n").data(using: .utf8)!)
  exit(code)
}

func box(_ r: CGRect, _ c: Float) -> Box {
  // обрезка по кадру: Vision иногда даёт рамку чуть за краем
  let x0 = max(0, min(1, Double(r.minX)))
  let y0 = max(0, min(1, Double(r.minY)))
  let x1 = max(0, min(1, Double(r.maxX)))
  let y1 = max(0, min(1, Double(r.maxY)))
  return Box(x: x0, y: y0, w: max(0, x1 - x0), h: max(0, y1 - y0), confidence: Double(c))
}

/// Рамка руки по суставам с уверенностью ≥ 0,3; меньше 3 точек — руки нет.
func handBox(_ o: VNHumanHandPoseObservation) -> Box? {
  guard let pts = try? o.recognizedPoints(.all) else { return nil }
  let good = pts.values.filter { $0.confidence >= 0.3 }
  if good.count < 3 { return nil }
  let xs = good.map { Double($0.location.x) }
  let ys = good.map { Double($0.location.y) }
  let r = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
  if r.width <= 0 || r.height <= 0 { return nil }
  return box(r, o.confidence)
}

/// Пустой кадр с причиной: один нечитаемый кадр не валит весь запуск.
func broken(_ path: String, _ why: String) -> Frame {
  return Frame(path: path, width: 0, height: 0, faces: [], humans: [], hands: [], saliency: [], error: why)
}

func analyze(_ path: String) -> Frame {
  var isDir: ObjCBool = false
  if !FileManager.default.fileExists(atPath: path, isDirectory: &isDir) || isDir.boolValue { return broken(path, "нет файла") }
  let url = URL(fileURLWithPath: path)
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    return broken(path, "не читается как изображение")
  }
  let faces = VNDetectFaceRectanglesRequest()
  let humans = VNDetectHumanRectanglesRequest()
  humans.upperBodyOnly = false
  let hands = VNDetectHumanHandPoseRequest()
  hands.maximumHandCount = 4
  let saliency = VNGenerateAttentionBasedSaliencyImageRequest()
  let handler = VNImageRequestHandler(cgImage: img, options: [:])
  do {
    try handler.perform([faces, humans, hands, saliency])
  } catch {
    return broken(path, "Vision не обработал: \(error.localizedDescription)")
  }
  let fb = (faces.results ?? []).map { box($0.boundingBox, $0.confidence) }.filter { $0.w > 0 && $0.h > 0 }
  let hb = (humans.results ?? []).map { box($0.boundingBox, $0.confidence) }.filter { $0.w > 0 && $0.h > 0 }
  let hd = (hands.results ?? []).compactMap(handBox).filter { $0.w > 0 && $0.h > 0 }
  var sb: [Box] = []
  for o in saliency.results ?? [] {
    for s in o.salientObjects ?? [] {
      let b = box(s.boundingBox, s.confidence)
      if b.w > 0 && b.h > 0 { sb.append(b) }
    }
  }
  return Frame(path: path, width: img.width, height: img.height, faces: fb, humans: hb, hands: hd, saliency: sb, error: nil)
}

let args = Array(CommandLine.arguments.dropFirst())
if args == ["--version"] {
  print(VERSION)
  exit(0)
}
if args.isEmpty { fail("usage: vision-detect <png>… | --version", code: 64) }
var frames: [Frame] = []
for a in args {
  if a.hasPrefix("-") { fail("неизвестный флаг: \(a)", code: 64) }
  if !a.lowercased().hasSuffix(".png") { fail("ожидается PNG: \(a)", code: 64) }
}
for a in args {
  frames.append(analyze(a))
}
let enc = JSONEncoder()
enc.outputFormatting = [.sortedKeys]
guard let data = try? enc.encode(frames) else { fail("JSON не собран", code: 3) }
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
