# Pokémon Proxy Printer

**Use it here: https://person1080p.github.io/pkmn-proxy/**

A web app for laying out Pokémon TCG proxy cards on a page and exporting them for printing. It runs entirely in the browser; nothing is uploaded to a server.

## Features

- **Deck import**: paste a PTCG Live export or an RK9 decklist.
- **Card lookup**: search by name, with a toggle between Standard-legal cards and all cards.
- **Custom cards**: upload your own images and crop, scale and rotate them to card size.
- **Page layout**: choose the paper size, the grid (not just 3 × 3), the spacing between cards, card size and cut guides.
- **Borders and corners**: widen the border on tightly cropped scans (old cards are detected and fixed automatically) and crop to standard rounded corners.
- **Export**: download a PDF or a zip of PNG pages, at 150–600 DPI.
- **Deck list**: copy, save or print the list of cards you have selected.
- **Settings**: export and import settings as JSON. Settings are kept for the browser session, and the card list is kept between visits.

## Using it

1. Add cards by pasting a deck list, looking cards up by name, or uploading images.
2. Adjust the page and card settings in the right-hand panel. The preview updates as you go.
3. Click **Download PDF** or **Download PNGs (.zip)**.
4. Print at 100% / "actual size" so the cards come out at their true 63 × 88 mm.

Double-click a card in the preview to remove one copy of it.

### Deck list formats

PTCG Live:

```
Pokémon: 2
2 Charizard ex OBF 125

Energy: 1
4 Basic {R} Energy SVE 2
```

RK9:

```
4 Dreepy (TWM-128_EN)
3 Boss's Orders (EN)
```

Lines without a set and number, such as RK9 trainers, are looked up by name.

## Running locally

Requires Node.js 20.19+ or 22.12+.

```
npm install
npm run dev
```

To make a production build in `dist/`:

```
npm run build
```

## Deployment

Pushing to `master` builds the app and publishes it to GitHub Pages through the workflow in `.github/workflows/static.yml`.

## Data sources

- Card search and set information: [TCGdex](https://tcgdex.dev)
- Card images: Scrydex and the Pokémon TCG API image hosts

## Disclaimer

This is an unofficial fan tool for making playtest proxies. It is not affiliated with, endorsed by or sponsored by Nintendo, Creatures, GAME FREAK or The Pokémon Company. Pokémon and all card images are the property of their respective owners. Proxies are for casual play and testing only and are not legal in sanctioned tournaments.
