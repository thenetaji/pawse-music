#if canImport(PawseAlarm)
import AppIntents
internal import PawseAlarm

// The alarm's Play music intent lives in the PawseAlarm pod; iOS only sees it through the app.
@available(iOS 17.4, *)
struct PawseAppIntentsPackage: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [PawseAlarmPackage.self] }
}
#endif
