/**
 * Response for DAO members count endpoint
 */
export interface DaoMembersCountResponse {
  /** Number of DAO members */
  daoMembersCount: number;
  /** Unix timestamp of last update */
  lastUpdatedAt: number;
}

/**
 * Response for total delegated score endpoint
 */
export interface TotalDelegatedScoreResponse {
  /** Total delegated score */
  totalDelegatedScore: number;
  /** Unix timestamp of last update */
  lastUpdatedAt: number;
}

/**
 * Response for user score endpoint
 */
export interface UserScoreResponse {
  /** User's snapshot score */
  score: number;
  /** Unix timestamp of the query */
  timestamp: number;
}

/**
 * Response for user delegate endpoint
 */
export interface UserDelegateResponse {
  /** Delegate's address or null if not delegated */
  delegate: string | null;
  /** Unix timestamp of the query */
  timestamp: number;
} 