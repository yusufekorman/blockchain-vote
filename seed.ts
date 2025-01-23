import WebSocket, { WebSocketServer } from 'ws';
import * as crypto from "crypto";

interface PeerInfo {
    address: string;
    lastSeen: number;
}

class Block {
    public hash: string;
    public nonce: number;

    constructor(
        public index: number,
        public timestamp: number,
        public data: any,
        public previousHash: string = ""
    ) {
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash(): string {
        return crypto
            .createHash("sha256")
            .update(
                this.index +
                this.timestamp +
                JSON.stringify(this.data) +
                this.previousHash +
                this.nonce
            )
            .digest("hex");
    }

    mineBlock(difficulty: number): void {
        while (
            this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")
        ) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        console.log(`Block mined: ${this.hash}`);
    }
}

class Blockchain {
    public chain: Block[];
    private difficulty: number = 2;

    constructor() {
        this.chain = [this.createGenesisBlock()];
    }

    private createGenesisBlock(): Block {
        const block = new Block(0, Date.now(), "Genesis Block", "0");
        block.mineBlock(this.difficulty);
        return block;
    }

    getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock: Block): void {
        newBlock.previousHash = this.getLatestBlock().hash;
        newBlock.mineBlock(this.difficulty);
        this.chain.push(newBlock);
    }
}

class SeedNode {
    private peers: Map<string, PeerInfo> = new Map();
    private server: WebSocketServer;
    private blockchain: Blockchain;
    private processedBlocks: Set<string> = new Set();

    constructor(port: number) {
        this.server = new WebSocketServer({ port });
        console.log(`Seed node running on: ws://localhost:${port}`);
        
        this.blockchain = new Blockchain();
        const genesisBlock = this.blockchain.chain[0];
        this.markBlockAsProcessed(genesisBlock);
        console.log("Genesis block created:", genesisBlock);
        
        this.initializeServer();
    }

    private isBlockProcessed(block: Block): boolean {
        const blockId = `${block.index}-${block.hash}`;
        return this.processedBlocks.has(blockId);
    }

    private markBlockAsProcessed(block: Block): void {
        const blockId = `${block.index}-${block.hash}`;
        this.processedBlocks.add(blockId);
    }

    private initializeServer(): void {
        this.server.on('connection', (socket: WebSocket) => {
            console.log('New connection received');

            const genesisBlock = this.blockchain.chain[0];
            console.log('Sending genesis block to new peer:', genesisBlock);
            socket.send(JSON.stringify({
                type: 'genesis_block',
                block: genesisBlock
            }));

            socket.on('message', (message: string) => {
                try {
                    const data = JSON.parse(message.toString());
                    console.log('Received message type:', data.type);
                    
                    switch (data.type) {
                        case 'register':
                            this.registerPeer(data.address);
                            socket.send(JSON.stringify({
                                type: 'genesis_block',
                                block: genesisBlock
                            }));
                            this.broadcastPeerList();
                            break;
                            
                        case 'new_block':
                            const newBlock = new Block(
                                data.block.index,
                                data.block.timestamp,
                                data.block.data,
                                data.block.previousHash
                            );
                            newBlock.hash = data.block.hash;
                            newBlock.nonce = data.block.nonce;

                            // Blok daha önce işlenmediyse ekle
                            if (!this.isBlockProcessed(newBlock)) {
                                console.log("Processing new block:", newBlock.index);
                                this.blockchain.addBlock(newBlock);
                                this.markBlockAsProcessed(newBlock);
                                
                                // Sadece yeni işlenen blokları ilet
                                this.broadcastToAllPeers({
                                    type: 'new_block',
                                    block: newBlock
                                });
                            } else {
                                console.log("Block already processed, skipping:", newBlock.index);
                            }
                            break;
                            
                        default:
                            console.log('Unknown message type:', data.type);
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                }
            });

            socket.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            socket.on('close', () => {
                console.log('Client disconnected');
                // Peer listesini güncelle ve yayınla
                this.peers.forEach((peer, address) => {
                    if (Date.now() - peer.lastSeen > 30000) { // 30 saniye
                        this.peers.delete(address);
                    }
                });
                this.broadcastPeerList();
            });
        });
    }

    private registerPeer(address: string): void {
        this.peers.set(address, {
            address,
            lastSeen: Date.now()
        });
        console.log(`Peer registered: ${address}`);
    }

    private broadcastPeerList(): void {
        const peerList = Array.from(this.peers.keys());
        const message = JSON.stringify({
            type: 'peers',
            data: peerList
        });

        this.broadcastToAllPeers(message);
        console.log('Peer list broadcasted:', peerList);
    }

    private broadcastToAllPeers(message: any): void {
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        this.server.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    stop(): void {
        this.server.close();
    }
}

// Start seed node
const SEED_PORT = 4000;
const seedNode = new SeedNode(SEED_PORT);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down seed node...');
    seedNode.stop();
    process.exit(0);
});