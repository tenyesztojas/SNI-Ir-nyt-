"use client";

export default function RatingInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-sni-text">{label}</label>
      <div className="mt-1.5 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`h-10 w-10 rounded-xl2 border text-sm font-semibold transition-all duration-200 ${
              value === n
                ? "border-transparent bg-gradient-to-br from-sni-brand-teal to-sni-brand-navy text-white shadow-soft"
                : "border-gray-300 bg-white text-sni-text hover:border-sni-brand-teal/40 hover:bg-sni-brand-teal/10"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-sni-warn">{error}</p>}
    </div>
  );
}
