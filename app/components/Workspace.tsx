import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useFetchers,
  useLocation,
  useNavigation,
} from "react-router";

type WorkspaceProps = {
  children: React.ReactNode;
  appName: string;
  environment: string;
};

type IconName =
  | "collections"
  | "visibility"
  | "contexts"
  | "analytics"
  | "automation"
  | "alerts"
  | "integrations"
  | "plans"
  | "documentation"
  | "support"
  | "menu"
  | "collapse";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const body: Record<IconName, React.ReactNode> = {
    collections: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    visibility: (
      <>
        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    contexts: (
      <>
        <circle cx="6" cy="7" r="2" />
        <circle cx="18" cy="7" r="2" />
        <circle cx="12" cy="17" r="2" />
        <path d="M7.5 8.5 10.5 15M16.5 8.5 13.5 15M8 7h8" />
      </>
    ),
    analytics: (
      <>
        <path d="M5 19V11M12 19V5M19 19v-8" />
      </>
    ),
    automation: (
      <>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    alerts: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
        <path d="M10 19h4" />
      </>
    ),
    integrations: (
      <>
        <path d="M8 12h8M12 8v8" />
        <rect x="3" y="3" width="18" height="18" rx="4" />
      </>
    ),
    plans: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M7 9h10M7 13h6" />
      </>
    ),
    documentation: (
      <>
        <path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" />
        <path d="M8 8h6M8 12h6M8 16h4" />
        <path d="M17 7.5h2a2 2 0 0 1 2 2V20h-4" />
      </>
    ),
    support: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-.8.8-1.9 1.2-1.9 2.4M12 17h.01" />
      </>
    ),
    menu: (
      <>
        <path d="M5 7h14M5 12h14M5 17h14" />
      </>
    ),
    collapse: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v16M15 9l-3 3 3 3" />
      </>
    ),
  };

  return <svg {...common}>{body[name]}</svg>;
}

export function Workspace({
  children,
  appName,
  environment,
}: WorkspaceProps) {
  const { search, pathname } = useLocation();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const measure = () => {
      const height = headerRef.current?.getBoundingClientRect().height;
      if (height) {
        workspaceRef.current?.style.setProperty(
          "--vsn-header-height",
          `${height}px`,
        );
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const busy =
    navigation.state !== "idle" ||
    fetchers.some((fetcher) => fetcher.state !== "idle");
  const saving =
    navigation.state === "submitting" ||
    fetchers.some((fetcher) => fetcher.state === "submitting");

  const routes = useMemo<
    Array<{ to: string; label: string; icon: IconName }>
  >(
    () => [
      { to: "/app", label: "Collections", icon: "collections" },
      { to: "/app/visibility", label: "Visibility", icon: "visibility" },
      { to: "/app/contexts", label: "Commerce contexts", icon: "contexts" },
      { to: "/app/analytics", label: "Analytics", icon: "analytics" },
      { to: "/app/automation", label: "Automation", icon: "automation" },
      { to: "/app/alerts", label: "Alerts", icon: "alerts" },
      { to: "/app/integrations", label: "Integrations", icon: "integrations" },
      { to: "/app/plans", label: "Plans", icon: "plans" },
      {
        to: "/app/documentation",
        label: "Documentation",
        icon: "documentation",
      },
      { to: "/app/support", label: "Help center", icon: "support" },
    ],
    [],
  );

  const environmentLabel =
    environment === "production"
      ? ""
      : environment === "staging"
        ? "Staging"
        : "Dev";

  return (
    <div
      ref={workspaceRef}
      className={[
        "vsn-workspace",
        busy ? "is-busy" : "",
        collapsed ? "is-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header ref={headerRef} className="vsn-header">
        <Link
          className="vsn-brand"
          to={{ pathname: "/app", search }}
          aria-label={`${appName} home`}
        >
          <span className="vsn-mark" aria-hidden="true">
            V
          </span>
          <span>{appName}</span>
          {environmentLabel ? (
            <span className="vsn-version">{environmentLabel}</span>
          ) : null}
        </Link>
        <Link
          className="vsn-help-link"
          to={{ pathname: "/app/support", search }}
        >
          Need a hand? <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <aside className={`vsn-sidebar${menuOpen ? " menu-open" : ""}`}>
        <button
          className="vsn-sidebar-collapse"
          type="button"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon name="collapse" />
          <span className="vsn-nav-label">
            {collapsed ? "Expand menu" : "Collapse menu"}
          </span>
          <span className="vsn-nav-tooltip" role="tooltip">
            {collapsed ? "Expand navigation" : "Collapse navigation"}
          </span>
        </button>

        <button
          className="vsn-sidebar-toggle"
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Icon name="menu" />
          Workspace menu
        </button>

        <nav className="vsn-navigation" aria-label="Workspace">
          {routes.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={{ pathname: to, search }}
              end={to === "/app"}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                isActive ? "vsn-nav-link active" : "vsn-nav-link"
              }
            >
              <span className="vsn-nav-icon">
                <Icon name={icon} />
              </span>
              <span className="vsn-nav-label">{label}</span>
              <span className="vsn-nav-tooltip" role="tooltip">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="vsn-content">
        {busy ? (
          <div className="vsn-workspace-progress" role="status" aria-live="polite">
            <span className="vsn-spinner" aria-hidden="true" />
            {saving ? "Saving changes…" : "Loading workspace…"}
          </div>
        ) : null}

        <main id="workspace-content" aria-busy={busy}>
          {children}
        </main>

        <footer className="vsn-footer">
          <span>{appName}</span>
          <Link to={{ pathname: "/app/support", search }}>
            Help & troubleshooting
          </Link>
        </footer>
      </div>
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="vsn-intro">
      <div>
        <p className="vsn-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? (
          <p className="vsn-intro-description">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
