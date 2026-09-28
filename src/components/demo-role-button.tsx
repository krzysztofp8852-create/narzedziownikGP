"use client";

import { useFormStatus } from "react-dom";
import type { DemoRole } from "@/demo/company";
import { t } from "@/i18n/t";

/**
 * Przycisk wejścia do roli demo; w formularzu z kilkoma rolami „Wchodzę…” pokazuje tylko kliknięty. `current`: rola,
 * w której oglądający już jest.
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
  return (
    <button className={className} type="submit" name="role" value={role} disabled={pending || current || disabled} aria-current={current || undefined}>
      {entering ? t("demo.entering") : label}
    </button>
  );
}
