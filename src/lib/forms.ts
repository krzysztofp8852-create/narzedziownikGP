import { type FormEvent, startTransition } from "react";

/**
 * Wysyła formularz do akcji bez `<form action>`, bo React czyści wtedy pola po każdej
 * odpowiedzi, także po błędzie. Po udanym zapisie formularz czyści się zmianą `key`.
 */
export function submitKeepingValues(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
}

/** Pole tekstowe formularza; brak pola albo plik to pusty tekst. */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
