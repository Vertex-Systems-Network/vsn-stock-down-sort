import type {
  ButtonHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from "react";

type BrandTone = "neutral" | "info" | "success" | "warning" | "critical";
type BrandButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

export function PageShell({
  heading,
  description,
  children,
}: PropsWithChildren<{
  heading?: string;
  description?: string;
}>) {
  return (
    <div className="vsn-page-wide">
      {heading ? (
        <header className="vsn-route-heading">
          <div>
            <div className="vsn-eyebrow">VSN Stock Down Sort</div>
            <h1>{heading}</h1>
            {description ? (
              <p className="vsn-route-description">{description}</p>
            ) : null}
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}

export function BrandBadge({
  tone = "neutral",
  children,
}: PropsWithChildren<{ tone?: BrandTone }>) {
  return (
    <span className={["vsn-brand-badge", tone].join(" ")}>{children}</span>
  );
}

export function BrandNotice({
  tone = "info",
  heading,
  children,
  role,
}: PropsWithChildren<{
  tone?: BrandTone;
  heading?: string;
  role?: "alert" | "status";
}>) {
  return (
    <div
      className={["vsn-brand-notice", tone].join(" ")}
      role={role ?? (tone === "critical" ? "alert" : "status")}
    >
      {heading ? <strong>{heading}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function BrandButton({
  variant = "secondary",
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BrandButtonVariant;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={[
        "vsn-button",
        variant === "primary" ? "primary" : "",
        variant === "danger" ? "danger" : "",
        variant === "tertiary" ? "tertiary" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="vsn-inline-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function BrandButtonRow({
  children,
}: PropsWithChildren<Record<string, never>>) {
  return <div className="vsn-button-row">{children}</div>;
}
