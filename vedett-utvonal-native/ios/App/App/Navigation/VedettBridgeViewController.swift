import UIKit
import WebKit
import Capacitor

final class VedettBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // iOS: prevent automatic WKWebView content shifting.
        webView?.scrollView.contentInsetAdjustmentBehavior = .automatic

        // iOS-only layout correction for the fullscreen route controls.
        let safeAreaScript = """
        (function() {
          if (!location.pathname.startsWith('/vedett-utvonal')) return;
          const style = document.createElement('style');
          style.id = 'vedett-ios-safe-area';
          style.textContent = `
            html, body {
              max-width: 100% !important;
              overflow-x: clip !important;
            }

            div.fixed.inset-0.z-50.bg-black div.absolute.left-2.right-2.top-2.z-10 {
              top: max(56px, calc(env(safe-area-inset-top, 0px) + 8px)) !important;
            }

            div.fixed.right-3.flex.flex-col.items-end {
              bottom: max(46px, calc(env(safe-area-inset-bottom, 0px) + 12px)) !important;
              left: auto !important;
              right: 12px !important;
              width: max-content !important;
              max-width: calc(100vw - 24px) !important;
              box-sizing: border-box !important;
            }

            div.fixed.right-3.flex.flex-col.items-end > button {
              max-width: 100% !important;
              box-sizing: border-box !important;
              white-space: normal !important;
              text-align: center !important;
              justify-content: center !important;
              overflow-wrap: anywhere !important;
            }
          `;
          document.head.appendChild(style);

          const syncCard = function() {
            const map = document.querySelector('div.fixed.inset-0.z-50.bg-black');
            if (!map) return;

            const bar = map.querySelector('div.absolute.left-2.right-2.top-2.z-10');
            const card = map.querySelector('div[role="status"].absolute.right-14.z-20');
            if (!bar || !card) return;

            const barBottom = bar.getBoundingClientRect().bottom;
            const mapTop = map.getBoundingClientRect().top;
            const minTop = card.classList.contains('top-[11rem]') ? 176 : 0;
            const top = Math.max(minTop, barBottom - mapTop + 10);

            card.style.setProperty('top', top + 'px', 'important');
          };

          const observer = new MutationObserver(syncCard);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true
          });

          window.addEventListener('resize', syncCard);
          requestAnimationFrame(syncCard);
        })();
        """
        let script = WKUserScript(
            source: safeAreaScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        webView?.configuration.userContentController.addUserScript(script)

        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}