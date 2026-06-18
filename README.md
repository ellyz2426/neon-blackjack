# Neon Blackjack VR

A feature-rich Blackjack game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK) — playable in both browser and VR.

**[Play Now](https://ellyz2426.github.io/neon-blackjack/)**

## Features

### Gameplay
- **8 Game Modes**: Classic, Speed Round, High Stakes, Counting Trainer, Daily Challenge, Survival, Tournament, Practice
- **Full Blackjack Rules**: Hit, Stand, Double Down, Split, Insurance
- **6-Deck Shoe** with configurable deck count (1-8)
- **Card Counting Trainer** with running count, true count, and betting advice
- **Daily Challenge**: Seeded hands — same for everyone each day
- **Survival Mode**: 3 lives, see how far you can go
- **Tournament Mode**: 10 rounds, score-based ranking
- **Practice Mode**: Unlimited bank for learning

### Progression
- **80 Achievements** across multiple categories
- **XP & Leveling System** with 15 level titles
- **8 Card Back Skins** unlocked via win milestones
- **5 Visual Themes**: Neon Holodeck, Crimson Casino, Golden Royale, Void Lounge, Emerald Table
- **Leaderboard** tracking best bank balances
- **Detailed Career Statistics**: win rate, biggest win, best streak, and more

### Visual & Audio
- **Neon Casino Environment** — holodeck-style room with accent lighting and fog
- **Animated Card Dealing** — smooth 3D card animations with particle bursts
- **3D Playing Cards** with suit indicators and neon borders
- **Procedural Audio** — ambient drone, deal/hit/bust/win/blackjack SFX
- **Particle Effects** — deal sparks, win/bust celebrations, ambient floating particles
- **Floating Ring Decorations** — gentle bob and rotate animations
- **16 PanelUI Spatial Panels** — all UI is spatial, no HTML overlays

### Controls
| Input | Action |
|-------|--------|
| Click / VR Trigger | Select buttons |
| H | Hit |
| S | Stand |
| D | Double Down |
| P | Split |
| ESC | Pause |

### Technical
- Built with IWSDK 0.4.x on Three.js + ECS
- Single-file architecture (~1,840 LOC)
- All UI via PanelUI/uikitml — zero HTML overlays
- XR controller support via PanelUI laser interaction
- localStorage persistence for all progress
- Procedural audio (no external audio files)
- Deployed via GitHub Pages

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
```

## License

MIT
