import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:5000');

function App() {
  const [gameState, setGameState] = useState({
    gameId: null,
    players: [],
    currentPlayer: null,
    hand: [],
    currentMano: [],
    scores: new Map(),
    gameStarted: false,
    gameOver: false
  });

  const [playerName, setPlayerName] = useState('');
  const [gameId, setGameId] = useState('');
  const [joinMode, setJoinMode] = useState(false);

  useEffect(() => {
    socket.on('gameCreated', ({ gameId }) => {
      setGameState(prev => ({ ...prev, gameId }));
    });

    socket.on('gameStarted', ({ players, currentPlayer }) => {
      setGameState(prev => ({
        ...prev,
        players,
        currentPlayer,
        gameStarted: true
      }));
    });

    socket.on('cardPlayed', ({ player, card, currentPlayer }) => {
      setGameState(prev => ({
        ...prev,
        currentMano: [...prev.currentMano, { player, card }],
        currentPlayer
      }));
    });

    socket.on('manoComplete', ({ mano, winner, points, scores }) => {
      setGameState(prev => ({
        ...prev,
        currentMano: [],
        scores: new Map(scores)
      }));
    });

    socket.on('gameOver', ({ finalScores }) => {
      setGameState(prev => ({
        ...prev,
        gameOver: true,
        scores: new Map(finalScores)
      }));
    });

    socket.on('playerLeft', ({ playerId }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId)
      }));
    });

    return () => {
      socket.off('gameCreated');
      socket.off('gameStarted');
      socket.off('cardPlayed');
      socket.off('manoComplete');
      socket.off('gameOver');
      socket.off('playerLeft');
    };
  }, []);

  const createGame = () => {
    if (playerName.trim()) {
      socket.emit('createGame', playerName);
      setJoinMode(false);
    }
  };

  const joinGame = () => {
    if (playerName.trim() && gameId.trim()) {
      socket.emit('joinGame', gameId);
      setJoinMode(true);
    }
  };

  const playCard = (card) => {
    if (gameState.currentPlayer === socket.id) {
      socket.emit('playCard', {
        gameId: gameState.gameId,
        card
      });
    }
  };

  const renderCard = (card) => {
    const suitSymbols = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠'
    };

    const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black';

    return (
      <div
        key={`${card.suit}-${card.value}`}
        className={`card ${color} ${gameState.currentPlayer === socket.id ? 'playable' : ''}`}
        onClick={() => gameState.currentPlayer === socket.id && playCard(card)}
      >
        {card.value} {suitSymbols[card.suit]}
      </div>
    );
  };

  const renderGameSetup = () => (
    <div className="game-setup">
      <h2>Hearts Game</h2>
      <input
        type="text"
        placeholder="Il tuo nome"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />
      {!joinMode ? (
        <>
          <button onClick={createGame}>Crea Partita</button>
          <button onClick={() => setJoinMode(true)}>Unisciti a una Partita</button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="ID Partita"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
          <button onClick={joinGame}>Unisciti</button>
          <button onClick={() => setJoinMode(false)}>Torna indietro</button>
        </>
      )}
    </div>
  );

  const renderGame = () => (
    <div className="game">
      <div className="players">
        {gameState.players.map((player) => (
          <div
            key={player.id}
            className={`player ${player.id === socket.id ? 'current' : ''} ${
              player.id === gameState.currentPlayer ? 'active' : ''
            }`}
          >
            <h3>{player.name}</h3>
            <div className="hand">
              {player.id === socket.id
                ? gameState.hand.map(renderCard)
                : Array(player.hand.length).fill('🂠')}
            </div>
          </div>
        ))}
      </div>

      <div className="current-mano">
        <h3>Mano Corrente</h3>
        <div className="mano-cards">
          {gameState.currentMano.map(({ player, card }) => (
            <div key={`${player}-${card.suit}-${card.value}`} className="mano-card">
              {renderCard(card)}
            </div>
          ))}
        </div>
      </div>

      <div className="scores">
        <h3>Punteggi</h3>
        {Array.from(gameState.scores.entries()).map(([playerId, score]) => (
          <div key={playerId}>
            {gameState.players.find(p => p.id === playerId)?.name}: {score}
          </div>
        ))}
      </div>

      {gameState.gameOver && (
        <div className="game-over">
          <h2>Partita Finita!</h2>
          <button onClick={() => window.location.reload()}>Nuova Partita</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="App">
      {!gameState.gameStarted ? renderGameSetup() : renderGame()}
    </div>
  );
}

export default App; 