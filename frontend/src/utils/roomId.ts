/**
 * Normalize room ID by trimming whitespace
 * This ensures consistent room identification across all operations
 */
export function normalizeRoomId(roomId: string): string {
  return roomId.trim();
}
