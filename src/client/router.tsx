import { useEffect, useState } from "react";

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    window.addEventListener("clw:navigate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("clw:navigate", onPop);
    };
  }, []);
  return path;
}

export function navigate(to: string) {
  if (window.location.pathname === to) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event("clw:navigate"));
}

export function Link({
  to,
  children,
  className,
  activeClassName,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const path = usePath();
  const active = path === to || (to !== "/" && path.startsWith(to));
  return (
    <a
      href={to}
      className={`${className ?? ""} ${active ? activeClassName ?? "" : ""}`.trim()}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
