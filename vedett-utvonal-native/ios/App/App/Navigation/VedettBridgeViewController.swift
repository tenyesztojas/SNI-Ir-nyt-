import UIKit
import Capacitor

final class VedettBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}