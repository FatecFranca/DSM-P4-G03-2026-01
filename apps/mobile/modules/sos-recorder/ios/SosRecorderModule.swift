import AVFoundation
import ExpoModulesCore

/// Áudio do SOS no iOS. Com a tela bloqueada o iOS não deixa reabrir o microfone
/// depois de soltá-lo, então trocar de gravador a cada trecho para a gravação.
/// Aqui o microfone fica aberto o tempo todo (AVAudioEngine) e só o *arquivo*
/// muda a cada `chunkMs`: cada trecho fechado vira um evento `onChunk` para o JS
/// enfileirar e enviar — inclusive em segundo plano (modo de fundo "audio").
public final class SosRecorderModule: Module {
  private let engine = AVAudioEngine()
  /// Fila serial: escrita, troca de arquivo e parada nunca correm em paralelo.
  private let queue = DispatchQueue(label: "protecther.sos-recorder")
  private var running = false
  private var chunkFrames: AVAudioFramePosition = 0
  private var file: AVAudioFile?
  private var fileURL: URL?
  private var fileStartedAt = Date()
  private var fileFrames: AVAudioFramePosition = 0
  private var sampleRate: Double = 44_100
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("SosRecorder")

    Events("onChunk", "onError")

    Function("isRecording") { () -> Bool in
      self.queue.sync { self.running }
    }

    AsyncFunction("start") { (chunkMs: Int) in
      try self.queue.sync {
        if self.running { return }
        try self.startLocked(chunkMs: chunkMs)
      }
    }

    /// Fecha o trecho atual (emite `onChunk`) e solta o microfone.
    AsyncFunction("stop") {
      self.queue.sync { self.stopLocked() }
    }

    OnDestroy {
      self.queue.sync { self.stopLocked() }
    }
  }

  // MARK: - Gravação (sempre na `queue`)

  private func startLocked(chunkMs: Int) throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord, mode: .default,
      options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker])
    try session.setActive(true)

    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw Exception(name: "NoMicrophone", description: "Microfone indisponível")
    }
    sampleRate = format.sampleRate
    chunkFrames = AVAudioFramePosition(Double(max(chunkMs, 1_000)) / 1_000 * format.sampleRate)
    try openFileLocked(format: format)

    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4_096, format: format) { [weak self] buffer, _ in
      guard let copy = Self.copy(buffer) else { return }
      self?.queue.async { self?.writeLocked(copy) }
    }
    engine.prepare()
    try engine.start()
    running = true
    observeSessionLocked()
  }

  private func stopLocked() {
    guard running else { return }
    running = false
    removeObservers()
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    closeFileLocked()
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  private func writeLocked(_ buffer: AVAudioPCMBuffer) {
    guard running, let file else { return }
    do {
      try file.write(from: buffer)
      fileFrames += AVAudioFramePosition(buffer.frameLength)
    } catch {
      sendEvent("onError", ["message": "write: \(error.localizedDescription)"])
    }
    if fileFrames >= chunkFrames {
      closeFileLocked()
      do {
        try openFileLocked(format: buffer.format)
      } catch {
        sendEvent("onError", ["message": "open: \(error.localizedDescription)"])
      }
    }
  }

  private func openFileLocked(format: AVAudioFormat) throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sos-audio-live", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent("\(UUID().uuidString).m4a")
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: format.channelCount,
      AVEncoderBitRateKey: 48_000 * Int(format.channelCount),
    ]
    file = try AVAudioFile(
      forWriting: url, settings: settings,
      commonFormat: format.commonFormat, interleaved: format.isInterleaved)
    fileURL = url
    fileFrames = 0
    fileStartedAt = Date()
  }

  /// Soltar a referência finaliza o M4A (escreve o cabeçalho `moov`).
  private func closeFileLocked() {
    guard let url = fileURL else { return }
    let frames = fileFrames
    let startedAt = fileStartedAt
    file = nil
    fileURL = nil
    fileFrames = 0
    guard frames > 0 else {
      try? FileManager.default.removeItem(at: url)
      return
    }
    sendEvent("onChunk", [
      "uri": url.absoluteString,
      "startedAt": startedAt.timeIntervalSince1970 * 1_000,
      "durationMs": Int(Double(frames) / sampleRate * 1_000),
    ])
  }

  // MARK: - Interrupções (ligação, Siri, troca de rota)

  private func observeSessionLocked() {
    removeObservers()
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
    ) { [weak self] note in
      guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
      self?.queue.async { self?.restartEngineLocked() }
    })
    observers.append(center.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.restartEngineLocked() }
    })
  }

  private func restartEngineLocked() {
    guard running else { return }
    let input = engine.inputNode
    input.removeTap(onBus: 0)
    engine.stop()
    closeFileLocked()
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      let format = input.outputFormat(forBus: 0)
      sampleRate = format.sampleRate
      try openFileLocked(format: format)
      input.installTap(onBus: 0, bufferSize: 4_096, format: format) { [weak self] buffer, _ in
        guard let copy = Self.copy(buffer) else { return }
        self?.queue.async { self?.writeLocked(copy) }
      }
      engine.prepare()
      try engine.start()
    } catch {
      sendEvent("onError", ["message": "restart: \(error.localizedDescription)"])
    }
  }

  /// O engine reaproveita o buffer do tap: copia antes de mandar para a fila.
  private static func copy(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let out = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else {
      return nil
    }
    out.frameLength = buffer.frameLength
    let src = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffer.audioBufferList))
    let dst = UnsafeMutableAudioBufferListPointer(out.mutableAudioBufferList)
    for (s, d) in zip(src, dst) {
      guard let sData = s.mData, let dData = d.mData else { continue }
      memcpy(dData, sData, Int(min(s.mDataByteSize, d.mDataByteSize)))
    }
    return out
  }

  private func removeObservers() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
  }
}
