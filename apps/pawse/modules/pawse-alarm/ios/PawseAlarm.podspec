Pod::Spec.new do |s|
  s.name           = 'PawseAlarm'
  s.version        = '0.1.0'
  s.summary        = 'Wake-up alarms through AlarmKit.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'thenetaji'
  s.homepage       = 'https://github.com/thenetaji/pawse-music'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/thenetaji/pawse-music.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.resources = 'pawse_chime.wav'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
