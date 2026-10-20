import { cn } from "cn";
import { Icon } from "@/lib/icons";

/** Badge from badge master data: colour + text colour + icon (02 §4). */
export function Badge({
  name,
  color,
  textColor,
  icon,
  className,
}: {
  name: string;
  color: string;
  textColor: string;
  icon?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold",
        className,
      )}
      style={{ backgroundColor: color, color: textColor }}
    >
      {icon && <Icon name={icon} className="size-3.5" />}
      {name}
    </span>
  );
}
