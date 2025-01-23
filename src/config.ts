import dotenv from 'dotenv';

dotenv.config();

export const config = {
  tokenAddress: process.env.TOKEN_ADDRESS || '',
  rpcNodeUrl: process.env.RPC_NODE_URL || '',
  subgraphNodeUrl: process.env.SUBGRAPH_NODE_URL || '',
  port: parseInt(process.env.PORT || '3000', 10),
  updateIntervalMs: parseInt(process.env.UPDATE_INTERVAL_MS || '60000', 10),
}; 