# Peppa

Un gioco di carte Peppa implementato con React e Node.js, ottimizzato per dispositivi mobili.

## Caratteristiche

- Modalità singleplayer e multiplayer
- Tre livelli di difficoltà per i bot
- Tre modalità di gioco:
  - Classica: turni illimitati, punti > 100 finisce il gioco
  - Competitiva: 8 turni o punti > 100
  - Torneo: simile alla competitiva con regole diverse per il passaggio delle carte
- Sistema di autenticazione
- Leaderboard globale
- Statistiche personali
- Interfaccia responsive per dispositivi mobili
- Supporto per orientamento orizzontale su mobile

## Tecnologie Utilizzate

- Frontend:
  - React
  - Socket.IO Client
  - CSS3 con supporto mobile

- Backend:
  - Node.js
  - Express
  - Socket.IO
  - SQLite3
  - JWT per l'autenticazione

## Requisiti

- Node.js >= 14.x
- npm >= 6.x

## Installazione

1. Clona il repository:
```bash
git clone https://github.com/taiyooo/peppa.git
cd peppa
```

2. Installa le dipendenze del server:
```bash
cd server
npm install
```

3. Installa le dipendenze del client:
```bash
cd ../client
npm install
```

## Avvio

1. Avvia il server:
```bash
cd server
npm start
```

2. Avvia il client:
```bash
cd client
npm start
```

Il gioco sarà disponibile su `http://localhost:3000`

## Struttura del Progetto

```
peppa/
├── client/                 # Frontend React
│   ├── public/            # File statici
│   └── src/
│       ├── components/    # Componenti React
│       ├── styles/        # File CSS
│       └── App.js         # Componente principale
├── server/                # Backend Node.js
│   ├── server.js         # Server principale
│   └── peppa.db          # Database SQLite
└── README.md             # Documentazione
```

## Licenza

MIT License 