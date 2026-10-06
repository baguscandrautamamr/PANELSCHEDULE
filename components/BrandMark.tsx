/** Logo aplikasi: ikon petir di kotak gradien + nama aplikasi. */
export function BrandIcon({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-600/30 ring-1 ring-white/20 ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="currentColor">
        <path d="M13.2 2.3a.75.75 0 0 1 .53.86L12.4 9.5h6.1a.75.75 0 0 1 .58 1.23l-8.25 10a.75.75 0 0 1-1.31-.64L10.85 14H4.75a.75.75 0 0 1-.58-1.23l8.25-10a.75.75 0 0 1 .78-.47Z" />
      </svg>
    </span>
  );
}

export default function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandIcon />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-slate-900">
          Panel Schedule
        </span>
        {subtitle && (
          <span className="block text-[11px] font-medium text-slate-500">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
