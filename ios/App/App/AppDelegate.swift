import UIKit
import Capacitor
import ARKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let bridgeViewController = window?.rootViewController as? CAPBridgeViewController {
            bridgeViewController.bridge?.registerPluginInstance(LidarDepthPlugin())
        }
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

@objc(LidarDepthPlugin)
public class LidarDepthPlugin: CAPPlugin, ARSessionDelegate {
    private let session = ARSession()
    private var running = false

    @objc func start(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported,
              ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
            call.reject("LiDAR scene depth is unavailable on this device")
            return
        }
        let configuration = ARWorldTrackingConfiguration()
        configuration.frameSemantics = [.sceneDepth]
        session.delegate = self
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        running = true
        call.resolve(["available": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        session.pause()
        running = false
        call.resolve()
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let depth = frame.sceneDepth?.depthMap else { return }
        let width = CVPixelBufferGetWidth(depth)
        let height = CVPixelBufferGetHeight(depth)
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depth, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depth)?.assumingMemoryBound(to: Float32.self) else { return }
        var points: [[String: Double]] = []
        let step = max(2, min(width, height) / 48)
        for y in stride(from: 0, to: height, by: step) {
            for x in stride(from: 0, to: width, by: step) {
                let z = Double(base[y * width + x])
                if z.isFinite && z > 0.05 && z < 12 {
                    points.append(["x": Double(x) / Double(width), "y": Double(y) / Double(height), "z": z])
                }
            }
        }
        notifyListeners("depthUpdate", data: ["width": width, "height": height, "points": points])
    }
}
