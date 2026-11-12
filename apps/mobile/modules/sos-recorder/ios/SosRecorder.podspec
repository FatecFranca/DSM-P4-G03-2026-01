Pod::Spec.new do |s|
  s.name           = 'SosRecorder'
  s.version        = '1.0.0'
  s.summary        = 'Gravação contínua do áudio do SOS em trechos (iOS)'
  s.description    = 'Módulo local: mantém o microfone aberto (AVAudioEngine) e corta trechos AAC sem soltá-lo, para continuar com a tela bloqueada.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
