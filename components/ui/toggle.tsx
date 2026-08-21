import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(({ className, pressed = false, onPressedChange, onClick, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={pressed}
    className={cn(
      "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      pressed ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground",
      className,
    )}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented) onPressedChange?.(!pressed);
    }}
    {...props}
  />
));
Toggle.displayName = "Toggle";

export { Toggle };
