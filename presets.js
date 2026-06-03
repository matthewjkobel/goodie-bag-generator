// presets.js — First-wave prebuilt themed bags (PRD §17 / runbook §4A).
// ---------------------------------------------------------------------------
// This file is the SOURCE OF TRUTH for what's in each preset. Imported by
// api/cron-warm.js, which:
//   1. Warms each item's searchQuery into the same gbg:product:* cache that
//      /api/enrich.js reads from.
//   2. Rebuilds the fully-enriched bag and stores it at gbg:preset:<key> so
//      /api/preset.js can serve it instantly in one round trip.
//
// Item shape MUST match the live AI-generated shape (see the EXAMPLE OUTPUT
// in App.jsx's prompt, and CAT_META for valid categories):
//   { name, emoji, description, unitCostLow, unitCostHigh, quantity,
//     searchQuery, category }
//
// Category notes:
//   - First item is the bag itself, category: "bag".
//   - Exactly one non-bag item should have category: "hero" (the anchor).
//   - Other items use their normal category (activity, stationery, toy, ...).
//
// Pricing notes (unitCostLow/High):
//   - These are FALLBACK estimates only. Per the Phase 1 pricing fix, enriched
//     items show real packPrice in the UI; the per-unit number is only a quiet
//     gray fallback shown if enrichment misses. Ranges below are sensible
//     placeholders for licensed bulk favor items.
//
// Licensing risk:
//   - Pokémon, Super Mario, Spider-Man are flagged high counterfeit-risk in the
//     curation notes (goodie-bag-presets.json). The cron does NOT enforce
//     licensing — it just stores what comes back. Periodic human spot-check of
//     each preset bag (does the returned title say "Officially licensed"?) is
//     a separate maintenance task.
// ---------------------------------------------------------------------------

export const PRESETS = {
  bluey: {
    theme: "Bluey Backyard Party Bag",
    tagline: "Wackadoo! Everything for a real-life Bluey party.",
    packagingTip: "Use the themed Bluey favor bags as the container itself, or pack into clear cello bags tied with blue and orange curly ribbon to match Bluey and Bingo.",
    teacherTip: "Bluey activity packs double as quiet-time classroom rewards. Note: small parts in the stamper/erasers are not for under 3s.",
    funActivity: "Play 'Keepy Uppy' — keep one balloon off the floor; last kid touching it wins.",
    items: [
      { name: "Bluey Themed Favor Bags", emoji: "🛍️", description: "Officially licensed Bluey bags — kids keep the bag too, so it's part of the gift.", unitCostLow: 0.60, unitCostHigh: 1.10, quantity: 1, searchQuery: "Bluey party favor goodie bags bulk", category: "bag" },
      { name: "Bluey Activity Pack", emoji: "⭐", description: "Mini sketch book, stickers, and a stamper — keeps Bluey fans busy long after the party.", unitCostLow: 0.90, unitCostHigh: 1.50, quantity: 1, searchQuery: "Bluey activity packs party favors bulk", category: "hero" },
      { name: "Bluey Play Pack", emoji: "🎨", description: "Coloring pad, mini crayons, and a sticker — ready to grab and go.", unitCostLow: 0.85, unitCostHigh: 1.40, quantity: 1, searchQuery: "Bluey play packs grab and go coloring crayons", category: "activity" },
      { name: "Bluey Pens with Sticker Sheets", emoji: "✏️", description: "Bluey pens paired with sticker sheets for any little Bluey artist.", unitCostLow: 0.70, unitCostHigh: 1.20, quantity: 1, searchQuery: "Bluey pens stickers party favors set", category: "stationery" },
      { name: "Bluey Pencils and Erasers", emoji: "✏️", description: "Mechanical pencils with shaped erasers — survive a backpack.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Bluey pencils erasers party favors bulk", category: "stationery" },
      { name: "Bluey Sticker Sheets", emoji: "⭐", description: "Classic sticker fun, Bluey and Bingo edition.", unitCostLow: 0.20, unitCostHigh: 0.40, quantity: 1, searchQuery: "Bluey sticker sheets party favors", category: "craft" },
    ],
  },

  "paw-patrol": {
    theme: "Paw Patrol Pup Pack",
    tagline: "No job too big — no party too small.",
    packagingTip: "The reusable Paw Patrol mini totes ARE the goodie bag — kids keep the bag too. Tie with red curling ribbon to match Marshall.",
    teacherTip: "A 25-pack of Paw Patrol sensory dough stretches across a whole classroom and is non-candy. Note: favor-box small parts not for under 3.",
    funActivity: "'Pup Pup Boogie' freeze-dance — pause the music, everyone freezes in a rescue pose.",
    items: [
      { name: "Paw Patrol Reusable Mini Tote", emoji: "🛍️", description: "Officially licensed tote with Chase, Marshall, Skye, and Rubble — the bag IS the favor.", unitCostLow: 1.20, unitCostHigh: 2.20, quantity: 1, searchQuery: "Paw Patrol party favor goodie bags totes bulk", category: "bag" },
      { name: "Paw Patrol Play Pack", emoji: "⭐", description: "Coloring book, crayons, and a sticker — kid-proof and ready to grab.", unitCostLow: 0.90, unitCostHigh: 1.50, quantity: 1, searchQuery: "Paw Patrol play packs grab and go", category: "hero" },
      { name: "Paw Patrol Favor Box", emoji: "🎁", description: "Surprise box with stickers, tattoos, or a self-inking stamper inside.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Paw Patrol party favor boxes stickers tattoos stampers", category: "activity" },
      { name: "Paw Patrol Sensory Dough", emoji: "🎨", description: "Mini tub of colorful dough — non-candy, classroom-safe favorite.", unitCostLow: 0.80, unitCostHigh: 1.40, quantity: 1, searchQuery: "Paw Patrol dough party pack", category: "toy" },
      { name: "Paw Patrol Sticker Sheets", emoji: "⭐", description: "Sheets of rescue-pup stickers for water bottles, notebooks, anything.", unitCostLow: 0.20, unitCostHigh: 0.40, quantity: 1, searchQuery: "Paw Patrol sticker sheets party favors", category: "craft" },
      { name: "Paw Patrol Temporary Tattoos", emoji: "💪", description: "Easy on, easy off — kids love wearing them home as 'proof' they were there.", unitCostLow: 0.15, unitCostHigh: 0.30, quantity: 2, searchQuery: "Paw Patrol temporary tattoos kids bulk", category: "toy" },
    ],
  },

  spidey: {
    theme: "Spidey Team-Up Bag",
    tagline: "Go webs! Suit up your whole crew.",
    packagingTip: "Red Spider-Man mini totes as the container; add a web of white curling ribbon for the spider effect.",
    teacherTip: "Spidey sticker and tattoo sheets split easily into individual rewards. Marvel licensing is heavily counterfeited — verify 'Officially licensed Marvel' on every item.",
    funActivity: "'Web slinger' target toss — toss yarn balls at a paper spider web taped to the wall.",
    items: [
      { name: "Spider-Man Reusable Mini Tote", emoji: "🛍️", description: "Officially licensed Marvel mini tote — the bag IS the favor.", unitCostLow: 1.20, unitCostHigh: 2.20, quantity: 1, searchQuery: "Spiderman party favor goodie bags totes bulk", category: "bag" },
      { name: "Spidey Activity Pack", emoji: "⭐", description: "Mini coloring book, crayons, and a loot bag — instant Spidey kit.", unitCostLow: 1.10, unitCostHigh: 1.80, quantity: 1, searchQuery: "Spiderman activity packs coloring crayons party favors", category: "hero" },
      { name: "Spidey Stickers and Tattoos Set", emoji: "💪", description: "Sticker sheets plus temporary tattoos — Spidey, Ghost-Spider, Miles, and friends.", unitCostLow: 0.60, unitCostHigh: 1.00, quantity: 1, searchQuery: "Spidey stickers tattoos party favors set", category: "craft" },
      { name: "Spider-Man Favor Box", emoji: "🎁", description: "Surprise box with stickers, tattoos, or a self-inking stamper inside.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Spiderman party favor boxes stickers tattoos stampers", category: "activity" },
      { name: "Spidey and Friends Sticker Sheets", emoji: "⭐", description: "Peter Parker, Miles Morales, and Gwen — the whole team.", unitCostLow: 0.20, unitCostHigh: 0.40, quantity: 1, searchQuery: "Spidey Amazing Friends sticker sheets", category: "craft" },
      { name: "Spider-Man Temporary Tattoos", emoji: "💪", description: "Web-slinger tattoos kids love showing off all week.", unitCostLow: 0.15, unitCostHigh: 0.30, quantity: 2, searchQuery: "Spider-Man temporary tattoos kids bulk", category: "toy" },
    ],
  },

  minecraft: {
    theme: "Minecraft Creeper Crate",
    tagline: "Mine, craft, and hand out the loot.",
    packagingTip: "Use the Minecraft paper favor bags, or kraft bags with a printed Creeper-face label.",
    teacherTip: "One favor-box set splits into 60 individual classroom rewards. Watch for 'pixel' generic listings — for a true Minecraft preset confirm the listing says 'Officially licensed Minecraft.'",
    funActivity: "Hide paper diamond-ore squares around the room and run a quick scavenger hunt.",
    items: [
      { name: "Minecraft Paper Favor Bag", emoji: "🛍️", description: "Licensed Minecraft paper bag with sticker sheet — bag and a bonus rolled in.", unitCostLow: 0.70, unitCostHigh: 1.30, quantity: 1, searchQuery: "Minecraft party favor bags stickers bulk", category: "bag" },
      { name: "Minecraft Play Pack", emoji: "⭐", description: "Coloring pad, crayons, and a sticker — pixel adventures included.", unitCostLow: 0.90, unitCostHigh: 1.50, quantity: 1, searchQuery: "Minecraft play packs activity coloring party favors", category: "hero" },
      { name: "Minecraft Favor Box", emoji: "🎁", description: "Surprise box with stickers, tattoos, or a stamper inside.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Minecraft party favor boxes stickers tattoos stampers", category: "activity" },
      { name: "Minecraft Sticker Sheets", emoji: "⭐", description: "Creeper, Steve, and the gang — for notebooks, water bottles, and lunchboxes.", unitCostLow: 0.20, unitCostHigh: 0.40, quantity: 1, searchQuery: "Minecraft sticker sheets party favors bulk", category: "craft" },
      { name: "Minecraft Temporary Tattoos", emoji: "💪", description: "Pixel-art tattoos kids love showing off at recess.", unitCostLow: 0.15, unitCostHigh: 0.30, quantity: 2, searchQuery: "Minecraft temporary tattoos kids bulk", category: "toy" },
      { name: "Minecraft Pencils and Erasers", emoji: "✏️", description: "Mechanical pencils with shaped erasers — survive a backpack.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Minecraft pencils erasers party favors", category: "stationery" },
    ],
  },

  pokemon: {
    theme: "Pokemon Trainer Loot Bag",
    tagline: "Gotta hand 'em all out.",
    packagingTip: "Pokemon plastic favor bags or Hallmark Pokemon mini gift bags; seal with a Poke Ball sticker.",
    teacherTip: "Eraser and pencil sets are reusable, non-candy, and survive a backpack — ideal classroom rewards. Pokemon licensing is heavily counterfeited; only buy from listings that say 'Officially licensed.'",
    funActivity: "Play 'Who's That Pokemon?' — silhouette printouts, kids shout the answer.",
    items: [
      { name: "Pokemon Favor Bags", emoji: "🛍️", description: "Officially licensed plastic favor bags — Pikachu, Charizard, Gengar, Eevee.", unitCostLow: 0.50, unitCostHigh: 1.00, quantity: 1, searchQuery: "Pokemon party favor goodie bags bulk", category: "bag" },
      { name: "Pokemon Coloring Activity Pack", emoji: "⭐", description: "Coloring book, jumbo crayons, and a trading card in a resealable pouch.", unitCostLow: 1.20, unitCostHigh: 2.00, quantity: 1, searchQuery: "Pokemon coloring activity packs party favors", category: "hero" },
      { name: "Pokemon Eraser Set with Cards", emoji: "🎁", description: "Shaped erasers (Charmander, Bulbasaur, Squirtle, Pokeball) plus trading cards and stickers.", unitCostLow: 0.80, unitCostHigh: 1.40, quantity: 1, searchQuery: "Pokemon erasers party favor set cards stickers", category: "toy" },
      { name: "Pokemon Pencils and Erasers", emoji: "✏️", description: "Mechanical pencils with shaped erasers — Pikachu, Gengar, Charizard.", unitCostLow: 0.60, unitCostHigh: 1.10, quantity: 1, searchQuery: "Pokemon mechanical pencils erasers party favors bulk", category: "stationery" },
      { name: "Pokemon Stampers and Pencils", emoji: "✏️", description: "Reusable stampers paired with pencils — survive years of after-school crafts.", unitCostLow: 0.70, unitCostHigh: 1.30, quantity: 1, searchQuery: "Pokemon stampers pencils party favors", category: "stationery" },
      { name: "Pokemon Temporary Tattoos", emoji: "💪", description: "70-count sheet — pick a favorite Pokemon to wear all week.", unitCostLow: 0.15, unitCostHigh: 0.30, quantity: 2, searchQuery: "Pokemon temporary tattoos party favors bulk", category: "toy" },
    ],
  },

  "super-mario": {
    theme: "Super Mario Power-Up Bag",
    tagline: "Let's-a go — grab a power-up.",
    packagingTip: "Mario goodie bags, or question-block / brick treat boxes for a real power-up look.",
    teacherTip: "One favor-box set splits into 60 individual sticker or stamper rewards. Watch for generic 'Super Bros' listings — confirm 'Officially licensed Super Mario.'",
    funActivity: "'Jump on the Goomba' — stomp printed Goomba sheets in a timed relay.",
    items: [
      { name: "Super Mario Goodie Bags", emoji: "🛍️", description: "Officially licensed Mario favor bags — the container that fits the theme.", unitCostLow: 0.60, unitCostHigh: 1.10, quantity: 1, searchQuery: "Super Mario party favor goodie bags bulk", category: "bag" },
      { name: "Super Mario Favor Box", emoji: "⭐", description: "Surprise box with Mario stickers and a self-inking stamper inside.", unitCostLow: 0.50, unitCostHigh: 0.90, quantity: 1, searchQuery: "Super Mario party favor boxes stickers stampers", category: "hero" },
      { name: "Mario Character Erasers", emoji: "🎁", description: "Shaped erasers — Mario, Luigi, Princess Peach, Bowser — plus a sticker sheet.", unitCostLow: 0.80, unitCostHigh: 1.40, quantity: 1, searchQuery: "Super Mario erasers party favor set stickers", category: "toy" },
      { name: "Super Mario Sticker Sheets", emoji: "⭐", description: "Sheets of Mushroom Kingdom stickers for backpacks and notebooks.", unitCostLow: 0.20, unitCostHigh: 0.40, quantity: 1, searchQuery: "Super Mario sticker sheets party favors bulk", category: "craft" },
      { name: "Super Mario Temporary Tattoos", emoji: "💪", description: "Mario-themed tattoos kids love wearing to school.", unitCostLow: 0.15, unitCostHigh: 0.30, quantity: 2, searchQuery: "Super Mario temporary tattoos kids bulk", category: "toy" },
      { name: "Super Mario Notepads and Pencils", emoji: "✏️", description: "Mini notepads plus pencils — confirm officially licensed Super Mario, not generic.", unitCostLow: 0.60, unitCostHigh: 1.10, quantity: 1, searchQuery: "Super Mario notepads pencils party favors", category: "stationery" },
    ],
  },
};

// Flat list of every unique searchQuery the cron needs to keep warm,
// derived from the presets above. Combined with the generic warm list
// (see GENERIC_QUERIES in api/cron-warm.js) to form the full warm pool.
export const PRESET_QUERIES = [
  ...new Set(
    Object.values(PRESETS).flatMap(p => p.items.map(i => i.searchQuery))
  ),
];
