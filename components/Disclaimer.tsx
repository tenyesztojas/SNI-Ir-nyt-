import { Info } from "lucide-react";

export default function Disclaimer() {
  return (
    <div className="flex items-start gap-3 rounded-xl2 bg-sni-beige px-4 py-3 text-sm text-sni-text">
      <Info size={18} className="mt-0.5 flex-shrink-0 text-sni-brand-blue" />
      <p>
        A leírások közösségi tapasztalatok alapján készültek, nem orvosi ajánlások. Minden
        gyermek és felnőtt más — indulás előtt érdemes rákérdezni az aktuális körülményekre.
      </p>
    </div>
  );
}
