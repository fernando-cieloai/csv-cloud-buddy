import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const baseLinkClasses =
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors";

const primaryLinkClasses =
  "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground";

export const Navbar = () => {
  const { pathname } = useLocation();
  const isSettingsActive = pathname.startsWith("/settings");

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

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            baseLinkClasses,
            "outline-none",
            isSettingsActive
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          Settings
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <NavLink to="/settings/clients">Clients</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/settings/vendor">Create vendor</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/settings/csv">Upload CSV</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/settings/countries">Countries</NavLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
};

export default Navbar;

