import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

export interface DateRangePickerProps {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  onChange?: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Select date range",
  className,
  disabled,
}: DateRangePickerProps) {
  const range: DateRange | undefined = React.useMemo(() => {
    if (!from && !to) return undefined;
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }, [from, to]);

  const [open, setOpen] = React.useState(false);

  const handleSelect = (r: DateRange | undefined) => {
    if (r?.from) {
      const fromStr = r.from.toISOString().slice(0, 10);
      const toStr = r.to ? r.to.toISOString().slice(0, 10) : fromStr;
      onChange?.(fromStr, toStr);
      if (r.to) setOpen(false);
    }
  };

  const displayText = React.useMemo(() => {
    if (!from && !to) return placeholder;
    if (from && to) {
      return `${format(new Date(from), "MMM d, yyyy")} – ${format(new Date(to), "MMM d, yyyy")}`;
    }
    if (from) return `${format(new Date(from), "MMM d, yyyy")} – …`;
    if (to) return `… – ${format(new Date(to), "MMM d, yyyy")}`;
    return placeholder;
  }, [from, to, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 w-[240px] justify-center text-center font-normal",
            !from && !to && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          title="From – To date range"
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-2 border-b text-xs text-muted-foreground text-center">
          Select From and To dates
        </div>
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={1}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
