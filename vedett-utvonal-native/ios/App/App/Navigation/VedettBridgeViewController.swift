import UIKit
import Capacitor

final class VedettBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let webView = webView else { return }

        let container = UIView(frame: view.bounds)
        container.backgroundColor = UIColor(red: 243.0/255.0, green: 244.0/255.0, blue: 246.0/255.0, alpha: 1)

        view = container
        container.addSubview(webView)

        webView.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor)
        ])
    }
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // iOS: prevent automatic WKWebView content shifting.
        webView?.scrollView.contentInsetAdjustmentBehavior = .automatic

        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}