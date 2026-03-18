import { NavLink } from "react-router-dom";

const baseLinkClasses =
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors";

const primaryLinkClasses =
  "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground";

const navItems = [
  { to: "/quotations", label: "Quotations" },
  { to: "/vendors", label: "Vendors" },
  { to: "/clients", label: "Clients" },
  { to: "/countries", label: "Countries" },
] as const;

export const Navbar = () => {
  return (
    <nav className="flex items-center gap-6 text-sm">
      {navItems.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              baseLinkClasses,
              isActive
                ? "bg-primary text-primary-foreground"
                : primaryLinkClasses,
            ].join(" ")
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
};

export default Navbar;

