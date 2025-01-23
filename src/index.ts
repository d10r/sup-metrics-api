import express from 'express';
import cors from 'cors';
import { config } from './config';
import {
  getHolderCount,
  updateHolderCount,
  getDelegatedAmount,
  updateDelegatedAmount,
  getVotingPower,
  getDelegateForUser
} from './metrics';
import { isAddress } from 'viem';

const app = express();

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get('/holders', (req, res) => {
  const { holderCount, lastUpdatedAt } = getHolderCount();
  res.json({ holderCount, lastUpdatedAt });
});

app.get('/delegated_amount', (req, res) => {
  const { delegatedAmount, lastUpdatedAt } = getDelegatedAmount();
  res.json({ delegatedAmount, lastUpdatedAt });
});

app.get('/user_amount', async (req, res) => {
  const address = (req.query.address as string).toLowerCase();

  if (!isAddress(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  try {
    const amount = await getVotingPower(address);
    res.json({
      amount,
      timestamp: Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    console.error('Error getting user amount');
    res.status(500).json({ error: 'Failed to get user amount' });
  }
});

app.get('/user_delegate', async (req, res) => {
  const address = (req.query.address as string)?.toLowerCase();

  if (!isAddress(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  try {
    const delegate = await getDelegateForUser(address);
    res.json({
      delegate,
      timestamp: Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    console.error('Error getting user delegate');
    res.status(500).json({ error: 'Failed to get user delegate' });
  }
});

const createPeriodicTask = (
  name: string,
  task: () => Promise<void>,
  intervalMs: number
) => {
  const runTask = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`Error during ${name}:`, error);
    } finally {
      setTimeout(runTask, intervalMs);
    }
  };
  return runTask;
};

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  
  // Start holder count updates
  const updateHolders = createPeriodicTask(
    'Update Holder Count',
    updateHolderCount,
    config.holdersUpdateInterval * 1000
  );
  updateHolders();
  
  // Start delegated amount updates
  const updateDelegated = createPeriodicTask(
    'Update Delegated Amount',
    updateDelegatedAmount,
    config.delegatedAmountUpdateInterval * 1000
  );
  updateDelegated();
  
  // Additional periodic tasks can be started here as needed
}); 