const MESSAGES_PER_PAGE = 20;

/**
 * Calculate total number of pages needed for the given message count
 * @param {number} messageCount - Total number of messages
 * @returns {number} Total pages needed (minimum 1)
 */
export function calculateTotalPages(messageCount) {
  if (messageCount === 0) return 1;
  return Math.ceil(messageCount / MESSAGES_PER_PAGE);
}

/**
 * Get messages for a specific page
 * @param {Array} messages - Array of all messages
 * @param {number} pageNumber - Page number (1-indexed)
 * @returns {Array} Messages for the requested page
 */
export function getPaginatedMessages(messages, pageNumber) {
  // Treat invalid/zero/negative pages as page 1
  const page = pageNumber <= 0 ? 1 : pageNumber;

  const startIndex = (page - 1) * MESSAGES_PER_PAGE;
  const endIndex = startIndex + MESSAGES_PER_PAGE;

  // Return empty array if page is beyond available data
  if (startIndex >= messages.length && messages.length > 0) {
    return [];
  }

  return messages.slice(startIndex, endIndex);
}
