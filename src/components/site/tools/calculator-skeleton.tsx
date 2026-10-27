/** Placeholder while a calculator reads its link (02 §6: skeletons, never spinners). */
export function CalculatorSkeleton() {
  return (
    <div aria-hidden className="grid gap-8 lg:grid-cols-2">
      <div className="h-[34rem] rounded-[20px] bg-surface-muted" />
      <div className="h-[24rem] rounded-[20px] bg-surface-muted" />
    </div>
  );
}
