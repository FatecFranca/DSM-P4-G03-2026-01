Pod::Spec.new do |s|
  s.name           = 'DiscreetIcon'
  s.version        = '1.0.0'
  s.summary        = 'Troca do ícone do app e tela de privacidade'
  s.description    = 'Módulo local: ícones alternativos (iOS) e cobertura do app no seletor de apps.'
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
