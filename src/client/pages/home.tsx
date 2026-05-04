import { Link } from "../router";

const tiles: { to: string; title: string; subtitle: string }[] = [
  { to: "/invoices", title: "Invoices", subtitle: "Drafts, issued, paid" },
  { to: "/customers", title: "Customers", subtitle: "Who you invoice" },
  { to: "/suppliers", title: "Suppliers", subtitle: "Who invoices you" },
  { to: "/products", title: "Products & Services", subtitle: "Catalogue" },
  { to: "/accounts", title: "Chart of Accounts", subtitle: "RGS-mapped Dutch reference chart" },
];

export function HomePage() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Welcome</h2>
      <p className="text-sm text-gray-500 mb-6">EU-compliance-first, agent-native bookkeeping.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="block p-4 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50"
          >
            <div className="text-sm font-medium text-gray-800">{t.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t.subtitle}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
