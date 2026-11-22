# RollCall web app

React + TypeScript + Vite, with Mantine for the UI. It talks to the API in `../api`.

```bash
npm ci
VITE_API_URL=http://localhost:3000 npm run dev   # http://localhost:5173
npm run build                                    # typecheck + production build
```

- `src/lib/api.ts`: the API client (adds the login token, turns errors into `ApiError`).
- `src/lib/socket.ts`: live exam-day updates over Socket.IO.
- `src/pages/`: one file per route (see `src/App.tsx`). Roles are per course offering, so everyone shares one dashboard and each page asks the API what you can do there.
- `src/components/SeatMap.tsx`: draws a room's seats. Used for editing rooms, the student's seat view and the proctor's live seating chart.
- `src/components/CardScanner.tsx`: scans the barcode on a student ID card with the phone camera. This only works over HTTPS or on localhost.

UI tests live in `../e2e`.
