# Instrukcja testów manualnych — Caprine Enhanced (macOS Apple Silicon)

Poniższa instrukcja pozwala na pełne przetestowanie aplikacji **Caprine Enhanced** po zainstalowaniu jej z pliku `.dmg` lub uruchomieniu bezpośrednio z katalogu `dist/mac-arm64/Caprine Enhanced.app`.

---

## 1. Logowanie i ponowne uruchomienie (Persistence sesji)
1. Uruchom `Caprine Enhanced.app`.
2. Zaloguj się na swoje konto Facebook / Messenger.
3. Sprawdź, czy okno czatu ładuje się poprawnie i czy interfejs reaguje na kliknięcia.
4. Całkowicie zamknij aplikację (`Cmd + Q`).
5. Uruchom aplikację ponownie.
6. **Oczekiwany rezultat:** Aplikacja uruchamia się bezpośrednio w widoku zalogowanego użytkownika bez prośby o ponowne podanie loginu i hasła (sesja i ciasteczka są trwale zapisane w `~/Library/Application Support/Caprine Enhanced`).

---

## 2. Wysyłanie i odbieranie wiadomości
1. Wybierz dowolną konwersację z listy po lewej stronie.
2. Wpisz wiadomość tekstową w pole wprowadzania i naciśnij `Enter`.
3. Wyślij wiadomość zawierającą polskie znaki diakrytyczne oraz emoji.
4. Poproś rozmówcę o odesłanie odpowiedzi lub wyślij wiadomość z drugiego konta/telefonu.
5. **Oczekiwany rezultat:** Wiadomości są natychmiast wysyłane i poprawnie wyświetlane w wątku.

---

## 3. Otwieranie zdjęć, filmów i załączników
1. W dowolnym wątku kliknij na miniaturę przesłanego zdjęcia lub wideo.
2. **Oczekiwany rezultat:** Zdjęcie/wideo otwiera się w wewnętrznym podglądzie (lightboxie) wewnątrz aplikacji.
3. Kliknij link do zewnętrznej strony WWW (np. artykuł, Wikipedia).
4. **Oczekiwany rezultat:** Zewnętrzny link otwiera się w domyślnej przeglądarce macOS (Safari/Chrome/Brave), a parametry śledzące (`l.php`) zostają usunięte.

---

## 4. Pobieranie plików i ich zapisywanie
1. Kliknij na załącznik plikowy (np. dokument PDF, archiwum ZIP).
2. **Oczekiwany rezultat:** Pojawia się natywne okno systemowe macOS `Save As` umożliwiające wskazanie katalogu docelowego.
3. Wskaż folder (np. Pobrane / Downloads) i zapisz plik.
4. Sprawdź, czy w Docku pojawia się wskaźnik postępu pobierania, a plik po pobraniu jest kompletny i nieuszkodzony.

---

## 5. Połączenia głosowe (Audio WebRTC)
1. Otwórz konwersację z użytkownikiem i kliknij ikonę słuchawki („Rozpocznij połączenie głosowe”).
2. **Oczekiwany rezultat:**
   - Przy pierwszym uruchomieniu macOS wyświetli natywny monit TCC z prośbą o dostęp do mikrofonu (`NSMicrophoneUsageDescription`).
   - Po zaakceptowaniu okno połączenia otwiera się wewnątrz Caprine Enhanced (zamiast w zewnętrznej przeglądarce).
   - Dźwięk jest rejestrowany i przesyłany do rozmówcy.

---

## 6. Połączenia wideo (Kamera, mikrofon i urządzenia AV)
1. Kliknij ikonę kamery („Rozpocznij połączenie wideo”).
2. **Oczekiwany rezultat:**
   - macOS wyświetli systemowy monit o dostęp do kamery (`NSCameraUsageDescription`).
   - Obraz z wbudowanej kamery FaceTime HD / kamery zewnętrznej pojawia się w oknie rozmowy.
3. W menu aplikacji wybierz: `Caprine Enhanced` -> `Check Camera & Microphone Permissions…`.
4. **Oczekiwany rezultat:** Wyświetla się okno z potwierdzeniem `CAMERA: GRANTED`, `MICROPHONE: GRANTED`.

> **Uwaga dot. ograniczeń Meta:** Jeśli Meta okresowo wymusza korzystanie z natywnej aplikacji Messenger Desktop dla szyfrowanych połączeń E2EE (End-to-End Encrypted), interfejs webowy może wyświetlić komunikat informacyjny Meta. Połączenia w standardowych czatach WebRTC są w pełni obsługiwane przez zaimplementowane handlery Chromium.

---

## 7. Powiadomienia w tle i licznik nieprzeczytanych wiadomości
1. Zminimalizuj okno Caprine Enhanced lub przełącz się do innej aplikacji.
2. Wyślij wiadomość testową do swojego konta z telefonu.
3. **Oczekiwany rezultat:**
   - W prawym górnym rogu ekranu pojawia się systemowe powiadomienie macOS z treścią i nadawcą wiadomości.
   - Kliknięcie w powiadomienie aktywuje okno Caprine Enhanced i otwiera dany wątek.
   - Na ikonie aplikacji w Docku pojawia się czerwona plakietka (badge) z liczbą nieprzeczytanych wiadomości (obsługiwana natywnie oraz przez mechanizm fallback `page-title-updated`).

---

## 8. Zużycie RAM i CPU w spoczynku oraz podczas rozmowy
1. Otwórz aplikację `Monitor aktywności` (Activity Monitor) w macOS.
2. Wyszukaj proces `Caprine Enhanced`.
3. **Spoczynek (aplikacja w tle):**
   - Zużycie CPU: ~0.1% – 1.0%.
   - Zużycie RAM: typowe dla zoptymalizowanej aplikacji Electron (~150–250 MB).
4. **Podczas rozmowy wideo:**
   - Dzięki akceleracji sprzętowej Apple Silicon (`VaapiVideoDecoder` / VideoToolbox), dekodowanie i kodowanie wideo obciąża dedykowane silniki multimedialne procesora M4, utrzymując niskie zużycie ogólnych rdzeni CPU.
