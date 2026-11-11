Pod::Spec.new do |s|
  s.name           = 'QuickSos'
  s.version        = '1.0.0'
  s.summary        = 'SOS rápido: disparo nativo do alerta (Siri / App Intents)'
  s.description    = 'Módulo local: guarda a sessão no Keychain e dispara o alerta direto na API, mesmo com o app fechado.'
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
