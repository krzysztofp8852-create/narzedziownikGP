# 0043. Dziennik zmian kont i ustawień zapisywany w transakcji polecenia, z autorem z JWT

Data: 2026-10-09 · Status: przyjęta

## Kontekst

Ruchy, korekty, odbicia i wartości sprzętu mają historię, ale nie było wiadomo, kto założył konto, dezaktywował osobę,
nadał komuś hasło tymczasowe albo zmienił ustawienia firmy (próg dni, kto widzi i zamyka zgłoszenia, zgoda na koszty
dla kierownika). O taki dziennik zapyta informatyk klienta (#146). Zmiany roli i ponownej aktywacji osoby program
nie ma, więc nie ma ich też w dzienniku.

## Decyzja

- Tabela `app.change_log`, jeden wiersz na zmianę: założenie firmy (z właścicielem), założenie konta (z rolą i loginem,
  nigdy z hasłem), dezaktywacja konta, dezaktywacja osoby bez konta, nowe hasło tymczasowe dla innej osoby i każde
  zmienione ustawienie firmy z wartością przed i po. Zapis ustawień bez zmiany wartości nie zostawia wpisu.
- Wpis zapisuje Rejestr (`change-log.ts`) w transakcji polecenia, jak dzwonek (ADR 0007): nieudane polecenie, także
  gdy Supabase Auth odmówi przed zatwierdzeniem, nie zostawia wpisu, a wpis nie powstaje bez zmiany.
- Autora ustala baza wyzwalaczem przed zapisem, z JWT transakcji: osoba z firmy (z imieniem i nazwiskiem z chwili
  zmiany), super-admin albo program (transakcja systemowa: skrypt, demo). Rejestr go nie podaje, więc nie da się
  zapisać zmiany w cudzym imieniu. Konta super-admina nie zapisujemy, bo nie jest danymi firmy i trafiłoby do jej
  eksportu.
- Wpisy tylko się dopisują (`app.forbid_history_change`, jak ruchy) i znikają tylko z całą firmą (ADR 0025). Są
  w pełnym eksporcie danych firmy (ADR 0042). Imiona i nazwiska to kopia z chwili zmiany, bez kluczy obcych do kont
  i osób, więc wpis zostaje taki, jaki był.
- Czyta je właściciel firmy (Ustawienia → Dziennik zmian, także w trybie tylko do odczytu) i super-admin na karcie
  firmy. RLS pilnuje tego samego. Ekran pokazuje 200 najnowszych wpisów, a całość jest w eksporcie.

## Konsekwencje

- Nowe polecenie zmieniające konta albo ustawienia firmy musi samo dopisać wpis (`recordChange`); baza tego nie
  wymusza. Wyzwalacze na `app.users` i `app.companies` zapisywałyby same, ale z zegarem bazy zamiast zegara Rejestru
  i bez imienia osoby, której dotyczy zmiana konta.
- Dezaktywacja kont wycofanego demo (aktor systemowy) nie trafia do dziennika: firma i tak znika w całości.
