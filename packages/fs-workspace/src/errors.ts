export class FsWorkspaceError extends Error {
  constructor(
    public readonly code:
      | 'invalid_path'
      | 'path_traversal'
      | 'not_found'
      | 'is_directory'
      | 'too_large',
    message: string,
  ) {
    super(message)
    this.name = 'FsWorkspaceError'
  }
}
