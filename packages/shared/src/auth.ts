export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/** The authenticated principal attached to every API request. */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
}
