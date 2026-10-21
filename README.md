# DreamQuests

A mobile-first React + TypeScript quest / GTD app prototype.

## Run locally

1. Install Node.js (LTS) if you don't already have it.
2. Open this folder in VS Code.
3. Open the terminal in this folder and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL Vite prints, usually `http://localhost:5173/`.

## Included

- Capture inbox with local persistence
- Drag-and-drop sorting into Action, Project, and Reward buckets
- Project planning with multiple next actions and dependent locked follow-ups
- Active quest list with expandable follow-ups
- Logbook with a maximum of 25 ordinary ongoing quests
- Automatic follow-up unlock when its parent quest is completed
- Reward quests that cost 50 tokens, use separate unlimited logbook slots, and award one token on completion
- Mobile-first responsive design with fixed bottom navigation
- Local storage persistence

## Notes

- State is saved in this browser on this device using `localStorage`; it is not synced across devices.
- This is a browser app styled like an iPhone app, not yet a packaged iOS app.
- In Sort, desktop users can drag cards into buckets. Touch users can tap a card and then tap a bucket only after a card has been selected; the current basic prototype uses native drag state, so if you want a more polished mobile sort interaction, that can be added next.
