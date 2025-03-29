const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

// Inizializzazione del database
const db = new sqlite3.Database('peppa.db', (err) => {
  if (err) {
    console.error('Errore nella connessione al database:', err);
  } else {
    console.log('Connesso al database SQLite');
    initializeDatabase();
  }
});

// Inizializzazione delle tabelle
function initializeDatabase() {
  db.serialize(() => {
    // Tabella utenti
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabella statistiche
    db.run(`CREATE TABLE IF NOT EXISTS stats (
      user_id INTEGER PRIMARY KEY,
      games_played INTEGER DEFAULT 0,
      games_won INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
  });
}

// Middleware per verificare il token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token non fornito' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'hearts-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token non valido' });
    }
    req.user = user;
    next();
  });
};

// API per l'autenticazione
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username già in uso' });
          }
          return res.status(500).json({ error: 'Errore nella registrazione' });
        }
        
        // Crea le statistiche iniziali per l'utente
        db.run('INSERT INTO stats (user_id) VALUES (?)', [this.lastID]);
        
        res.status(201).json({ message: 'Utente registrato con successo' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Errore nella registrazione' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Errore nel login' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, 
      process.env.JWT_SECRET || 'hearts-secret-key',
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username });
  });
});

// API per il leaderboard
app.get('/api/leaderboard', (req, res) => {
  db.all(`
    SELECT u.username, s.games_played, s.games_won,
           ROUND(CAST(s.games_won AS FLOAT) / s.games_played * 100, 1) as win_rate
    FROM users u
    JOIN stats s ON u.id = s.user_id
    WHERE s.games_played > 0
    ORDER BY s.games_won DESC, s.games_played ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Errore nel recupero del leaderboard' });
    }
    res.json(rows);
  });
});

// API per le statistiche personali
app.get('/api/stats', authenticateToken, (req, res) => {
  db.get(`
    SELECT s.games_played, s.games_won,
           ROUND(CAST(s.games_won AS FLOAT) / s.games_played * 100, 1) as win_rate
    FROM stats s
    WHERE s.user_id = ?
  `, [req.user.id], (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
    }
    res.json(stats);
  });
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Classe per gestire il mazzo di carte
class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    this.cards = [];
    for (const suit of suits) {
      for (const value of values) {
        this.cards.push({ suit, value });
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(numCards) {
    return this.cards.splice(0, numCards);
  }
}

// Classe per gestire una partita
class Game {
  constructor() {
    this.players = new Map();
    this.deck = new Deck();
    this.currentMano = [];
    this.heartsBroken = false;
    this.currentPlayer = null;
    this.scores = new Map();
    this.passingDirection = 'left'; // left, right, across, none
    this.firstPlayerSelected = false;
    this.winner = null;
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, {
      name,
      hand: [],
      score: 0
    });
    this.scores.set(socketId, 0);
  }

  startGame() {
    this.deck.reset();
    this.deck.shuffle();
    
    // Distribuisci 13 carte a ogni giocatore
    for (const player of this.players.values()) {
      player.hand = this.deck.deal(13);
    }

    // Trova il giocatore con il 2 di fiori per iniziare
    for (const [socketId, player] of this.players.entries()) {
      if (player.hand.some(card => card.suit === 'clubs' && card.value === '2')) {
        this.currentPlayer = socketId;
        break;
      }
    }

    this.currentMano = [];
    this.heartsBroken = false;
  }

  playCard(socketId, card) {
    if (socketId !== this.currentPlayer) return false;
    
    const player = this.players.get(socketId);
    if (!player) return false;

    // Verifica se la carta è nella mano del giocatore
    const cardIndex = player.hand.findIndex(c => 
      c.suit === card.suit && c.value === card.value
    );
    
    if (cardIndex === -1) return false;

    // Verifica le regole di gioco
    if (this.currentMano.length === 0) {
      // Prima carta della mano
      if (this.currentMano.length === 0 && card.suit === 'hearts' && !this.heartsBroken) {
        return false;
      }
    } else {
      // Verifica se il giocatore deve seguire il seme
      const leadSuit = this.currentMano[0].suit;
      if (player.hand.some(c => c.suit === leadSuit) && card.suit !== leadSuit) {
        return false;
      }
    }

    // Rimuovi la carta dalla mano del giocatore
    player.hand.splice(cardIndex, 1);
    this.currentMano.push(card);

    // Aggiorna lo stato del gioco
    if (card.suit === 'hearts') this.heartsBroken = true;

    // Determina il prossimo giocatore
    const playerIds = Array.from(this.players.keys());
    const currentIndex = playerIds.indexOf(socketId);
    this.currentPlayer = playerIds[(currentIndex + 1) % playerIds.length];

    return true;
  }

  evaluateMano() {
    if (this.currentMano.length !== 4) return null;

    const leadSuit = this.currentMano[0].suit;
    let winningCard = this.currentMano[0];
    let winningIndex = 0;

    for (let i = 1; i < 4; i++) {
      const card = this.currentMano[i];
      if (card.suit === leadSuit && this.compareCards(card, winningCard) > 0) {
        winningCard = card;
        winningIndex = i;
      }
    }

    const playerIds = Array.from(this.players.keys());
    const winner = playerIds[winningIndex];
    
    // Calcola i punti della mano
    let points = 0;
    for (const card of this.currentMano) {
      if (card.suit === 'hearts') {
        switch(card.value) {
          case 'A':
            points += 5;
            break;
          case 'K':
            points += 4;
            break;
          case 'Q':
            points += 3;
            break;
          case 'J':
            points += 2;
            break;
          default:
            points += 1;
        }
      }
      if (card.suit === 'spades' && card.value === 'Q') points += 13;
    }

    // Aggiorna il punteggio del vincitore
    this.scores.set(winner, this.scores.get(winner) + points);

    // Verifica la condizione di Volata (36 punti)
    if (this.scores.get(winner) === 36) {
      // Il giocatore che ha fatto la Volata riceve 0 punti
      this.scores.set(winner, 0);
      // Tutti gli altri giocatori ricevono 36 punti
      for (const [playerId, score] of this.scores.entries()) {
        if (playerId !== winner) {
          this.scores.set(playerId, score + 36);
        }
      }
    }

    // Pulisci la mano corrente
    this.currentMano = [];
    this.currentPlayer = winner;

    // Aggiorna il vincitore della partita
    this.winner = winner;

    return { winner, points };
  }

  compareCards(card1, card2) {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return values.indexOf(card1.value) - values.indexOf(card2.value);
  }

  isGameOver() {
    const isOver = Array.from(this.players.values()).every(player => player.hand.length === 0);
    
    if (isOver && this.winner) {
      // Aggiorna le statistiche nel database
      db.run(`
        UPDATE stats 
        SET games_played = games_played + 1,
            games_won = games_won + 1
        WHERE user_id = ?
      `, [this.winner]);
    }

    return isOver;
  }
}

// Gestione delle partite attive
const games = new Map();

io.on('connection', (socket) => {
  console.log('Nuovo client connesso:', socket.id);

  socket.on('createGame', ({ playerName, gameMode, difficulty, numBots, token }) => {
    // Verifica il token
    jwt.verify(token, process.env.JWT_SECRET || 'hearts-secret-key', (err, user) => {
      if (err) {
        socket.emit('error', { message: 'Token non valido' });
        return;
      }

      const game = new Game();
      game.gameId = socket.id;
      game.setGameMode(gameMode);
      game.addPlayer(socket.id, playerName);
      
      if (gameMode === 'singleplayer') {
        for (let i = 0; i < numBots; i++) {
          game.addBot(difficulty);
        }
      }
      
      games.set(socket.id, game);
      socket.emit('gameCreated', { 
        gameId: socket.id,
        gameMode,
        passingDirection: game.getPassingDirection()
      });
    });
  });

  socket.on('joinGame', (gameId) => {
    const game = games.get(gameId);
    if (game && game.players.size < 4) {
      game.addPlayer(socket.id, `Player ${game.players.size + 1}`);
      socket.join(gameId);
      
      if (game.players.size === 4) {
        game.startGame();
        io.to(gameId).emit('gameStarted', {
          players: Array.from(game.players.entries()).map(([id, player]) => ({
            id,
            name: player.name,
            hand: player.hand
          })),
          currentPlayer: game.currentPlayer
        });
      }
    }
  });

  socket.on('playCard', ({ gameId, card }) => {
    const game = games.get(gameId);
    if (game && game.playCard(socket.id, card)) {
      const manoResult = game.evaluateMano();
      
      if (manoResult) {
        io.to(gameId).emit('manoComplete', {
          mano: game.currentMano,
          winner: manoResult.winner,
          points: manoResult.points,
          scores: Array.from(game.scores.entries())
        });

        if (game.isGameOver()) {
          io.to(gameId).emit('gameOver', {
            finalScores: Array.from(game.scores.entries())
          });
        } else {
          io.to(gameId).emit('nextTurn', {
            currentPlayer: game.currentPlayer
          });
        }
      } else {
        io.to(gameId).emit('cardPlayed', {
          player: socket.id,
          card,
          currentPlayer: game.currentPlayer
        });
      }
    }
  });

  socket.on('disconnect', () => {
    // Gestione della disconnessione
    for (const [gameId, game] of games.entries()) {
      if (game.players.has(socket.id)) {
        game.players.delete(socket.id);
        if (game.players.size === 0) {
          games.delete(gameId);
        } else {
          io.to(gameId).emit('playerLeft', { playerId: socket.id });
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT}`);
}); 