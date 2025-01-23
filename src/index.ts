import express from 'express';
import { config } from './config';
import {
  getHolderCount,
  updateHolderCount,
  getDelegatedAmount,
  updateDelegatedAmount
} from './metrics';

const app = express();

app.get('/holders', (req, res) => {
  const { holderCount, lastUpdatedAt } = getHolderCount();
  res.json({ holderCount, lastUpdatedAt });
});

app.get('/delegated_amount', (req, res) => {
  const { delegatedAmount, lastUpdatedAt } = getDelegatedAmount();
  res.json({ delegatedAmount, lastUpdatedAt });
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