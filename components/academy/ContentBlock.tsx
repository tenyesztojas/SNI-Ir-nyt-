import type { AcademyContentBlock } from "@/lib/academy/types";

interface Props {
  block: AcademyContentBlock;
}

export default function ContentBlock({ block }: Props) {
  const c = block.content_json as Record<string, unknown>;

  switch (block.block_type) {
    case "paragraph":
      return (
        <p className="text-sni-text leading-relaxed text-[15px]">
          {c.text as string}
        </p>
      );

    case "heading":
      return (
        <h3 className="text-base font-bold text-sni-brand-navy mt-6 mb-2">
          {c.text as string}
        </h3>
      );

    case "bullet_list": {
      const items = (c.items as string[]) ?? [];
      return (
        <ul className="list-none space-y-1.5 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] text-sni-text">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sni-brand-teal" />
              {item}
            </li>
          ))}
        </ul>
      );
    }

    case "numbered_list": {
      const items = (c.items as string[]) ?? [];
      return (
        <ol className="space-y-1.5 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] text-sni-text">
              <span className="mt-0.5 shrink-0 font-bold text-sni-brand-teal text-sm">{i + 1}.</span>
              {item}
            </li>
          ))}
        </ol>
      );
    }

    case "quote":
      return (
        <blockquote className="border-l-4 border-sni-brand-teal bg-gray-50 rounded-r-xl px-5 py-3 italic text-[15px] text-gray-700">
          {c.text as string}
        </blockquote>
      );

    case "info_callout":
      return (
        <aside className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          {typeof c.title === "string" && <p className="font-bold text-blue-800 mb-1 text-sm">{c.title}</p>}
          <p className="text-blue-700 text-[14px]">{c.text as string}</p>
        </aside>
      );

    case "warning_callout":
      return (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          {typeof c.title === "string" && <p className="font-bold text-amber-800 mb-1 text-sm">⚠️ {c.title}</p>}
          <p className="text-amber-700 text-[14px]">{c.text as string}</p>
        </aside>
      );

    case "success_callout":
      return (
        <aside className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          {typeof c.title === "string" && <p className="font-bold text-emerald-800 mb-1 text-sm">✓ {c.title}</p>}
          <p className="text-emerald-700 text-[14px]">{c.text as string}</p>
        </aside>
      );

    case "scenario":
      return (
        <aside className="rounded-xl border-2 border-sni-brand-teal/30 bg-white px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-sni-brand-teal mb-2">Esetpélda</p>
          {typeof c.title === "string" && <p className="font-semibold text-sni-text mb-1">{c.title}</p>}
          <p className="text-[14px] text-gray-700">{c.text as string}</p>
        </aside>
      );

    case "image":
      return c.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.url as string}
          alt={(c.alt as string) ?? ""}
          className="rounded-xl w-full object-cover max-h-80"
        />
      ) : null;

    case "video":
      return c.url ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe
            src={c.url as string}
            title={(c.title as string) ?? "Videó"}
            allow="fullscreen"
            className="w-full h-full"
          />
        </div>
      ) : null;

    case "table": {
      const headers = (c.headers as string[]) ?? [];
      const rows = (c.rows as string[][]) ?? [];
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {headers.map((h, i) => (
                  <th key={i} className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "" : "bg-gray-50/50"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-200 px-3 py-2 text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "divider":
      return <hr className="border-gray-200 my-2" />;

    default:
      return null;
  }
}
