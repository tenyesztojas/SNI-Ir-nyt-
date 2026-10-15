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
          const initializeLayout = function() {
          if (location.protocol !== 'https:' || location.hostname !== 'www.vedettsarok.hu' || !location.pathname.startsWith('/vedett-utvonal')) return;
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
              max-height: 30dvh !important;
              overflow-y: auto !important;
              overscroll-behavior: contain !important;
              -webkit-overflow-scrolling: touch !important;
            }

            div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20 * {
              min-width: 0 !important;
              overflow-wrap: anywhere !important;
            }
            div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20 {
              overflow-x: hidden !important;
              padding: 12px !important;
              font-size: 14px !important;
              line-height: 1.35 !important;
            }

            div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20 * {
              max-width: 100% !important;
              white-space: normal !important;
              overflow-wrap: anywhere !important;
              word-break: normal !important;
              box-sizing: border-box !important;
            }

            div.fixed.inset-0.z-50.bg-black div.absolute.bottom-3.left-3.z-10 {
              max-width: min(170px, calc(100vw - 24px)) !important;
              padding: 10px !important;
              box-sizing: border-box !important;
              overflow-wrap: anywhere !important;
            }

            div.fixed.inset-0.z-50.bg-black div.absolute.bottom-3.left-3.z-10 * {
              max-width: 100% !important;
              overflow-wrap: anywhere !important;
            }
            div.fixed.right-3.flex.flex-col.items-end {
              bottom: calc(env(safe-area-inset-bottom, 0px) + 12px) !important;
              left: auto !important;
              right: 12px !important;
              width: min(210px, calc(100vw - 24px)) !important;
              max-width: calc(100vw - 24px) !important;
              align-items: stretch !important;
              flex-direction: column !important;
              flex-wrap: nowrap !important;
              box-sizing: border-box !important;
              gap: 6px !important;
            }

            div.fixed.right-3.flex.flex-col.items-end > button {
              width: 100% !important;
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              white-space: normal !important;
              word-break: normal !important;
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

            const restButtons = document.querySelector('div.fixed.right-3.flex.flex-col.items-end');
            const etaCard = map.querySelector('div.absolute.bottom-3.left-3.z-10');

            if (restButtons) {
              const defaultBottom = Math.ceil(
                (parseFloat(getComputedStyle(document.documentElement)
                  .getPropertyValue('--sat-bottom')) || 0) + 12
              );

              const nextBottom = defaultBottom + 'px';
              if (restButtons.style.getPropertyValue('bottom') !== nextBottom) {
                restButtons.style.setProperty('bottom', nextBottom, 'important');
              }

              if (etaCard) {
                const restRect = restButtons.getBoundingClientRect();
                const etaRect = etaCard.getBoundingClientRect();

                const horizontalOverlap = (
                  restRect.left < etaRect.right + 8 &&
                  restRect.right > etaRect.left - 8
                );

                const baseBottom = Math.max(
                  12,
                  Math.ceil(window.innerHeight - etaRect.bottom + 12)
                );

                const wouldOverlapVertically = (
                  window.innerHeight - baseBottom - restRect.height <
                  etaRect.bottom &&
                  window.innerHeight - baseBottom > etaRect.top
                );

                if (horizontalOverlap && wouldOverlapVertically) {
                  const requiredBottom = Math.ceil(
                    window.innerHeight - etaRect.top + 12
                  ) + 'px';

                  if (restButtons.style.getPropertyValue('bottom') !== requiredBottom) {
                    restButtons.style.setProperty('bottom', requiredBottom, 'important');
                  }
                }
              }
            }

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

            const bottomElements = [restButtons, etaCard].filter(function(element) {
              return element && element.getClientRects().length > 0;
            });

            const bottomLimit = bottomElements.length
              ? Math.min.apply(null, bottomElements.map(function(element) {
                  return element.getBoundingClientRect().top;
                }))
              : window.innerHeight;

            const cardTop = card.getBoundingClientRect().top;
            const availableHeight = Math.floor(bottomLimit - cardTop - 12);
            const viewportLimit = Math.floor(window.innerHeight * 0.30);
            const nextMaxHeight = Math.max(
              0,
              Math.min(viewportLimit, availableHeight)
            ) + 'px';

            if (card.style.getPropertyValue('max-height') !== nextMaxHeight) {
              card.style.setProperty('max-height', nextMaxHeight, 'important');
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

          const resizeObserver = new ResizeObserver(scheduleSync);
          const observedElements = new WeakSet();

          const observeLayoutElements = function() {
            const selectors = [
              'div.fixed.inset-0.z-50.bg-black',
              'div.fixed.inset-0.z-50.bg-black div.absolute.left-2.right-2.top-2.z-10',
              'div.fixed.inset-0.z-50.bg-black div[role="status"].absolute.right-14.z-20',
              'div.fixed.inset-0.z-50.bg-black div.absolute.bottom-3.left-3.z-10',
              'div.fixed.right-3.flex.flex-col.items-end'
            ];

            selectors.forEach(function(selector) {
              document.querySelectorAll(selector).forEach(function(element) {
                if (!observedElements.has(element)) {
                  observedElements.add(element);
                  resizeObserver.observe(element);
                }
              });
            });
          };

          const observer = new MutationObserver(function() {
            observeLayoutElements();
            scheduleSync();
          });

          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'hidden']
          });

          window.addEventListener('resize', scheduleSync);
          observeLayoutElements();
          scheduleSync();
          };

          initializeLayout();
          document.addEventListener('readystatechange', initializeLayout);
          window.addEventListener('pageshow', initializeLayout);
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