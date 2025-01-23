import WebSocket, { WebSocketServer } from "ws";
import * as crypto from "crypto";
import express from "express";
import type { Express, Request, Response } from "express";
import { networkInterfaces } from "os";
import { argv } from "process";

const app: Express = express();
app.use(express.json());

// Helper function to detect IP address
function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;

    for (const net of interfaces) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (!net.internal && net.family === "IPv4") {
        return net.address;
      }
    }
  }
  return "localhost"; // Fallback
}

class Block {
  constructor(
    public index: number,
    public timestamp: number,
    public data: any,
    public previousHash: string = "",
    public hash: string = "",
    public nonce: number = 0
  ) {
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
    console.log(`Block successfully mined: ${this.hash}`);
  }
}

class Blockchain {
  public chain: Block[] = [];
  public difficulty: number = 2;

  constructor() {
    this.chain = [this.createGenesisBlock()];
  }

  private createGenesisBlock(): Block {
    return new Block(0, Date.now(), "Genesis Block", "0");
  }

  getLatestBlock(): Block {
    return this.chain[this.chain.length - 1];
  }

  addBlock(newBlock: Block): boolean {
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty);
    this.chain.push(newBlock);
    console.log("New block added to chain.");
    return true;
  }

  isChainValid(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }
}

class Node {
  private blockchain: Blockchain;
  private peers: Set<WebSocket> = new Set();
  private knownPeers: Set<string> = new Set();
  private nodeAddress: string;
  private hasGenesisBlock: boolean = false;
  private processedBlocks: Set<string> = new Set(); // İşlenmiş blokları takip etmek için

  public getBlockchain(): Block[] {
    return this.blockchain.chain;
  }

  constructor(public port: number, public seedUrl: string) {
    const ipAddress = getLocalIpAddress();
    this.nodeAddress = `ws://${ipAddress}:${port}`;
    console.log(`Node address: ${this.nodeAddress}`);
    
    // Blockchain'i boş başlat, genesis block'u seed node'dan alacağız
    this.blockchain = new Blockchain();
    this.blockchain.chain = [];
    
    this.initializeWebSocketServer();
    this.connectToSeedNode();
  }

  private isBlockProcessed(block: Block): boolean {
    const blockId = `${block.index}-${block.hash}`;
    return this.processedBlocks.has(blockId);
  }

  private markBlockAsProcessed(block: Block): void {
    const blockId = `${block.index}-${block.hash}`;
    this.processedBlocks.add(blockId);
  }

  private initializeWebSocketServer(): void {
    const server = new WebSocketServer({ port: this.port });
    console.log(`Node WebSocket server running on port ${this.port}`);

    server.on("connection", (socket: any) => {
      console.log("New peer connected.");
      this.peers.add(socket);

      socket.on("message", (message: any) => {
        const stringMessage = message.toString();
        this.handleMessage(stringMessage, socket);
      });

      socket.on("close", () => {
        console.log("Peer connection closed.");
        this.peers.delete(socket);
      });
    });
  }

  private connectToSeedNode(): void {
    if (!this.seedUrl) {
      console.log("No seed URL provided, skipping seed node connection");
      return;
    }

    console.log(`Connecting to seed node: ${this.seedUrl}`);
    const socket = new WebSocket(this.seedUrl);

    socket.on("open", () => {
      console.log(`Connected to seed node: ${this.seedUrl}`);
      // Send our address to seed node
      socket.send(
        JSON.stringify({
          type: "register",
          address: this.nodeAddress,
        })
      );
    });

    socket.on("message", (message: any) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        console.log("Received message from seed node:", parsedMessage.type);
        this.handleMessage(message.toString(), socket);
      } catch (error) {
        console.error("Error parsing message from seed node:", error);
      }
    });

    socket.on("error", (error: any) => {
      console.error("Seed node connection error:", error);
    });

    socket.on("close", () => {
      console.log("Seed node connection closed, attempting to reconnect in 5 seconds...");
      setTimeout(() => this.connectToSeedNode(), 5000);
    });
  }

  private connectToPeer(address: string): void {
    const socket = new WebSocket(address);

    socket.on("open", () => {
      console.log(`Connected to: ${address}`);
      this.peers.add(socket);
    });

    socket.on("message", (message: any) => {
      const stringMessage = message.toString();
      this.handleMessage(stringMessage, socket);
    });

    socket.on("close", () => {
      console.log(`Peer connection closed: ${address}`);
      this.peers.delete(socket);
    });
  }

  private handleMessage(message: string, socket: WebSocket): void {
    try {
      const parsedMessage = JSON.parse(message);
      console.log("Message received:", parsedMessage.type);

      switch (parsedMessage.type) {
        case "genesis_block":
          if (!this.hasGenesisBlock) {
            console.log("Received genesis block");
            const genesisBlock = new Block(
              parsedMessage.block.index,
              parsedMessage.block.timestamp,
              parsedMessage.block.data,
              parsedMessage.block.previousHash
            );
            genesisBlock.hash = parsedMessage.block.hash;
            genesisBlock.nonce = parsedMessage.block.nonce;
            
            this.blockchain.chain = [genesisBlock];
            this.hasGenesisBlock = true;
            this.markBlockAsProcessed(genesisBlock);
            console.log("Genesis block set:", genesisBlock);
          }
          break;
          
        case "new_block":
          if (this.hasGenesisBlock) {
            const newBlock = new Block(
              parsedMessage.block.index,
              parsedMessage.block.timestamp,
              parsedMessage.block.data,
              parsedMessage.block.previousHash
            );
            newBlock.hash = parsedMessage.block.hash;
            newBlock.nonce = parsedMessage.block.nonce;

            // Blok daha önce işlenmediyse ekle
            if (!this.isBlockProcessed(newBlock)) {
              console.log("Processing new block:", newBlock.index);
              this.blockchain.addBlock(newBlock);
              this.markBlockAsProcessed(newBlock);
              
              // Sadece yeni işlenen blokları ilet
              this.broadcastMessage({
                type: "new_block",
                block: newBlock
              }, socket);
            } else {
              console.log("Block already processed, skipping:", newBlock.index);
            }
          }
          break;
          
        case "peers":
          console.log("Received peer list:", parsedMessage.data);
          parsedMessage.data.forEach((peer: string) => {
            if (!this.knownPeers.has(peer) && peer !== this.nodeAddress) {
              this.knownPeers.add(peer);
              this.connectToPeer(peer);
            }
          });
          break;
          
        default:
          console.log("Unknown message type:", parsedMessage.type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  private broadcastMessage(message: any, excludeSocket?: WebSocket): void {
    const messageStr = JSON.stringify(message);
    this.peers.forEach(peer => {
      if (peer !== excludeSocket && peer.readyState === WebSocket.OPEN) {
        peer.send(messageStr);
      }
    });
  }

  addData(data: any): void {
    if (!this.hasGenesisBlock) {
      console.error("Cannot add data: Genesis block not received yet");
      return;
    }
    
    const newBlock = new Block(
      this.blockchain.chain.length,
      Date.now(),
      data
    );
    this.blockchain.addBlock(newBlock);
    this.markBlockAsProcessed(newBlock);
    
    // Yeni bloğu diğer node'lara bildir
    this.broadcastMessage({
      type: "new_block",
      block: newBlock
    });
  }

  private broadcast(message: any): void {
    this.peers.forEach((peer) => peer.send(JSON.stringify(message)));
  }
}

interface Candidate {
  id: string;
  name: string;
}

const candidates: Candidate[] = [
  { id: "1", name: "Candidate 1" },
  { id: "2", name: "Candidate 2" },
  { id: "3", name: "Candidate 3" }
];

const localPort = argv[2] ? parseInt(argv[2]) : 3001;
const seedUrl = "ws://localhost:4000";
const node = new Node(localPort, seedUrl);

app.use(express.static("."));

app.get("/details", (req: Request, res: Response) => {
  res.json({ candidates });
});

app.post("/vote", (req: Request, res: Response) => {
  const { userIdentifier, candidateId } = req.body;

  if (!userIdentifier || !candidateId) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields" 
    });
  }

  if (!candidates.some(candidate => candidate.id === candidateId)) return res.status(400).json({ success: false, error: "Invalid candidate ID" });

  const userIdentifierHash = crypto.createHash("sha256").update(userIdentifier).digest("hex");

  // userIdentifierHash ile başka oy varmı?
  if (node.getBlockchain().some(block => block.data && block.data.type === "vote" && block.data.userIdentifierHash === userIdentifierHash)) return res.status(400).json({ success: false, error: "You have already voted" });

  try {
    node.addData({
      type: "vote",
      userIdentifierHash,
      candidateId,
      timestamp: Date.now()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: "Failed to record vote" 
    });
  }
});

app.get("/results", (req: Request, res: Response) => {
  const results: { [key: string]: number } = {};
  
  candidates.forEach(candidate => {
    results[candidate.id] = 0;
  });

  const chain = node.getBlockchain();
  chain.forEach(block => {
    if (block.data && block.data.type === "vote") {
      const candidateId = block.data.candidateId;
      if (results.hasOwnProperty(candidateId)) {
        results[candidateId]++;
      }
    }
  });

  res.json(results);
});
/*
app.get("/blocks", (req: Request, res: Response) => {
  res.json(node.getBlockchain());
});
*/
app.listen(localPort + 1, () => {
  console.log(`Node HTTP server running on port ${localPort + 1}`);
});
