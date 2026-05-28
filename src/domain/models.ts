export interface WebAuthSession {
  enabled: boolean;
  configured: boolean;
  required: boolean;
  authenticated: boolean;
  clientId: string;
  allowedDomains: string[];
  userId: string;
  userName: string;
  userEmail: string;
  pictureUrl: string;
  hostedDomain: string;
  expiresAt: string;
  role: string;
  projectIds: string[];
}

export interface AccessUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  projectIds: string[];
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
