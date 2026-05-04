import { AccountsPage } from "./pages/accounts";
import { HomePage } from "./pages/home";
import { InvoiceEditorPage } from "./pages/invoice-editor";
import { InvoicesPage } from "./pages/invoices";
import { PartiesPage } from "./pages/parties";
import { ProductsPage } from "./pages/products";
import { SettingsPage } from "./pages/settings";
import { Link, usePath } from "./router";

const NAV: { to: string; label: string }[] = [
  { to: "/invoices", label: "Invoices" },
  { to: "/customers", label: "Customers" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/products", label: "Products" },
  { to: "/accounts", label: "Accounts" },
];

export function App() {
  const path = usePath();

  return (
    <div className="max-w-3xl mx-auto px-4 pb-20">
      <header className="flex items-baseline gap-6 mt-8 mb-8 pb-4 border-b border-gray-100 flex-wrap">
        <Link to="/" className="text-xl font-semibold text-gray-900 hover:no-underline">
          open-books
        </Link>
        <nav className="flex gap-4 text-sm">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-gray-500 hover:text-gray-900" activeClassName="!text-gray-900 font-medium">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link to="/settings" className="ml-auto text-sm text-gray-500 hover:text-gray-900" activeClassName="!text-gray-900 font-medium">
          Settings
        </Link>
      </header>
      <main>{renderRoute(path)}</main>
    </div>
  );
}

function renderRoute(path: string) {
  if (path === "/" || path === "") return <HomePage />;
  const invoiceMatch = path.match(/^\/invoices\/(\d+)$/);
  if (invoiceMatch) return <InvoiceEditorPage id={Number(invoiceMatch[1])} />;
  if (path.startsWith("/invoices")) return <InvoicesPage />;
  if (path.startsWith("/customers")) return <PartiesPage kind="customer" />;
  if (path.startsWith("/suppliers")) return <PartiesPage kind="supplier" />;
  if (path.startsWith("/products")) return <ProductsPage />;
  if (path.startsWith("/accounts")) return <AccountsPage />;
  if (path.startsWith("/settings")) return <SettingsPage />;
  return <NotFound path={path} />;
}

function NotFound({ path }: { path: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm text-gray-500">No page at <span className="font-mono">{path}</span></p>
      <Link to="/" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Back home</Link>
    </div>
  );
}
