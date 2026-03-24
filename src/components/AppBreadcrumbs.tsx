import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  quotations: "Quotations",
  create: "+",
  edit: "Edit",
  vendors: "Vendors",
  clients: "Clients",
  countries: "Countries",
  "master-list": "Master List",
  upload: "Upload CSV",
};

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function getBreadcrumbItems(pathname: string): { path: string; label: string }[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ path: "/", label: "Home" }];
  }

  const items: { path: string; label: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (UUID_REGEX.test(seg)) continue;

    const currentPath = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    items.push({ path: currentPath, label });
  }

  return items;
}

interface AppBreadcrumbsProps {
  className?: string;
}

export function AppBreadcrumbs({ className }: AppBreadcrumbsProps) {
  const location = useLocation();
  const items = getBreadcrumbItems(location.pathname);

  if (items.length <= 1) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, i) => (
          <span key={item.path} className="contents">
            <BreadcrumbItem>
              {i === items.length - 1 ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={item.path}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {i < items.length - 1 && <BreadcrumbSeparator />}
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default AppBreadcrumbs;
