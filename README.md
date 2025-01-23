# Blockchain-Based Voting System

A decentralized electronic voting system built on blockchain technology, ensuring transparency, security, and immutability of votes.

## Features

- 🔒 Secure voting using blockchain technology
- 🌐 Decentralized P2P network architecture
- 🔗 Real-time vote synchronization across nodes
- 👤 Voter authentication using cryptographic hashing
- 📊 Live vote counting and results
- 🛡️ Prevention of double voting
- 💻 Modern and responsive web interface

## Technology Stack

- Node.js
- TypeScript
- Express.js
- WebSocket (ws)
- Bootstrap 5
- Crypto (SHA-256)

## Prerequisites

Before running the application, make sure you have the following installed:
- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yusufekorman/blockchain-vote
cd blockchain-vote
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

1. Start the seed node (central node):
```bash
node seed.ts
```

2. Start voting nodes (can run multiple instances):
```bash
node index.ts 3001
node index.ts 3002
# Add more nodes as needed
```

3. Access the voting interface:
- Open `http://localhost:3002` in your web browser (port = node port + 1)
- Each node will run on a different port (3002, 3003, etc.)

## How It Works

1. **Blockchain Structure:**
   - Each vote is stored as a block in the blockchain
   - Blocks are cryptographically linked using SHA-256 hashing
   - The system maintains consensus across all nodes

2. **Voting Process:**
   - Users provide their ID for authentication
   - System prevents double voting using cryptographic hashing
   - Votes are immediately propagated to all nodes
   - Real-time results are available to all participants

3. **Network Architecture:**
   - Seed node acts as the initial point of contact
   - P2P network ensures decentralized operation
   - New nodes automatically sync with existing blockchain

## Security Features

- Cryptographic hashing of voter IDs
- Immutable blockchain ledger
- Prevention of double voting
- Decentralized vote storage
- Real-time vote verification

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with modern web technologies
- Inspired by blockchain principles
- Focused on security and transparency