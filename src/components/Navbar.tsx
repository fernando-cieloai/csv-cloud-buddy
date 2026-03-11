import { NavLink } from "react-router-dom";

const baseLinkClasses =
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors";

const primaryLinkClasses =
  "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground";

const subtleLinkClasses =
  "text-muted-foreground hover:text-foreground hover:bg-muted";

export const Navbar = () => {
  return (
    <nav className="flex items-center gap-6 text-sm">
      <NavLink
        to="/quotations"
        className={({ isActive }) =>
          [
            baseLinkClasses,
            isActive
              ? "bg-primary text-primary-foreground"
              : primaryLinkClasses,
          ].join(" ")
        }
      >
        Quotations
      </NavLink>

      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </span>
        <div className="flex items-center gap-2">
          <NavLink
            to="/settings/vendor"
            className={({ isActive }) =>
              [
                baseLinkClasses,
                isActive
                  ? "bg-muted text-foreground"
                  : subtleLinkClasses,
              ].join(" ")
            }
          >
            Create vendor
          </NavLink>
          <NavLink
            to="/settings/csv"
            className={({ isActive }) =>
              [
                baseLinkClasses,
                isActive
                  ? "bg-muted text-foreground"
                  : subtleLinkClasses,
              ].join(" ")
            }
          >
            Upload CSV
          </NavLink>
          <NavLink
            to="/settings/countries"
            className={({ isActive }) =>
              [
                baseLinkClasses,
                isActive
                  ? "bg-muted text-foreground"
                  : subtleLinkClasses,
              ].join(" ")
            }
          >
            Countries
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

