"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { DemoRole } from "@/demo/company";
import { t } from "@/i18n/t";

/**
 * Przycisk wejścia do roli demo; w formularzu z kilkoma rolami „Wchodzę…” pokazuje tylko kliknięty. `current`: rola,
 * w której oglądający już jest; na telefonie wiersz ról przewija się tak, żeby było ją widać.
 */
export function DemoRoleButton({
  role,
  label,
  className,
  current = false,
  disabled = false,
}: {
  role: DemoRole;
  label: string;
  className: string;
  current?: boolean;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  const entering = pending && data?.get("role") === role;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = ref.current;
    const row = button?.parentElement;
    if (!current || !button || !row) return;
    // Tylko w poziomie: przewinięcie strony do paska zabrałoby oglądającemu miejsce, w którym był.
    const overflow = button.getBoundingClientRect().right - row.getBoundingClientRect().right;
    if (overflow > 0) row.scrollLeft += overflow + 24;
  }, [current]);

  return (
    <button
      ref={ref}
      className={className}
      type="submit"
      name="role"
      value={role}
      disabled={pending || current || disabled}
      aria-current={current || undefined}
    >
      {entering ? t("demo.entering") : label}
    </button>
  );
}
