import UIKit
import Capacitor

final class VedettBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // iOS: prevent automatic WKWebView content shifting.
        webView?.scrollView.contentInsetAdjustmentBehavior = .never

        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}