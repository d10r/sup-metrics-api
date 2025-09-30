# SUP Metrics API

A TypeScript API service that provides near-real-time metrics for the SUP token ecosystem on Ethereum and Base. The service tracks voting power, delegation data, and token distribution across various categories.

## Features

- **DAO Member Metrics**: Count and list DAO members with voting power and delegation information
- **Voting Power Calculation**: Real-time snapshot-based voting power calculations using locker balances and delegation strategies
- **Distribution Tracking**: Comprehensive SUP token distribution metrics across lockers, staking, treasury accounts, and more
- **Delegation Management**: Track delegation relationships and delegated voting power
- **Background Updates**: Periodic data refresh with configurable intervals

## API Endpoints

- `GET /v1/dao_members_count` - Number of DAO members
- `GET /v1/dao_members` - List of DAO members with voting power and delegation info
- `GET /v1/total_delegated_score` - Total delegated voting power across all delegates
- `GET /v1/user_score` - Individual user's voting power (own + delegated)
- `GET /v1/user_delegate` - Get delegate for a specific user
- `GET /v1/total_score` - Total score based on flow distributions
- `GET /v1/distribution_metrics` - SUP token distribution breakdown
- `GET /v1/config` - API configuration
- `GET /docs` - Swagger API documentation

## Technology Stack

- **TypeScript** with Express.js
- **Viem** for blockchain interactions
- **Snapshot.js** for voting power calculations
- **TSOA** for API documentation and validation
- **Subgraphs** for indexed chain data

## Configuration

The service requires environment variables for RPC endpoints and subgraph URLs.
See `src/config.ts` for supported required and optional environment variables.

## Development

```bash
npm install
npm run dev    # Development with hot reload
npm run build  # Build for production
npm start      # Run production build
```

## Data Sources

- Superfluid Protocol subgraph (Base)
- SUP Token subgraph (Base) 
- Snapshot delegation subgraph (Base)
- Snapshot hub API
- Snapshot score API
- Vesting subgraph (Base)
- RPC endpoints (Ethereum and Base)