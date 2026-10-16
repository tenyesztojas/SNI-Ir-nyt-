import UIKit
import WebKit
import Capacitor

final class VedettBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // iOS: a WKWebView tartalma a biztonsági területen belül marad (a
        // rendszer automatikusan beállítja a görgetőnézet tartalom-insetjét).
        // A teljes oldal elrendezése erre épül; a navigációs nézet (ios-v2) a
        // fennmaradó különbséget a VedettNavigation.getSafeAreaInsets-ből kapja.
        webView?.scrollView.contentInsetAdjustmentBehavior = .automatic

        // A korábbi, CSS/JavaScript-injektálással végzett elrendezés-javítás
        // (ios-rest-controls-v1…v11) eltávolítva: a teljes képernyős navigáció
        // elrendezését a webes ios-v2 felület kezeli, amely csak a
        // VedettNavigation.getSafeAreaInsets natív metódus megléte esetén aktív.

        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}