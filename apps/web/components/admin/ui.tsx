import type { ComponentProps, ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-cream bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-600">
      {label}
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`rounded border border-cream px-2 py-1.5 text-sm text-ink ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`rounded border border-cream px-2 py-1.5 text-sm text-ink ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`rounded border border-cream px-2 py-1.5 text-sm text-ink ${props.className ?? ""}`} />;
}

export function Button({ variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-maroon text-white hover:bg-maroon-dark",
    secondary: "border border-cream bg-white hover:bg-stone-100",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return <button {...props} className={`rounded px-3 py-1.5 text-sm font-medium ${styles} ${props.className ?? ""}`} />;
}

/** A one-click on/off switch that posts to a server action. */
export function ToggleForm({
  action,
  id,
  on,
  labelOn = "On",
  labelOff = "Off",
  disabled,
}: {
  action: (form: FormData) => Promise<void>;
  id: string;
  on: boolean;
  labelOn?: string;
  labelOff?: string;
  disabled?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="value" value={on ? "false" : "true"} />
      <button
        disabled={disabled}
        aria-pressed={on}
        className={`min-w-14 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
          on ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
        }`}
      >
        {on ? labelOn : labelOff}
      </button>
    </form>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-cream text-xs uppercase text-stone-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-2 py-2 align-middle ${className}`}>{children}</td>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const styles = {
    neutral: "bg-stone-100 text-stone-700",
    good: "bg-green-100 text-green-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-800",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
