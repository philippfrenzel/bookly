# KI-Textqualität je Stil – manuelle Abnahme mit synthetischen Beispielen (2026-11-21)

Grundlage: NFR-001-Ergänzung in `../specs/2026-11-20-ki-textfelder-design.md` §6.5 und
`../specs/2026-11-21-ki-textqualitaet-design.md`. Die Bewertungen unten sind eine **Vorab-Einschätzung durch Claude
(Implementierungsrolle)**. Sie ersetzen nicht die manuelle Abnahme durch die Nutzerin oder den Nutzer, die NFR-001 vorsieht.

## Quelle und Herkunft

| | |
| --- | --- |
| Quelle der Beispieltexte | **Echte Gateway-Ausgabe**: OpenRouter, so konfiguriert wie in der lokalen `.env` der Haupt-Checkout (Schlüssel nur aus der Umgebung gelesen, nie ausgegeben oder committet) |
| Modell | `google/gemini-3.1-flash-lite` (der in `OPENROUTER_MODEL` konfigurierte Wert) |
| Werkzeug | `packages/server/scripts/evalStyles.ts`: baut die Anfragen mit den App-eigenen Funktionen `draftRequest`, `styleText` und `textRequest` |
| Eingaben | nur **synthetische** Kontexte aus dem Skript (zwei erfundene Bausteine: „Die letzte Fähre“ und „Das Uhrwerk“, dazu ein erfundenes Abschnittsfeld); keine Autorendaten |
| Endstand der Prompts | Commit `33b7643` (Lauf 4). Rohdaten: `2026-11-21-ki-textqualitaet-run4.json` (ohne System-Prompts, die sich aus dem Code ergeben) |
| Umfang je Lauf | 20 Entwürfe (7 eingebaute Stile, 1 Team-Stil, 1 Kombination aus Preset und Ergänzung des Autors, 1 Lauf ohne Stil; je 2 Kontexte) und 2 Zauberstab-Aktionen (Verbessern und Vorschlagen) mit je 3 Vorschlägen |
| Von Claude oder von Hand verfasste Beispiele | **keine**. Alle zitierten Texte sind wörtliche Ausschnitte der Gateway-Ausgabe. |

Selbst definierte Stile werden als Team-Stile (FR-017) und als „Ergänzung des Autors“ (FR-016) unterstützt. Abgedeckt
sind sie durch `team` (Team-Stil „Hausstil Küste“: „Präsens, nah an der Figur, wenig Dialog, Wetter und Arbeit tragen die
Stimmung.“) und `kombi` (Preset „Modern und knapp“ plus Ergänzung „Warm und persönlich, mit trockenem Humor; Dialoge in
Umgangssprache.“).

## Iteration: Indikatoren über vier Gateway-Läufe

Jeder Lauf verwendet denselben Satz synthetischer Kontexte mit dem jeweiligen Stand der Prompts. Die Zählungen sind
einfache Textsuchen über die 20 Entwürfe und kein Qualitätsmaß. Sie zeigen, an welchen Stellen die Prompt-Änderungen
etwas bewirkt haben.

| Lauf | Prompts | wiederholt vorherigen Text | mit „…“ | ASCII-' | Knöchel (jede Erwähnung) | Kloß | Staub tanzte | „tanzte nicht“ (Echo) | „als sie beabsichtigt hatte“ | Wörter |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `408d2d9` | 1 | 3/20 | 14 | 3 | 1 | 3 | 0 | 4 | 218–371 |
| 2 | `49ce7e6` | 0 | 17/20 | 1 | 0 | 1 | 3 | 3 | 1 | 238–365 |
| 3 | `7c43d20` | 0 | 15/20 | 0 | 2 | 2 | 6 | 0 | 0 | 172–373 |
| 4 | `33b7643` | 0 | 13/20 | 0 | 5 | 0 | 0 | 0 | 0 | 189–371 |
- In „Staub tanzte“ sind die Echos aus der Spalte daneben mitgezählt (Lauf 2: alle drei sind Echos).
- Lauf 1 → 2: Die Regeln „vorherigen Text nicht wiederholen“, „wörtliche Rede in „…““, die Körperklischees mit Beispielen
  und „mit Handlung, Bild oder Rede enden“ haben gewirkt: kein wiederholter Text mehr, keine ASCII-Anführungszeichen,
  keine deutenden Schlusssätze mehr wie „Es war, als …“. Neu aufgetreten ist ein Echo: drei Entwürfe beginnen mit
  „Staub tanzte nicht …“, weil das Modell das genannte Negativbeispiel verneint aufgreift.
- Lauf 3 (Klischees nur beschrieben, ohne Beispiele): Das Echo verschwindet, die Klischees selbst kommen aber zurück.
- Lauf 4 (Beispiele genannt, „auch nicht verneint oder abgewandelt“): kein Echo, kein Staub, kein Kloß. „Knöchel“ kommt
  fünfmal vor. Drei Stellen sind wörtlich gemeint: Hände in „Die Haut spannte an ihren Knöcheln, rau von der Lauge“,
  Fußknöchel in „bis in ihre Knöchel kroch“ und „an seinen Knöcheln hängen“. Nur zwei sind das Klischee, beide in den
  Entwürfen ohne Stil („die Knöchel traten unter der dünnen Haut hervor“, „dass ihre Knöchel weiß hervortraten“). Das ist
  die niedrigste Klischee-Zahl der vier Läufe. Dabei wurde es belassen, siehe Grenzen.
- Alle Entwürfe mit Dialog verwenden „…“. Die 7 Entwürfe ohne „…“ sind Werkstatt-Entwürfe ohne Dialog. Im Jugendbuch-Entwurf ist ein zitierter
  Briefsatz in »…« gesetzt.

## Bewertung je Stil (Lauf 4, Endstand)

Kriterien nach NFR-001: Natürlichkeit, Erkennbarkeit des Stils, Kontextbezug, sprachliche Abwechslung sowie Floskeln,
Wiederholungen und schematische Formulierungen. ✅ = erfüllt, ◐ = mit Einschränkung erfüllt.

| Stil | Natürlich | Stil erkennbar | Kontext | Abwechslung | Floskeln/Schema | Kurzbegründung |
| --- | --- | --- | --- | --- | --- | --- |
| Klassisch erzählend | ✅ | ✅ | ✅ | ✅ | ◐ | ruhige, lange Perioden mit auktorialer Distanz; einzelne vertraute Bilder („wie erstarrte Insekten“) |
| Modern und knapp | ✅ | ✅ | ✅ | ✅ | ✅ | kurze Sätze, Subtext, Schluss mit Handlung („Unten kehrte jemand den Gehweg.“) |
| Poetisch | ✅ | ✅ | ✅ | ✅ | ◐ | bildreich und klangvoll; stellenweise überladen („Niederschlag aus der Zeit selbst“) |
| Spannungsgeladen | ✅ | ✅ | ✅ | ✅ | ✅ | gezielte Informationen, Cliffhanger („Lio hörte ein Knarren auf der Treppe hinter sich.“) |
| Humorvoll | ✅ | ✅ | ✅ | ✅ | ◐ | Situationskomik und pointierte Rede („sonst holt dich der Geist von Tante Trude!“); der Werkstatt-Schluss fasst noch zusammen |
| Jugendbuch | ✅ | ◐ | ✅ | ✅ | ✅ | nah an Lio, klare Sprache; bei den erwachsenen Figuren der Fähre-Szene kaum vom Stil „ohne“ zu unterscheiden |
| Ich-Perspektive | ✅ | ✅ | ✅ | ✅ | ✅ | durchgehend erste Person; ohne vorherigen Text im Präsens |
| Team-Stil „Hausstil Küste“ | ✅ | ✅ | ✅ | ✅ | ◐ | Präsens, nah an der Figur, Arbeit trägt die Stimmung („Fingernägel, die noch immer nach Wacholder und Buchenholz riechen“); in der Werkstatt-Szene dasselbe vertraute Bild („wie erstarrte Insekten“) |
| Knapp + Ergänzung „warm, trockener Humor, Umgangssprache“ | ✅ | ◐ | ✅ | ✅ | ✅ | knapp klar erkennbar; Wärme und Humor der Ergänzung schwächer als in Lauf 1 (dort: „Vergiss nicht, die Rosen zu gießen, bevor der Frost kommt.“) |
| ohne Stil | ✅ | – | ✅ | ✅ | ◐ | neutral erzählend; beide Knöchel-Klischees des Laufs stehen hier („dass ihre Knöchel weiß hervortraten“) |

Zauberstab (nicht stilabhängig, Abschnittsbeschreibung): ◐. Unter den Vorschlägen beim Verbessern sind konkrete
(„starrt auf das aufgewühlte Kielwasser“), aber auch Floskeln („mit schwerem Herzen“). Beim Vorschlagen bleibt einer
von drei konkret („umklammert sie den kalten Holzpfosten“), die anderen sind stimmungslastig („tiefe, endgültige
Stille“).

## Beispielausschnitte (wörtliche Gateway-Ausgabe, Lauf 4, Prompts `33b7643`)

#### Klassisch erzählend (`klassisch`)

- **faehre** (371 Wörter, 3883 ms) — Anfang: „Jetzt legte sich die Kälte des Abends schwer auf die Betonmole. Jonas rückte den Riemen seiner Tasche zurecht, ein Geräusch, das in der plötzlichen Stille wie ein mechanischer Fehler klang.“ … Ende: „Das Schiff löste sich mit einem Quietschen von den Pollern, die Schrauben wühlten den Schlamm am Grund auf, und eine Fontäne aus Gischt legte sich wie ein feuchter Schleier über den Anleger. Gerade als die Distanz groß genug wurde, um die Stimmen verschlucken zu lassen, rief Mara über das Wasser: „Vergiss nicht, den Schlüssel unter der dritten Diele im Flur zu lassen, falls du noch einmal zurückkommst!““
- **werkstatt** (291 Wörter, 3852 ms) — Anfang: „Der Geruch von altem Maschinenöl und Metallstaub klebte noch immer in den Wänden der kleinen Werkstatt, als hätte der Großvater den Raum erst vor wenigen Minuten verlassen, um eine Lieferung in der Bäckerei unter ihnen zu prüfen. Lio strich über die staubige Oberfläche der massiven Eichenwerkbank.“ … Ende: „Draußen vor dem Fenster verdeckte ein Vorhang aus dichtem Schneegestöber die Dächer der Gasse, sodass das Licht im Raum ein fahles, bläuliches Leuchten annahm. Lio faltete das Blatt wieder zusammen, wobei das Papier unter ihren Fingern leise knisterte, und legte es in die Tasche ihrer Strickjacke.“

#### Modern und knapp (`knapp`)

- **faehre** (272 Wörter, 3067 ms) — Anfang: „Das Salz brannte in den kleinen Rissen ihrer Finger. Sie steckte die Hände in die Taschen ihrer Arbeitsjacke.“ … Ende: „Die Kälte schnitt ihr in den Hals, als sie rief: „Vergiss den Schlüssel nicht im Briefkasten!“ Jonas stand am Heck, er hob kurz die Hand, dann verschlang ihn der Nebel.“
- **werkstatt** (189 Wörter, 1968 ms) — Anfang: „Die Luft in der Werkstatt roch nach altem Öl und Metall. Lio strich über die staubige Werkbank.“ … Ende: „Unten kehrte jemand den Gehweg. Lio steckte den Zettel in die Tasche ihrer Jacke.“

#### Poetisch (`poetisch`)

- **faehre** (292 Wörter, 3429 ms) — Anfang: „Die Haut spannte an ihren Knöcheln, rau von der Lauge und dem Salz, als sie den schweren Jutesack neben sich auf dem Beton abstellte. Jonas rückte seine Tasche zurecht, den Blick starr auf das schwarze, brodelnde Wasser des Sunds gerichtet.“ … Ende: „Mara trat an das rostige Geländer, ihre Finger klammerten sich in das raue Eisen. „Jonas!“, rief sie, und ihre Stimme trug kaum gegen das Rauschen der Maschinen, „nimm wenigstens den Schlüssel vom Dachboden mit.““
- **werkstatt** (322 Wörter, 3850 ms) — Anfang: „Der Staub in der Werkstatt war kein gewöhnlicher Staub, sondern ein feiner Niederschlag aus der Zeit selbst, der sich auf den Messinggehäusen und den ausgebreiteten Federblättern abgesetzt hatte. Lio spürte den kühlen Hauch der Winterluft, die durch die Ritzen der alten Dielen drang, doch die vertraute Schwere des Raumes wog schwerer.“ … Ende: „Sie ließ den Blick über die Regale schweifen, über die unzähligen, nun verstummten Uhrwerke, die in der Dunkelheit auf ihren nächsten Aufzug warteten. Sie legte den Brief zurück auf den Tisch, direkt unter das gelbe Licht ihrer Schreibtischlampe, und berührte mit dem Daumen den rauen Rand des Papiers.“

#### Spannungsgeladen (`spannung`)

- **faehre** (311 Wörter, 3765 ms) — Anfang: „Jetzt peitschte er die Gischt gegen den Beton der Mole, dass es schmeckte wie altes Salz und Verfall. Jonas zog den Kragen seiner Windjacke hoch, der Reißverschluss klemmte auf halber Höhe.“ … Ende: „Die Lücke zwischen der Kaimauer und dem Schiff wurde augenblicklich größer, das Wasser dazwischen schäumte auf, ein dunkler Schlund, der sich öffnete. Als das Heck der Fähre bereits die ersten Meter zurückgelegt hatte und der Nebel die Konturen seines Gesichts zu verwischen drohte, schrie sie ihm nach: „Der Schlüssel liegt unter der losen Diele im Flur, nimm ihn mit, du wirst ihn brauchen!““
- **werkstatt** (267 Wörter, 3160 ms) — Anfang: „Der Geruch von altem Maschinenöl hing schwer in der Luft der Werkstatt, vermischt mit der abgestandenen Wärme der Bäckerei aus dem Untergeschoss. Lio strich mit dem Ärmel über den schweren Eichenarbeitstisch.“ … Ende: „Sie las die erste Zeile erneut, das Wort ‚Verrat‘ stach ihr wie ein Splitter in die Augen. Lio hörte ein Knarren auf der Treppe hinter sich.“

#### Humorvoll (`humorvoll`)

- **faehre** (291 Wörter, 3266 ms) — Anfang: „Es war ein eisiger Zug, der den Dieselgestank der Fähre wie eine persönliche Beleidigung in ihre Nasen trieb. Jonas rückte seinen Rucksack zurecht, als würde er sich gleich unter dem Gewicht der Familiengeschichte in die Tiefe stürzen.“ … Ende: „Mara sah zu, wie Jonas sich an der Reling positionierte, den Kopf tief in den Kragen gezogen. Als er bereits auf dem dunklen Wasser schaukelte, trat sie einen Schritt vor und rief gegen den Wind an: „Vergiss nicht, den Schlüssel vom Schuppen abzugeben, sonst holt dich der Geist von Tante Trude!““
- **werkstatt** (356 Wörter, 3393 ms) — Anfang: „Lio wusste, dass das Aufräumen von Opa Friedrichs Werkstatt ein Unterfangen war, das eher einer archäologischen Expedition in einem Minenfeld glich als einer simplen Reinigungsaktion. Über der Bäckerei roch es nicht nach frisch gebackenen Brötchen, sondern hartnäckig nach Maschinenöl, altem Messing und einer Prise Pfeifentabak, die sich vermutlich für die nächsten hundert Jahre im Gebälk festgesetzt hatte.“ … Ende: „Sie hielt das Papier gegen das Licht der Lupenlampe, wobei sie fast mit dem Ellenbogen einen Stapel winziger Schrauben vom Tisch fegte. Vorsichtig legte sie den Brief beiseite, griff nach der nächsten Uhr und stellte fest, dass die Arbeit im Nachlass ihres Großvaters plötzlich deutlich weniger wie eine Pflichtaufgabe und mehr wie eine sehr späte, sehr verwirrende Nachricht von einem Toten wirkte.“

#### Jugendbuch (`jugendbuch`)

- **faehre** (325 Wörter, 3712 ms) — Anfang: „Er blies in seine geballten Fäuste, als könnte er die Wärme dort einsperren. Neben ihnen peitschte das Wasser gegen den Beton, ein dumpfes, unregelmäßiges Grollen.“ … Ende: „„Denk an die Schlüssel für den Schuppen!“, schrie sie gegen den Wind an. Er hob kurz den Arm, doch ob er es gehört hatte, blieb in dem aufgewühlten Wasser verborgen.“
- **werkstatt** (309 Wörter, 3422 ms) — Anfang: „Der Geruch in der Werkstatt war noch immer derselbe: ein schweres Gemisch aus altem Öl, Metallstaub und dem süßen, fast aufdringlichen Backaroma, das durch den Boden nach oben kroch. Lio strich mit dem Ärmel über den Arbeitstisch, doch der feine Schmutz wollte einfach nicht weichen.“ … Ende: „Lio drehte das Blatt im Licht der Lupenlampe hin und her, bis die Schatten der Werkzeuge an der Wand tanzten. Da war noch ein Satz am Ende, unterstrichen mit einem Schwung, der fast das Papier durchtrennt hätte: »Ich habe das Versprechen nie gebrochen, auch wenn der Winter niemals endet.« Lio legte das Papier auf den Tisch, direkt neben die Schraubendreher, und starrte auf die fremde Handschrift.“

#### Ich-Perspektive (`ich-perspektive`)

- **faehre** (286 Wörter, 3393 ms) — Anfang: „Jetzt peitschte er den Geruch von billigem Diesel über die Betonmole und mischte ihn mit dem fauligen Dunst der angeschwemmten Algen. Jonas stand am rostigen Geländer, die Hände tief in den Taschen seiner Jacke vergraben, die Schultern hochgezogen.“ … Ende: „Die Scheinwerfer der Fähre schnitten trübe Kegel in den Nebel, die schon nach wenigen Metern in der Schwärze verschwammen. „Denk an die Schlüssel für den Dachboden!“, rief ich, und meine Stimme klang plötzlich dünn und verloren gegen das Stampfen der Schiffsmotoren.“
- **werkstatt** (292 Wörter, 3519 ms) — Anfang: „Der Geruch von altem Öl und Metall liegt schwer in der Luft, fast so, als hätte die Zeit hier oben über dem Bäckerladen angehalten. Ich fahre mit der Hand über die Werkbank, auf der noch immer die feinen Späne liegen, die Opa zuletzt hinterlassen hat.“ … Ende: „Was hatte er in dieser Uhr versteckt, die er sonst so penibel gepflegt hat? Ich lege das kleine Papier auf den Tisch, direkt neben die Pinzette, und starre auf den ersten Satz.“

#### Team-Stil „Hausstil Küste“ (`team`)

- **faehre** (298 Wörter, 3450 ms) — Anfang: „Jetzt beißt er in der Kälte, schneidet unter die Fingernägel, die noch immer nach Wacholder und Buchenholz riechen. Jonas tritt unruhig von einem Bein aufs andere, der Kragen seines Mantels ist hochgeschlagen.“ … Ende: „Sie hebt die Hand, ihre Finger sind klamm und rauer als sein Leben es jemals zulassen würde. „Vergiss den Schlüssel nicht, du Idiot“, ruft sie gegen das Rauschen an, doch der Wind trägt ihre Stimme fort, noch bevor sie den Rand der Mole erreicht.“
- **werkstatt** (256 Wörter, 3420 ms) — Anfang: „Der Geruch nach altem Öl und Metall liegt schwer in der Luft, vermischt mit dem süßlichen Nachhall des Backofens aus dem Erdgeschoss. Lio streicht über die raue Holzplatte des Arbeitstisches.“ … Ende: „Lios Atem bildet eine winzige Wolke in der kalten Werkstattluft. Sie dreht den Zettel im gedämpften Licht der Lampe hin und her, bis die ersten Worte unter ihrem Blick Gestalt annehmen.“

#### Kombination: Modern und knapp + Ergänzung des Autors (`kombi`)

- **faehre** (228 Wörter, 2799 ms) — Anfang: „Sie standen am Ende der Mole. Die Luft schmeckte nach Diesel und aufgewühltem Schlick.“ … Ende: „„Vergiss nicht, die Schlüssel abzugeben!“, rief sie über das aufschäumende Wasser hinweg. Jonas hob kurz den Arm, ohne sich umzudrehen, dann verschlang ihn der Schatten des Aufbaus.“
- **werkstatt** (247 Wörter, 3122 ms) — Anfang: „Die Werkstatt roch noch immer nach Öl und altem Messing. Lio strich über die staubige Werkbank.“ … Ende: „Ein kalter Luftzug kam durch den Spalt unter der Tür. Lio schob die Uhr in ihre Hosentasche und griff nach dem Besen.“

#### Kein Stil gesetzt (`ohne`)

- **faehre** (364 Wörter, 3799 ms) — Anfang: „Jetzt legte sich der Geruch von kaltem Diesel schwer über die Mole, vermischt mit dem fauligen Aroma von angespültem Seegras. Jonas schob seinen Koffer über die unebenen Betonplatten, die Rollen klackerten unerbittlich gegen die Kanten.“ … Ende: „„Vergiss den Schlüssel unter der dritten Stufe nicht.“ Sie sah, wie er an der Reling eine kurze Bewegung machte, bevor das Schiff endgültig im dichten Dunst des Sundes verschwand.“
- **werkstatt** (364 Wörter, 3889 ms) — Anfang: „Das Ticken der Wanduhren war in den Wochen seit seinem Tod verstummt, doch der Raum roch noch immer so vertraut nach Maschinenöl, altem Holz und dem scharfen, metallischen Unterton von Messing. Lio strich mit dem Ärmel über die staubige Werkbank, an der er so oft gesessen hatte, den Kopf in eine der Lupenlampen gedrückt, die Hände ruhig wie Stein.“ … Ende: „Lio faltete den Brief nicht wieder zusammen. Sie schob die Uhr beiseite, bis sie klappernd gegen einen Stapel Pinzetten stieß, und hielt das Papier so fest, dass ihre Knöchel weiß hervortraten, während ihr Blick an dem Namen am Ende des Briefes hängen blieb.“

#### Zauberstab (Abschnittsbeschreibung, nicht stilabhängig)

- **polish** (Eingabe: „Mara bringt Jonas zur Fähre. Sie streiten über das Haus. Dann fährt er weg und sie ist traurig.“):
  - Mara begleitet Jonas zur Anlegestelle, doch der Streit über das Haus schwelt noch immer zwischen ihnen. Als die Fähre ablegt und er schließlich an Bord verschwindet, bleibt sie allein auf dem Kai zurück und starrt auf das aufgewühlte Kielwasser.
  - Der Weg zur Fähre ist geprägt von ihrer hitzigen Diskussion über das Haus. Sobald das Schiff ablegt, verstummt der Lärm, und Mara sieht ihm mit schwerem Herzen nach, während das Schiff in der Ferne kleiner wird.
  - Während sie gemeinsam zur Fähre gehen, entbrennt erneut die Debatte um das Haus. Als er schließlich an Bord geht und die Leinen gelöst werden, fühlt sich Mara mit einem Schlag wie abgeschnitten von der Welt.
- **generate** (Eingabe: „“):
  - Das leise Echo der ablegenden Fähre verhallt zwischen den Felsen, während Mara allein am verlassenen Kai zurückbleibt.
  - Sie beobachtet, wie die letzten Lichter der Boote am Horizont schrumpfen und die Insel in eine tiefe, endgültige Stille hüllen.
  - Mit beiden Händen umklammert sie den kalten Holzpfosten des Stegs und spürt, wie das letzte Schiff die Insel für immer freigibt.

## Grenzen und offene Punkte

- **Ein Modell, ein Lauf je Stand.** Ausgewertet wurde nur das konfigurierte `google/gemini-3.1-flash-lite` mit
  jeweils einer Stichprobe pro Stil und Kontext. Die Klischee-Zählungen schwanken zwischen den Läufen deutlich.
  Ein Modellwechsel kann die Ergebnisse verändern.
- **Klischees verschwinden nicht ganz.** Mit Prompt-Regeln lassen sich typische Klischees verringern, aber nicht
  ausschließen. Werden Beispiele genannt, nehmen andere zu oder werden als Echo aufgegriffen.
- **Gleiche Idee über alle Stile.** In der Fähre-Szene ruft Mara fast immer etwas über einen Schlüssel. Weil jede
  Anfrage unabhängig ist, sieht eine Autorin oder ein Autor das nur innerhalb eines Stils. Es zeigt aber, dass das
  Modell Kontextdetails gleichförmig weiterspinnt.
- **Zeitform: Stil oder vorheriger Text?** Der Team-Stil verlangt Präsens, der vorherige Text steht im Präteritum.
  In Lauf 1 folgte das Modell dem vorherigen Text, in Lauf 4 dem Stil. Die Prompts legen bewusst nur fest, dass Stil
  und Ton des vorherigen Textes Vorrang vor den allgemeinen Abwechslungsregeln haben. Ob der Stil oder der
  Anschlusstext die Zeitform bestimmt, ist eine Produktentscheidung und bleibt offen.
- **Kein Vergleich mit dem Stand vor der Änderung.** Mit den Prompts von `main` (`fcb5e90`) gab es keinen Lauf.
  Lauf 1 enthält schon die ersten Regeln dieses Branches.
- **Strukturvorschläge nicht live geprüft.** Die neue Regel für Titel und Inhalte in `structureRequest` ist nur durch
  Unit-Tests abgesichert.
- **Nach Lauf 4 geändert, nicht live geprüft.** Zwei klärende Prompt-Formulierungen wurden nach Lauf 4 angepasst und
  nicht erneut live ausgeführt: In `BASE` (`textPrompt.ts`) heißt es jetzt „der Ton des vorhandenen Textes
  bleibt erkennbar“, und der Entwurfs-Prompt ohne Stil nennt den Vorrang des vorherigen Textes vor den
  Abwechslungsregeln (`STYLE_VOICE` wurde entsprechend gekürzt). Die Auszüge stammen von den Prompts des Commits
  `33b7643`. Die Datei `2026-11-21-ki-textqualitaet-run4.json` ist eine reduzierte Kopie: System-Prompts entfernt,
  `prompts_commit` und `source` ergänzt.
- Die Bewertung oben ist Claudes Einschätzung. Die manuelle Abnahme nach NFR-001 steht noch aus.

## Reproduzieren

```sh
cd packages/server
npx tsx --env-file=<Pfad zur .env mit OPENROUTER_API_KEY und OPENROUTER_MODEL> scripts/evalStyles.ts <Ausgabeordner>
```
