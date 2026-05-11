import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface SelectProps<T extends string = string> {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  children: React.ReactNode;
}

const SelectContext = React.createContext<{ value: string; onValueChange: (value: string) => void; open: boolean; setOpen: (open: boolean) => void } | null>(null);

const Select = <T extends string = string>({ value: controlledValue, defaultValue, onValueChange, children }: SelectProps<T>) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "" as T);
  const [open, setOpen] = React.useState(false);
  const value = controlledValue ?? internalValue;

  const handleValueChange = React.useCallback((newValue: string) => {
    setInternalValue(newValue as T);
    onValueChange?.(newValue as T);
    setOpen(false);
  }, [onValueChange]);

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
};

interface SelectTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectTrigger must be used within Select");

  return (
    <button
      ref={ref}
      type="button"
      className={cn("flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", context.open && "rotate-180")} />
    </button>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectValue must be used within Select");
  return <span>{context.value || placeholder}</span>;
};

type SelectContentProps = React.HTMLAttributes<HTMLDivElement>;

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectContent must be used within Select");

  if (!context.open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={() => context.setOpen(false)} />
      <div
        ref={ref}
        className={cn("absolute z-50 mt-2 max-h-96 w-full overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg", className)}
        {...props}
      >
        <div className="overflow-auto p-1">{children}</div>
      </div>
    </>
  );
});
SelectContent.displayName = "SelectContent";

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(({ className, value: itemValue, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectItem must be used within Select");
  const isSelected = context.value === itemValue;

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-accent/50",
        className
      )}
      onClick={() => context.onValueChange(itemValue)}
      {...props}
    >
      {isSelected && <span className="absolute left-2 flex h-4 w-4 items-center justify-center">✓</span>}
      {children}
    </div>
  );
});
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
export type { SelectProps };
