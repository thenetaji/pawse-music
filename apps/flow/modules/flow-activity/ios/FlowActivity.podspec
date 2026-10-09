Pod::Spec.new do |s|
  s.name           = 'FlowActivity'
  s.version        = '0.1.0'
  s.summary        = 'Starts and updates the Flow Live Activity.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'thenetaji'
  s.homepage       = 'https://github.com/thenetaji/flow-music'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/thenetaji/flow-music.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
