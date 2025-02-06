const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Serve the player page
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Serve the host page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let game = null;

class DominoGame {
    constructor(playerCount) {
        this.playerCount = playerCount;
        this.players = [];
        this.currentTurn = 0;
        this.board = [];
        this.deck = [];
        this.gameStarted = false;
        this.lastPlayedTime = Date.now();
        this.skipCount = 0;
        this.disconnectedPlayers = new Map(); // Store disconnected player states
        this.playerSockets = new Map(); // Store socket IDs for each player
        this.initialize();
    }

    initialize() {
        this.deck = this.generateDominoes();
        this.dealInitialTiles();
    }

    generateDominoes() {
        const tiles = [];
        for (let i = 0; i <= 6; i++) {
            for (let j = i; j <= 6; j++) {
                tiles.push([i, j]);
            }
        }
        return this.shuffleArray(tiles);
    }

    shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    dealInitialTiles() {
        const tilesPerPlayer = 7;
        this.hands = Array(this.playerCount).fill().map(() => 
            this.deck.splice(0, tilesPerPlayer)
        );
    }

    determineFirstTurn() {
        let maxDouble = -1;
        let startingPlayer = 0;

        // For 4 players, specifically look for 6-6
        if (this.playerCount === 4) {
            for (let i = 0; i < this.players.length; i++) {
                const hasDoubleSix = this.players[i].tiles.some(tile => 
                    tile[0] === 6 && tile[1] === 6
                );
                if (hasDoubleSix) {
                    this.currentTurn = i;
                    return;
                }
            }
        } 
        // For 2 players or if no 6-6 was found in 4 player game, find largest double
        for (let i = 0; i < this.players.length; i++) {
            const playerDoubles = this.players[i].tiles.filter(tile => 
                tile[0] === tile[1]
            );
            
            for (const double of playerDoubles) {
                if (double[0] > maxDouble) {
                    maxDouble = double[0];
                    startingPlayer = i;
                }
            }
        }

        // If no doubles found, keep default (0)
        if (maxDouble !== -1) {
            this.currentTurn = startingPlayer;
        }
    }

    handleDisconnect(socketId) {
        const playerIndex = this.players.findIndex(p => this.playerSockets.get(p.name) === socketId);
        if (playerIndex !== -1) {
            const player = this.players[playerIndex];
            this.disconnectedPlayers.set(player.name, {
                id: player.id,
                name: player.name,
                tiles: player.tiles,
                index: playerIndex
            });
        }
    }

    handleReconnect(playerName, socketId) {
        const savedPlayer = this.disconnectedPlayers.get(playerName);
        if (savedPlayer) {
            // Update socket ID
            this.playerSockets.set(playerName, socketId);
            // Remove from disconnected players
            this.disconnectedPlayers.delete(playerName);
            return savedPlayer;
        }
        return null;
    }

    addPlayer(name, socketId) {
        // Check for reconnection first
        const savedPlayer = this.handleReconnect(name, socketId);
        if (savedPlayer) {
            this.playerSockets.set(name, socketId);
            const player = this.players.find(p => p.name === name);
            if (player) {
                return player;
            }
            return savedPlayer;
        }

        if (this.players.length >= this.playerCount) {
            return null;
        }

        const playerId = this.players.length;
        const player = {
            id: playerId,
            name: name,
            tiles: this.hands[playerId]
        };
        
        this.players.push(player);
        this.playerSockets.set(name, socketId);
        
        if (this.players.length === this.playerCount) {
            this.gameStarted = true;
            // Determine first turn when all players have joined
            this.determineFirstTurn();
        }

        return player;
    }

    getValidPlacements(tile) {
        if (this.board.length === 0) {
            return [{
                end: 'right',
                flip: false
            }];
        }

        const validPlacements = [];
        const leftEnd = this.board[0][0];
        const rightEnd = this.board[this.board.length - 1][1];

        // Check left end matches
        if (tile[1] === leftEnd) {
            validPlacements.push({
                end: 'left',
                flip: false
            });
        }
        if (tile[0] === leftEnd) {
            validPlacements.push({
                end: 'left',
                flip: true
            });
        }

        // Check right end matches
        if (tile[0] === rightEnd) {
            validPlacements.push({
                end: 'right',
                flip: false
            });
        }
        if (tile[1] === rightEnd) {
            validPlacements.push({
                end: 'right',
                flip: true
            });
        }

        return validPlacements;
    }

    playTile(playerId, tile, end, flip) {
        if (!this.gameStarted || playerId !== this.currentTurn) {
            return { success: false, message: "Not your turn" };
        }

        const player = this.players[playerId];
        if (!player) {
            return { success: false, message: "Player not found" };
        }

        const tileIndex = player.tiles.findIndex(t => 
            t[0] === tile[0] && t[1] === tile[1]
        );

        if (tileIndex === -1) {
            return { success: false, message: "Tile not in hand" };
        }

        // Remove tile from player's hand
        player.tiles.splice(tileIndex, 1);

        // Add tile to the board in the correct orientation
        const playedTile = flip ? [tile[1], tile[0]] : tile;
        
        if (end === 'left') {
            this.board.unshift(playedTile);
        } else {
            this.board.push(playedTile);
        }

        this.lastPlayedTime = Date.now();
        this.skipCount = 0;

        if (player.tiles.length === 0) {
            return { 
                success: true, 
                gameOver: true, 
                winner: player.name,
                playedTile: playedTile,
                end: end,
                isDouble: playedTile[0] === playedTile[1],
                finalBoard: this.board
            };
        }

        this.nextTurn();
        return { 
            success: true,
            playedTile: playedTile,
            end: end,
            isDouble: playedTile[0] === playedTile[1]
        };
    }

    drawTile(playerId) {
        if (!this.gameStarted || playerId !== this.currentTurn) {
            return { success: false, message: "Not your turn" };
        }

        if (this.deck.length === 0) {
            return { success: false, message: "No tiles left to draw" };
        }

        const player = this.players[playerId];
        const tile = this.deck.pop();
        player.tiles.push(tile);

        return { success: true, tile };
    }

    skipTurn(playerId) {
        if (!this.gameStarted || playerId !== this.currentTurn) {
            return { success: false, message: "Not your turn" };
        }

        this.skipCount++;
        if (this.skipCount === this.playerCount) {
            const scores = this.players.map(player => ({
                name: player.name,
                score: player.tiles.reduce((sum, tile) => sum + tile[0] + tile[1], 0)
            }));
            const winner = scores.reduce((min, player) => 
                player.score < min.score ? player : min
            );
            return { 
                success: true, 
                gameOver: true, 
                winner: winner.name,
                blocked: true,
                finalBoard: this.board
            };
        }

        this.nextTurn();
        return { success: true };
    }

    nextTurn() {
        this.currentTurn = (this.currentTurn + 1) % this.playerCount;
    }

    getGameState() {
        return {
            playerCount: this.playerCount,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                tileCount: p.tiles.length
            })),
            currentTurn: this.currentTurn,
            board: this.board,
            gameStarted: this.gameStarted,
            deckCount: this.deck.length
        };
    }
}

io.on('connection', (socket) => {
    // Send initial game status
    if (game) {
        socket.emit('gameStatus', { 
            exists: true, 
            playerCount: game.playerCount,
            currentPlayers: game.players.length
        });
        socket.emit('gameState', game.getGameState());
    } else {
        socket.emit('gameStatus', { exists: false });
    }

    socket.on('initGame', (data) => {
        game = new DominoGame(data.playerCount);
        const gameState = game.getGameState();
        io.emit('gameInitialized', gameState);
        io.emit('gameStatus', { 
            exists: true, 
            playerCount: data.playerCount, 
            currentPlayers: 0 
        });
    });

    socket.on('joinGame', (data) => {
        if (!game) {
            socket.emit('error', { message: 'Game has not been initialized yet' });
            return;
        }

        const player = game.addPlayer(data.name, socket.id);
        if (!player) {
            socket.emit('error', { message: 'Could not join game' });
            return;
        }

        socket.emit('gameJoined', player);
        io.emit('playerJoined', { 
            id: player.id, 
            name: player.name,
            currentPlayers: game.players.length,
            totalPlayers: game.playerCount
        });

        if (game.gameStarted) {
            io.emit('gameState', game.getGameState());
            io.emit('turnUpdate', { 
                currentPlayer: game.currentTurn,
                canDraw: game.deck.length > 0
            });
        }
    });

    socket.on('getValidPlacements', (data) => {
        if (!game) return;
        const validPlacements = game.getValidPlacements(data.tile);
        socket.emit('validPlacements', validPlacements);
    });

socket.on('resetGame', () => {
        game = null;
        io.emit('gameReset');
        io.emit('gameStatus', { exists: false });
    });

socket.on('restartGame', () => {
        if (!game) return;
        
        // Store current players before creating new game
        const currentPlayers = game.players.map(player => ({
            name: player.name,
            socketId: game.playerSockets.get(player.name)
        }));
        const playerCount = game.playerCount;

        // First notify all players about restart
        io.emit('restartGame');

        // Create new game with same player count
        game = new DominoGame(playerCount);

        // Re-add all players to the new game
        currentPlayers.forEach(player => {
            const newPlayer = game.addPlayer(player.name, player.socketId);
            io.to(player.socketId).emit('gameJoined', newPlayer);
        });

        // Emit new game state
        const gameState = game.getGameState();
        io.emit('gameInitialized', gameState);
        io.emit('gameStatus', { 
            exists: true, 
            playerCount: playerCount, 
            currentPlayers: currentPlayers.length 
        });

        // Send turn update
        io.emit('turnUpdate', { 
            currentPlayer: game.currentTurn,
            canDraw: game.deck.length > 0
        });
    });

    socket.on('playTile', (data) => {
        if (!game) return;

        const result = game.playTile(data.playerId, data.tile, data.end, data.flip);
        if (!result.success) {
            socket.emit('error', { message: result.message });
            return;
        }

        io.emit('tilePlayed', { 
            tile: result.playedTile, 
            playerId: data.playerId,
            end: result.end,
            isDouble: result.isDouble
        });

        if (result.gameOver) {
            io.emit('gameOver', { 
                winner: result.winner,
                blocked: result.blocked || false,
                finalBoard: game.board
            });
            return;
        }

        io.emit('turnUpdate', { 
            currentPlayer: game.currentTurn,
            canDraw: game.deck.length > 0
        });

        io.emit('gameState', game.getGameState());
    });

    socket.on('drawTile', (data) => {
        if (!game) return;

        const result = game.drawTile(data.playerId);
        if (result.success) {
            socket.emit('tileDrawn', result.tile);
            io.emit('gameState', game.getGameState());
        } else {
            socket.emit('error', { message: result.message });
        }
    });

    socket.on('skipTurn', (data) => {
        if (!game) return;

        const result = game.skipTurn(data.playerId);
        if (!result.success) {
            socket.emit('error', { message: result.message });
            return;
        }

        if (result.gameOver) {
            io.emit('gameOver', { 
                winner: result.winner,
                blocked: result.blocked,
                finalBoard: game.board
            });
            return;
        }

        io.emit('turnUpdate', { 
            currentPlayer: game.currentTurn,
            canDraw: game.deck.length > 0
        });

        io.emit('gameState', game.getGameState());
    });

    socket.on('disconnect', () => {
        if (game) {
            game.handleDisconnect(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});