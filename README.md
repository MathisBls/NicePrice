# NicePrice

Compare game prices across 30+ stores directly inside the Steam client. See the best retail and keyshop deals at a glance, powered by [GG.deals](https://gg.deals/).

## Features

- Best retail and keyshop prices on every game page
- Historical lowest prices
- Direct links to GG.deals for full deal listings
- Works in both Steam Library and Store pages
- Auto-adapts to any Steam theme (reads colors from the DOM at runtime)
- Your API key stays local — stored in `settings.json`, never sent anywhere except GG.deals

## Installation

1. Install [Millennium](https://steambrew.app/)
2. Clone this repo into your Millennium plugins folder:
   ```
   C:\Program Files (x86)\Steam\plugins\NicePrice
   ```
3. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
4. Restart Steam
5. Open NicePrice settings and add your GG.deals API key

## API Key

NicePrice uses the [GG.deals API](https://gg.deals/api/) which requires a free API key:

1. Go to [gg.deals/api](https://gg.deals/api/)
2. Create an account and confirm your email
3. Copy your API key
4. Paste it in the NicePrice settings panel inside Steam

The key is stored locally in `settings.json` inside the plugin folder. It is never shared with anyone other than GG.deals.

## Project Structure

```
NicePrice/
  plugin.json             Millennium manifest
  package.json            Dependencies and build scripts
  backend/
    main.lua              API calls, settings persistence
  frontend/
    index.tsx             Library widget (SharedJSContext)
  webkit/
    index.tsx             Store page widget (browser context)
```

## Credits

- Price data by [GG.deals](https://gg.deals/)
- Built on [Millennium](https://steambrew.app/)

## License

MIT
