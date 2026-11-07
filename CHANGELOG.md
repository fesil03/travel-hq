# Changelog

Versions follow `MAJOR.MINOR.PATCH`: MAJOR for big reshuffles of the app, MINOR for new features, PATCH for fixes. Every version is a git tag (`v2.0.0`) on `main`; the running version shows at the bottom of Wallet and rules.

## 2.1.0 — 2026-11-07
- **Move stays between cities**: drag a hotel by its handle onto another city (mouse or finger). While dragging, a bar of cities appears at the bottom of the screen to drop onto. Each stay's details also have a **City** picker.
- **"Looks like it belongs in another city"**: when a stay's dates or area point to a different city than the one it's under, Hotels offers to move it in one tap, or leave it.
- **Fix: imported bookings all landing in the first city.** Booking imports now go by the city named in the booking first (accents and German spellings understood: Göttingen = Goettingen), then by dates.
- Removing a destination no longer deletes its hotels: they wait under "Not in a city yet" on Hotels.
- Fix: on phones, the price on hotel, flight, transfer and rail cards no longer overlaps the chips; price and Pick move to their own line.

## 2.0.0 — 2026-10-02
- **Status tiles** under the trip header, colour-coded: Flights, Stays, Transfers, Rail & road, Packing (green booked/done, amber chosen but not booked or not finished, red missing, grey nothing logged). Tap one to open its tab. Overview lists exactly what's left.
- **Costs tab** (moved out of Overview): Flights by leg, Accommodation per hotel with per-night cost and an overall per-night, Transfers, Rail & road, trip total, per night and per person. Categories fold.
- **Rail & road tab** for trains, buses, ferries and rental cars, with per-person or total pricing, booked status and confirmation numbers. Booking emails for these land here.
- **Travelers on the trip** (up to 6), added and named from Trip details. New travelers join unbooked flight and rail options automatically; booked ones stay as booked.
- **Trip brief** replaces Notes and is read by every AI feature.
- **Paste your own packing list**: AI (or simple rules without AI) sorts items into bags and categories, then offers to save it as a preset.
- **Paste your plan** on Itinerary: a day-separated plan is put on the right dates.

## 1.5.0 — 2026-10-02
- Map tab: import Google My Maps (KMZ/KML) as day-by-day stops.

## 1.4.0 — 2026-10-01
- Shared editing: edits from several people are combined instead of overwritten.

## 1.3.0 — 2026-09-23
- Several hotels and flights can be picked: split stays and separate tickets.

## 1.2.1 — 2026-09-23
- AI settings save before testing.

## 1.2.0 — 2026-09-23
- Import bookings from emails, PDFs and screenshots; choice of AI provider.

## 1.1.0 — 2026-09-18
- Transfers tab with pre-trip checklists.

## 1.0.0 — 2026-09-17
- First release on GitHub Pages: trips, flights, hotels, itinerary, weather, packing, private GitHub sync.
