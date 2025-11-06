import { User } from 'firebase/auth';

// List of super admin email addresses
const ADMIN_EMAILS = [
  'mgzobel@icloud.com',
  'kenergizer@mac.com'
];

/**
 * Check if a user is a super admin
 * @param user - Firebase User object
 * @returns true if user is admin, false otherwise
 */
export function isAdmin(user: User | null): boolean {
  if (!user || !user.email) {
    return false;
  }
  return ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
}

/**
 * Get list of admin emails
 */
export function getAdminEmails(): string[] {
  return ADMIN_EMAILS;
}


