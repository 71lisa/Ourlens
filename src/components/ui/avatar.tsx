import { cn } from "@/lib/cn";

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose text-sm font-medium text-burgundy",
        className,
      )}
      aria-hidden
    >
      {initials || "OL"}
    </span>
  );
}
