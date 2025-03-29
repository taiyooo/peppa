import React, { useState, useEffect } from 'react';
import './Leaderboard.css';

const Leaderboard = ({ token }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [personalStats, setPersonalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
    fetchPersonalStats();
  }, [token]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/leaderboard');
      if (!response.ok) throw new Error('Errore nel caricamento del leaderboard');
      const data = await response.json();
      setLeaderboard(data);
    } catch (err) {
      setError('Errore nel caricamento del leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonalStats = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Errore nel caricamento delle statistiche personali');
      const data = await response.json();
      setPersonalStats(data);
    } catch (err) {
      setError('Errore nel caricamento delle statistiche personali');
    }
  };

  if (loading) return <div className="loading">Caricamento...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="leaderboard-container">
      <div className="personal-stats">
        <h2>Le tue statistiche</h2>
        {personalStats && (
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Partite giocate</span>
              <span className="stat-value">{personalStats.games_played}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Partite vinte</span>
              <span className="stat-value">{personalStats.games_won}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Percentuale vittorie</span>
              <span className="stat-value">{personalStats.win_rate}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="global-leaderboard">
        <h2>Classifica Globale</h2>
        <div className="leaderboard-table">
          <div className="table-header">
            <div className="rank">Posizione</div>
            <div className="username">Username</div>
            <div className="stats">Partite</div>
            <div className="stats">Vittorie</div>
            <div className="stats">% Vittorie</div>
          </div>
          {leaderboard.map((player, index) => (
            <div key={player.username} className="table-row">
              <div className="rank">{index + 1}</div>
              <div className="username">{player.username}</div>
              <div className="stats">{player.games_played}</div>
              <div className="stats">{player.games_won}</div>
              <div className="stats">{player.win_rate}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard; 