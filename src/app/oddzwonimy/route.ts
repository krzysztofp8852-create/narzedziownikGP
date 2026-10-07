import type { CallbackFormState } from "@/components/callback-form";
import { t } from "@/i18n/t";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import { formatPhone, isCallbackSource, normalizePhone } from "@/registry/registry";

/**
 * Formularz „Zostaw numer, oddzwonimy” (strona o programie i /demo). Osobny adres, a nie akcja serwera, bo akcja wysyła
 * się na adres strony, a niezalogowany widzi stronę o programie pod „/”, gdzie proxy odsyła wysłane formularze do
 * logowania. Wypełnione ukryte pole `website` to bot: dostaje podziękowanie, ale nic się nie zapisuje.
 */
export async function POST(request: Request): Promise<Response> {
  // Jak akcje serwera: formularz wysyła tylko nasza strona.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response("Brak dostępu", { status: 403 });
  const formData = await request.formData().catch(() => new FormData());
  return Response.json(await callbackState(formData));
}

async function callbackState(formData: FormData): Promise<CallbackFormState> {
  const phone = formText(formData, "phone");
  const source = formText(formData, "source");
  const done = formatPhone(normalizePhone(phone) ?? phone.trim());
  if (formText(formData, "website")) return { done };
  if (!isCallbackSource(source)) return { error: t("errors.invalid_input") };
  try {
    await getRegistry().system().requestCallback({ phone, name: formText(formData, "name"), source });
  } catch (error) {
    if (isRegistryError(error) && error.code === "invalid_input") return { error: t("callback.invalidPhone") };
    return { error: errorMessage(error) };
  }
  return { done };
}
