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

          const initializeLayout = function() {
          if (!document.documentElement) return;
          if (document.getElementById('vedett-ios-safe-area')) return;
          const style = document.createElement('style');
          style.id = 'vedett-ios-safe-area';
          style.textContent = `
            html, body {
              width: 100% !important;
              max-width: 100% !important;
              overflow-x: clip !important;
            }

            body {
              position: relative !important;
            }

            body > div,
            main,
            form {
              max-width: 100% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
            }

            input,
            select,
            textarea {
              max-width: 100% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
            }

            div.fixed.inset-0.z-50.bg-black div.absolute.left-2.right-2.top-2.z-10 {
              top: max(56px, calc(env(safe-area-inset-top, 0px) + 8px)) !important;
              left: 8px !important;
              right: 8px !important;
              width: auto !important;
              max-width: calc(100% - 16px) !important;
              box-sizing: border-box !important;
              flex-wrap: wrap !important;
              gap: 6px !important;
            }

            div.fixed.inset-0.z-50.bg-black div.absolute.left-2.right-2.top-2.z-10 > button {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              white-space: normal !important;
              overflow-wrap: anywhere !important;
            }

            div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20 {
              left: 12px !important;
              right: 12px !important;
              width: auto !important;
              max-width: calc(100% - 24px) !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
              overflow-wrap: anywhere !important;
            }

            div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20 * {
              min-width: 0 !important;
              overflow-wrap: anywhere !important;
            }
            div.fixed.right-3.flex.flex-col.items-end {
              bottom: max(46px, calc(env(safe-area-inset-bottom, 0px) + 12px)) !important;
              left: auto !important;
              right: 12px !important;
              width: min(280px, calc(100vw - 24px)) !important;
              max-width: calc(100vw - 24px) !important;
              align-items: stretch !important;
              flex-direction: column !important;
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
          (document.head || document.documentElement).appendChild(style);

          const syncCard = function() {
            const map = document.querySelector('div.fixed.inset-0.z-50.bg-black');
            if (!map) return;

            const bar = map.querySelector('div.absolute.left-2.right-2.top-2.z-10');
            const card = map.querySelector('div[role="status"].absolute.right-14.z-20');
            if (!bar || !card) return;

            const barBottom = bar.getBoundingClientRect().bottom;
            const mapTop = map.getBoundingClientRect().top;
            const minTop = card.classList.contains('top-[11rem]') ? 176 : 0;
            const top = Math.ceil(Math.max(minTop, barBottom - mapTop + 10));
            const nextTop = top + 'px';

            if (
              card.style.getPropertyValue('top') !== nextTop ||
              card.style.getPropertyPriority('top') !== 'important'
            ) {
              card.style.setProperty('top', nextTop, 'important');
            }
          };

          let syncPending = false;

          const scheduleSync = function() {
            if (syncPending) return;
            syncPending = true;

            requestAnimationFrame(function() {
              syncPending = false;
              syncCard();
            });
          };

          const observer = new MutationObserver(scheduleSync);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true
          });

          window.addEventListener('resize', scheduleSync);
          scheduleSync();
          };

          if (document.documentElement) {
            initializeLayout();
          } else {
            document.addEventListener('readystatechange', initializeLayout);
          }
        })();
        """
        let script = WKUserScript(
            source: safeAreaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView?.configuration.userContentController.addUserScript(script)
        webView?.evaluateJavaScript(safeAreaScript, completionHandler: nil)

        bridge?.registerPluginInstance(VedettNavigationPlugin())
    }
}