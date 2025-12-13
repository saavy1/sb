import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, interactive, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6",
        interactive && "cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)] transition-colors",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return <h3 className={cn("text-lg font-medium", className)}>{children}</h3>;
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return <p className={cn("text-sm text-[var(--text-secondary)]", className)}>{children}</p>;
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>;
}
