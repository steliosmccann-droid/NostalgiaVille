# FarmVille3026 — GitHub project (from approved V57)

Η δομή αυτή προέρχεται από το **εγκεκριμένο V57** και διατηρεί το grid, το map, τις αποχρώσεις, το περίγραμμα και το gameplay. Οι εικόνες μεταφέρθηκαν από Base64 σε `assets/sprites/`.

## Ανέβασμα από iPhone

1. Αποσυμπίεσε το ZIP στην εφαρμογή Αρχεία.
2. Στο GitHub ανέβασε **όλα τα περιεχόμενα** του φακέλου `FarmVille3026_V57_GitHub_Project` στο root του repository. Το `index.html` πρέπει να βρίσκεται στο root (όχι έναν φάκελο πιο μέσα).
3. Άνοιξε **Settings → Pages → Deploy from a branch → main / (root)** και αποθήκευσε.
4. Άνοιξε το GitHub Pages URL με Safari για να παίξεις. Τα αρχεία `assets/`, `css/`, `js/`, `data/` πρέπει να ανέβουν όλα μαζί.

## Δομή
- `index.html`: μόνο UI markup και σύνδεση αρχείων.
- `css/`: στυλ με σειρά φόρτωσης ίδια με το V57.
- `js/core/`: γενικές υπηρεσίες, grid engine και κύριος κώδικας παιχνιδιού.
- `js/systems/`: plowing και crop logic.
- `js/ui/`: toolbar και settings.
- `data/`: catalogs, crop archive, sprite manifest.
- `assets/sprites/`: πραγματικά WebP/PNG αντί Base64.

## Σημειώσεις συμβατότητας
- **Μην ανοίγεις μόνο το `index.html` από τα Αρχεία χωρίς τους υπόλοιπους φακέλους.** Χρειάζονται οι σχετικές διαδρομές. Το GitHub Pages λειτουργεί ως HTTPS site.
- Το Asset Studio **Εξαγωγή HTML με εικόνες** έχει απενεργοποιηθεί στην πολυαρχική έκδοση, επειδή θα παρήγαγε μη αυτοτελές HTML. Χρησιμοποίησε **Εξαγωγή πακέτου** για εικόνες.
- Η τοπική αποθήκευση (localStorage/IndexedDB) εξαρτάται από το origin. Μια φάρμα από `file://` ή άλλη διεύθυνση **δεν μεταφέρεται αυτόματα** στο GitHub Pages. Κάνε εξαγωγή backup JSON στην παλιά έκδοση και εισαγωγή στο νέο URL.
- Δεν έχουν προστεθεί νέοι μηχανισμοί. Η αλλαγή είναι μόνο διαχωρισμός κώδικα/assets, όχι νέα gameplay έκδοση.
- Για μελλοντικό περιεχόμενο, `data/grid-catalog.js` και `data/crop-archive.*` είναι διαθέσιμα για χωριστή διαχείριση.

## V58 — core UI polish
- Loading overlay disappears when the game initialization completes.
- Missing scripts and startup failures display a retry panel.
- Developer/QA controls are hidden for normal players; add `?dev=1` to the GitHub Pages URL to reveal them.
- Settings shows V58.
- No change to map colors, grid, asset catalogue, save-data keys, or gameplay rules.

**Note:** Script loading failures are handled by the boot overlay; artwork files can still fail independently. The progress bar indicates startup stages, not exact network bytes transferred.
